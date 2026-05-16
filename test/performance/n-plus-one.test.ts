/**
 * N+1 / query-count regression tests (integration mode — REAL test DB).
 *
 * Each hotspot service is seeded with a representative data volume, then run
 * through `countQueries`. The assertion is that the query count stays BELOW a
 * ceiling that is independent of row count — an N+1 would make the count scale
 * with the seed, blowing the ceiling. Thresholds come from `baseline.json`;
 * they ratchet (tighten on improvement) and must never be loosened silently.
 *
 * Only `@/lib/auth` is mocked — services with no auth path run untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { countQueries } from "./query-count.helper";
import { seedPerfData, closePerfSeed, type PerfSeed } from "./seed-perf-data";
import baseline from "./baseline.json";

import { getProjectDashboard } from "@/lib/du-an/dashboard-service";
import { querySummary } from "@/lib/ledger/ledger-aggregations";
import { aggregateMonth } from "@/lib/payment/payment-service";
import { listTasksForBoard } from "@/lib/task/task-service";

let seed: PerfSeed;

beforeAll(async () => {
  await truncateAll();
  seed = await seedPerfData();
  mockSession({ id: seed.userId, role: "admin" });
}, 60_000);

afterAll(async () => {
  await closeTestDb();
  await closePerfSeed();
});

describe("N+1 query-count regression", () => {
  it("harness counts a known single query", async () => {
    const { queryCount } = await countQueries(() =>
      querySummary("material", { entityId: seed.ledgerEntityId }),
    );
    // querySummary is one $queryRaw — proves the harness counts at all.
    expect(queryCount).toBeGreaterThan(0);
  });

  it("getProjectDashboard — constant queries regardless of row volume", async () => {
    const { queryCount } = await countQueries(() =>
      getProjectDashboard(seed.focusProjectId),
    );
    expect(queryCount).toBeLessThanOrEqual(baseline.dashboard);
  });

  it("ledger querySummary — single aggregate query", async () => {
    const { queryCount } = await countQueries(() =>
      querySummary("material", { entityId: seed.ledgerEntityId }),
    );
    expect(queryCount).toBeLessThanOrEqual(baseline.ledgerSummary);
  });

  it("payment aggregateMonth — bounded queries", async () => {
    const { result, queryCount } = await countQueries(() =>
      aggregateMonth(seed.paymentMonth),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(queryCount).toBeLessThanOrEqual(baseline.aggregateMonth);
  });

  it("task listTasksForBoard — constant queries (no per-task lookup)", async () => {
    const { queryCount } = await countQueries(() =>
      listTasksForBoard({ deptId: seed.deptId }),
    );
    expect(queryCount).toBeLessThanOrEqual(baseline.taskBoard);
  });
});
