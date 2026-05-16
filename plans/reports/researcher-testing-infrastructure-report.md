# Testing Infrastructure Report: Next.js 16 + Vitest 4.1.5 + Playwright 1.59.1

**Research Date:** 2026-05-16  
**Project:** Vietnamese Construction ERP  
**Stack:** Next.js 16.2.4 (App Router + Turbopack), Vitest 4.1.5, Playwright 1.59.1, Prisma 7.8, better-auth 1.6.9

---

## 1. Vitest 4 Configuration for Next.js 16

### Core Setup: `vitest.config.mts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    // Environment isolation: split by test type
    environment: 'node', // Default; override per-test for jsdom
    globals: true,
    
    // Setup & teardown
    setupFiles: ['./vitest.setup.ts'],
    
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '.next/'],
    },
    
    // Prisma environment (see section 2)
    poolOptions: {
      // Reuse same test DB connection per worker to avoid connection overhead
      threads: { singleThread: false },
    },
  },
  resolve: {
    alias: { '@': '/absolute/path/to/codebase' },
  },
});
```

**Key Notes:**
- **Node environment is default** for Prisma/database tests (CRITICAL).
- **jsdom only for React component tests** — not needed for Server Actions or service logic.
- Turbopack in dev doesn't affect Vitest (Vitest uses Vite, not Next's bundler).
- Path alias `@/` must use absolute path in Vitest config (differ from tsconfig `@/*`).

### Environment Split Strategy

**File: `vitest.setup.ts`**
```typescript
import { beforeAll, afterAll } from 'vitest';

// For integration tests that use Prisma: use real DB
// For unit tests of pure functions: no DB needed

// Global setup runs once per test session
beforeAll(async () => {
  // Seed test database (see section 2)
});

afterAll(async () => {
  // Cleanup if needed
});
```

**Test File Examples:**
```typescript
// Pure unit test → runs in node environment
// FILE: lib/task/regroup-swimlane.test.ts
import { describe, it, expect } from 'vitest';
import { regroupBySwimlane } from '../regroup-swimlane';

describe('regroupBySwimlane', () => {
  it('groups by assignee', () => {
    // No DB, no Prisma, no mocking needed
    expect(regroupBySwimlane({...})).toEqual([...]);
  });
});
```

```typescript
// Integration test → node + real Prisma + transaction rollback
// FILE: lib/department-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDepartment } from '../department-service';
import { prisma } from '../prisma';

let tx: any; // Transaction wrapper

beforeEach(async () => {
  // Start transaction for this test
  tx = await prisma.$transaction(async (client) => client);
});

afterEach(async () => {
  // Rollback: automatic with transaction wrapper
});

describe('createDepartment', () => {
  it('creates dept with unique code', async () => {
    const result = await createDepartment({ code: 'KT', name: 'Kế toán' });
    expect(result.id).toBeDefined();
  });
});
```

---

## 2. Testing Prisma Service Code: Transaction-Rollback Pattern

### Best Practice: Recommended Approach

**Use dedicated test database + transaction-rollback per test** (NOT mocking).

**Why:** Mocking Prisma makes tests pass when real DB would fail (e.g., unique constraint, foreign key). Real DB tests catch schema bugs, migration issues, and N+1 queries.

### Setup: Environment Plugin `vitest-environment-prisma-postgres`

**Install:**
```bash
npm install -D vitest-environment-prisma-postgres pg
```

**vitest.config.mts (updated):**
```typescript
export default defineConfig({
  test: {
    environment: 'prisma-postgres', // Custom environment
    environmentOptions: {
      database: process.env.TEST_DATABASE_URL || 
        'postgresql://test:test@localhost:5432/ngoquyyen_erp_test',
    },
  },
});
```

**`.env.test` (or CI override):**
```
TEST_DATABASE_URL="postgresql://test:test@localhost:5432/ngoquyyen_erp_test?schema=test_001"
```

### How It Works

1. **Global Setup (once per test session):**
   - Spin up test DB (or use existing).
   - Run `prisma migrate deploy` against test DB.
   - Seed test data once.

2. **Per-Test Isolation:**
   - Wrap each test in a Postgres transaction.
   - All Prisma queries run inside the transaction.
   - Rollback after test completes → DB returns to seeded state.

3. **Performance:**
   - Reduces 1401 tests from 3 hours to ~3 minutes (50x faster than truncate between tests).
   - No reseeding overhead.

### Manual Implementation (If Not Using Plugin)

**File: `vitest.setup.ts`**
```typescript
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const testDb = process.env.TEST_DATABASE_URL!;

beforeAll(async () => {
  // Run migrations
  execSync('prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDb },
  });

  // Seed test data
  const prisma = new PrismaClient({ datasourceUrl: testDb });
  await seedTestData(prisma);
  await prisma.$disconnect();
});
```

**Test Wrapper:**
```typescript
export function withTransaction(testFn: (prisma: PrismaClient) => Promise<void>) {
  return async () => {
    const prisma = new PrismaClient({ datasourceUrl: testDb });
    try {
      await prisma.$transaction(async (tx) => {
        // All queries in testFn() use tx, which rolls back
        await testFn(tx as any);
        // Throw error to force rollback
        throw new Error('Rollback');
      });
    } catch (e) {
      if ((e as any).message !== 'Rollback') throw e;
    } finally {
      await prisma.$disconnect();
    }
  };
}
```

**Usage:**
```typescript
it('creates and deletes dept', 
  withTransaction(async (tx) => {
    const dept = await tx.department.create({ data: {...} });
    expect(dept.id).toBeDefined();
    // Automatically rolled back after test
  })
);
```

---

## 3. Testing Server Actions: Avoid Direct Invocation

### Problem

Server Actions are encrypted closures in Next.js 16 — cannot be imported and called directly in tests.

### Solution: Extract Testable Logic Into Service Functions

**Pattern: Service + Action**

```typescript
// FILE: lib/department-service.ts (TESTABLE)
export async function createDepartment(data: { code: string; name: string }) {
  return await prisma.department.create({ data });
}
```

```typescript
// FILE: app/(app)/admin/phong-ban/actions.ts (NOT TESTED DIRECTLY)
"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createDepartment } from "@/lib/department-service";

async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (session?.user?.role !== "admin") throw new Error("Forbidden");
}

export async function createDepartmentAction(data: { code: string; name: string }) {
  await requireAdmin();
  return await createDepartment(data); // Call service, not action logic
}
```

**Test the service, not the action:**
```typescript
it('createDepartment validates code uniqueness', 
  withTransaction(async (tx) => {
    // Call service directly
    await createDepartment({ code: 'KT', name: 'Test' });
    
    // Verify constraint
    expect(
      createDepartment({ code: 'KT', name: 'Other' })
    ).rejects.toThrow('Unique constraint');
  })
);
```

### Testing Authorization in Server Actions (Alternative)

If you need to test the Server Action itself, use Playwright E2E instead (section 5).

---

## 4. better-auth in Tests: Mock Headers for Session

### Problem

`auth.api.getSession({ headers })` requires actual headers with session cookie. In unit tests, there's no browser/cookie.

### Solution: Mock `headers()` and Inject Test Session

**File: `vitest.setup.ts` (add):**
```typescript
import { vi } from 'vitest';
import { headers as nextHeaders } from 'next/headers';

// Mock next/headers module
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map()), // Default: empty headers
}));

// Helper to set session for a test
export async function withSession(user: any, testFn: () => Promise<void>) {
  const mockHeaders = vi.mocked(nextHeaders);
  
  // Create fake session cookie
  const sessionToken = 'test-session-' + Math.random();
  const cookieValue = `nqerp_session=${sessionToken}; ...`;
  
  mockHeaders.mockResolvedValue(
    new Map([['cookie', cookieValue]])
  );
  
  // Mock auth DB to return test user
  vi.spyOn(global, 'prisma' as any).mockImplementation(() => ({
    session: {
      findUnique: async () => ({
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      }),
    },
    user: {
      findUnique: async () => user,
    },
  }));
  
  await testFn();
  
  vi.resetAllMocks();
}
```

**Usage in Test:**
```typescript
it('requireAdmin throws if user not admin', async () => {
  await withSession(
    { id: 'u1', role: 'viewer' }, 
    async () => {
      expect(requireAdmin()).rejects.toThrow('Forbidden');
    }
  );
});

it('requireAdmin passes if user is admin', async () => {
  await withSession(
    { id: 'u1', role: 'admin' }, 
    async () => {
      expect(requireAdmin()).resolves.toBeUndefined();
    }
  );
});
```

### Better: Use Test Utilities from better-auth

better-auth 1.6.9 may have test utilities — check `better-auth/testing` module (fallback to manual mock above if not available).

---

## 5. Playwright E2E with better-auth: StorageState Fixtures

### Setup: `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Authenticated Fixture: `e2e/fixtures/auth.ts`

```typescript
import { test as base, expect } from '@playwright/test';
import { prisma } from '../../lib/prisma';
import { auth } from '../../lib/auth';

export const test = base.extend({
  authenticatedPage: async ({ page, browser }, use) => {
    // 1. Seed test user in DB
    const testUser = await prisma.user.upsert({
      where: { email: 'test@ngoquyyen.vn' },
      update: {},
      create: {
        email: 'test@ngoquyyen.vn',
        name: 'Test User',
        role: 'admin',
        emailVerified: true,
      },
    });

    // 2. Create session via better-auth
    const session = await auth.api.createSession({
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });

    // 3. Extract session cookie and store in storageState
    const cookies = [
      {
        name: 'nqerp_session', // Match better-auth cookiePrefix
        value: session.token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
      },
    ];

    // 4. Inject cookies into page
    await page.context().addCookies(cookies);

    // 5. Navigate to verify auth works
    await page.goto('/');
    await expect(page).toHaveURL('/admin'); // Redirect if authenticated

    await use(page);

    // Cleanup
    await prisma.user.delete({ where: { id: testUser.id } });
  },
});

export { expect };
```

### Usage: `e2e/admin.spec.ts`

```typescript
import { test, expect } from './fixtures/auth';

test('admin can create department', async ({ authenticatedPage: page }) => {
  await page.goto('/admin/phong-ban');
  await page.fill('[name="code"]', 'KT');
  await page.fill('[name="name"]', 'Kế toán');
  await page.click('button:has-text("Tạo")');
  
  await expect(page.locator('text=Kế toán')).toBeVisible();
});
```

### Multi-User Testing

```typescript
export const test = base.extend({
  asAdmin: async ({ page }, use) => {
    await authenticateAs(page, { role: 'admin' });
    await use(page);
  },
  
  asViewer: async ({ page }, use) => {
    await authenticateAs(page, { role: 'viewer' });
    await use(page);
  },
});

test('viewer cannot access admin panel', async ({ asViewer: page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL('/403');
});
```

---

## 6. GitHub Actions CI: Postgres + Migrations + Tests

### Workflow: `.github/workflows/test.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: ngoquyyen_erp_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      
      - name: Setup test database
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/ngoquyyen_erp_test
        run: |
          npx prisma migrate deploy
      
      - name: Run Vitest
        env:
          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/ngoquyyen_erp_test
        run: npm run test:unit
      
      - name: Run Playwright
        run: npm run test:e2e
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### package.json Scripts

```json
{
  "scripts": {
    "test:unit": "vitest run --coverage",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:e2e"
  }
}
```

### Caching Strategy

- **npm cache:** `actions/setup-node@v4` with `cache: npm` (automatic).
- **Prisma cache:** Prisma schema rarely changes; no special caching needed.
- **Playwright cache:** Add after first run: `~/.cache/ms-playwright` → ~200MB saved per run.

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-playwright-
```

---

## 7. Performance Testing: N+1 Detection & API Latency

### N+1 Detection in Tests

**Option A: Prisma Query Logging (Manual)**

```typescript
// vitest.setup.ts
const prisma = new PrismaClient({
  log: ['query'],
});

// Redirect query logs to test output
beforeEach(() => {
  const queries: string[] = [];
  const handler = (log: any) => {
    if (log.level === 'query') queries.push(log.message);
  };
  prisma.$on('beforeExit', () => {
    console.log(`Test executed ${queries.length} queries`);
    if (queries.length > QUERY_THRESHOLD) {
      console.warn('⚠️  Possible N+1: high query count');
    }
  });
});
```

**Option B: Use Assertion Library (Recommended)**

Install: `npm install -D prisma-query-count` (hypothetical; check actual npm registry).

```typescript
import { getQueryCount } from 'prisma-query-count';

it('fetches tasks without N+1', async () => {
  const count = await getQueryCount(async () => {
    return await prisma.task.findMany({
      include: { assignee: true, creator: true }, // Eager load
    });
  });
  
  expect(count).toBeLessThan(3); // 1 main + 2 includes = 3 queries max
});
```

### API Latency Assertions

```typescript
it('GET /api/tasks responds in <100ms', async ({ page }) => {
  const start = performance.now();
  const response = await page.request.get('/api/tasks');
  const duration = performance.now() - start;
  
  expect(response.ok()).toBeTruthy();
  expect(duration).toBeLessThan(100);
});
```

### Load Testing (Lightweight): k6 or autocannon

**k6 Script: `k6-load.js`**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:3000/api/tasks');
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

**Run:** `k6 run k6-load.js` (install: `brew install k6` or `npm install -g k6`).

**autocannon (faster setup):**
```bash
npm install -D autocannon
npx autocannon http://localhost:3000/api/tasks -c 10 -d 30
```

---

## 8. Security Testing: IDOR & Authz Bypass

### Automated Pattern: Cross-User Access Test

```typescript
describe('Authorization', () => {
  it('User cannot fetch other user\'s task', async () => {
    // Setup: Create task owned by user A
    const taskA = await prisma.task.create({
      data: { title: 'Secret', creatorId: 'user-a', deptId: 1 },
    });
    
    // Test: As user B, try to access
    const response = await authenticatedFetch('/api/tasks/' + taskA.id, {
      headers: { 'x-user-id': 'user-b' }, // Simulate user B
    });
    
    expect(response.status).toBe(403);
    expect(response.json()).not.toHaveProperty('data.title');
  });
});
```

### Automated Pattern: Enumerate Permissions

```typescript
// For each role, test access to each endpoint
const roles = ['admin', 'manager', 'viewer'];
const endpoints = [
  { method: 'GET', path: '/api/tasks', public: false },
  { method: 'GET', path: '/api/health', public: true },
  { method: 'POST', path: '/api/tasks', public: false },
];

for (const role of roles) {
  for (const endpoint of endpoints) {
    test(`${role} → ${endpoint.method} ${endpoint.path}`, async () => {
      const user = await createTestUser(role);
      const response = await authenticatedFetch(endpoint.path, {
        method: endpoint.method,
        headers: { Authorization: `Bearer ${user.token}` },
      });
      
      if (endpoint.public || hasPermission(role, endpoint)) {
        expect([200, 201]).toContain(response.status);
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });
  }
}
```

### Limitations (Honest Assessment)

- **Cannot automate:** Semantic IDOR (e.g., "is this invoice mine?") — requires manual intent-based reasoning.
- **Can automate:** Syntactic checks (missing auth header, permission denied on restricted endpoint).
- **Gap:** Static scanners miss auth checks outside the route handler (middleware, service layer). Keep authorization checks close to the query.

### Best Practice: Centralize Authorization

```typescript
// lib/authorize.ts
export async function authorize(userId: string, resource: 'task' | 'department', resourceId: string, action: 'read' | 'write') {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  // Centralized, testable
  if (action === 'read') {
    // Check access
  }
}

// app/api/tasks/[id]/route.ts
export async function GET(req, { params }) {
  const userId = req.user.id;
  await authorize(userId, 'task', params.id, 'read'); // Always call
  
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  return Response.json(task);
}
```

**Test the authorization function:**
```typescript
it('authorize returns true for owner', async () => {
  const task = await prisma.task.create({ data: { creatorId: 'u1', ... } });
  expect(await authorize('u1', 'task', task.id, 'read')).toBe(true);
  expect(await authorize('u2', 'task', task.id, 'read')).toBe(false);
});
```

---

## Summary: Test Structure for This Codebase

```
lib/
├── department-service.ts         ← Test with Vitest + Prisma
├── task/
│   ├── task-service.ts          ← Test with Vitest + Prisma
│   └── __tests__/
│       └── task-service.test.ts
├── auth.ts                       ← Mock headers, session
└── rbac.ts                       ← Pure unit tests

app/
├── (app)/admin/phong-ban/
│   └── actions.ts               ← Call tested service; E2E test via Playwright
└── api/
    └── tasks/[id]/route.ts      ← Test with Vitest + mocked auth headers + Playwright E2E

__tests__/
├── unit/                         ← Pure logic, no DB
│   ├── format.test.ts
│   └── acl.test.ts
├── integration/                  ← Real Prisma + transaction rollback
│   ├── department-service.test.ts
│   └── task-service.test.ts
└── e2e/                          ← Playwright
    ├── admin.spec.ts
    └── fixtures/auth.ts
```

---

## Configuration Files to Create

1. **`vitest.config.mts`** — See section 1.
2. **`vitest.setup.ts`** — See sections 2 & 4.
3. **`playwright.config.ts`** — See section 5.
4. **`e2e/fixtures/auth.ts`** — See section 5.
5. **`.github/workflows/test.yml`** — See section 6.
6. **`__tests__/` directory structure** — See summary above.
7. **`.env.test`** — Test database URL.

---

## Version-Specific Notes

**Vitest 4.1.5:**
- ESM-first (no CommonJS quirks).
- `vitest/config` required (not `vite`).
- `globals: true` enables `describe`/`it` without imports.

**Next.js 16.2.4:**
- Turbopack doesn't affect Vitest (separate bundler).
- `headers()` is async; always await.
- `better-auth` 1.6.9+ supports Prisma adapter natively.

**Playwright 1.59.1:**
- `storageState` is stable for cookie-based auth.
- `project.dependencies` for sequential setup in multi-project mode.

**Prisma 7.8:**
- `$transaction` is stable; rollback pattern is production-ready.
- No special Vitest plugin built-in; use `vitest-environment-prisma-postgres` or manual wrapper.

---

## Unresolved Questions

1. **Prisma N+1 auto-detection:** No official library found; recommend manual query logging or adoption of `prisma-query-count` (if released).
2. **better-auth test utilities:** Confirm if `better-auth/testing` module exists in v1.6.9; fallback to header mocking in this report.
3. **IDOR automation scope:** Semantic IDOR (ownership verification) remains manual; this report covers syntactic checks only.

---

## References & Sources

- [Vitest + Next.js Testing Setup (Shashank Tripathi, 2026)](https://www.shsxnk.com/blog/vitest-nextjs-testing-infrastructure)
- [vitest-environment-prisma-postgres (GitHub)](https://github.com/codepunkt/vitest-environment-prisma-postgres)
- [Blazing Fast Prisma & Postgres Tests in Vitest (Codepunkt)](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/)
- [Next.js Server Actions Testing (MakerKit, 2026)](https://makerkit.dev/blog/tutorials/nextjs-server-actions)
- [Playwright Authentication (Official Docs)](https://playwright.dev/docs/auth)
- [GitHub Actions: PostgreSQL Service Containers (GitHub Docs)](https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers)
- [IDOR Prevention Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [Next.js Testing Guide (Official Docs)](https://nextjs.org/docs/app/guides/testing)
