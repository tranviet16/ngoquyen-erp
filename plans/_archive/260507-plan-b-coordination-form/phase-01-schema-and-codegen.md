---
phase: 1
title: "Schema + migration + code generator"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Schema + migration + code generator

## Overview
Add `CoordinationForm` + `CoordinationFormApproval` Prisma models, write SQL migration, implement `nextFormCode()` helper.

## Requirements

- Functional: hai bảng mới + UNIQUE index trên `code`
- Non-functional: code generator phải an toàn với concurrency thấp (≤10 phiếu/phút)

## Architecture

`CoordinationForm` là root entity. `CoordinationFormApproval` lưu lịch sử mỗi lần approve/reject (append-only). 1 form có thể có nhiều approval rows (vd: leader approve → director reject_revise → creator resubmit → leader approve lần 2 → director approve lần cuối = 4 rows).

Code generator: monthly counter, dùng `SELECT count(*) FROM coordination_forms WHERE code LIKE 'PCV-202605-%'` trong 1 transaction + retry 1 lần khi UNIQUE collision.

## Related Code Files

- Modify: `prisma/schema.prisma` (thêm 2 models)
- Create: `prisma/migrations/20260507120000_add_coordination_forms/migration.sql`
- Create: `lib/coordination-form/code-generator.ts`

## Schema additions to `prisma/schema.prisma`

```prisma
model CoordinationForm {
  id             Int      @id @default(autoincrement())
  code           String   @unique
  creatorId      String
  creatorDeptId  Int
  executorDeptId Int
  content        String
  priority       String   @default("trung_binh")
  deadline       DateTime?
  status         String   @default("draft")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  submittedAt    DateTime?
  closedAt       DateTime?

  creator      User                       @relation("CFormCreator", fields: [creatorId], references: [id])
  creatorDept  Department                 @relation("CFormCreatorDept", fields: [creatorDeptId], references: [id])
  executorDept Department                 @relation("CFormExecutorDept", fields: [executorDeptId], references: [id])
  approvals    CoordinationFormApproval[]

  @@index([executorDeptId, status])
  @@index([creatorId])
  @@index([status])
  @@map("coordination_forms")
}

model CoordinationFormApproval {
  id         Int      @id @default(autoincrement())
  formId     Int
  step       String
  approverId String
  action     String
  comment    String?
  signedAt   DateTime @default(now())

  form     CoordinationForm @relation(fields: [formId], references: [id], onDelete: Cascade)
  approver User             @relation("CFormApprover", fields: [approverId], references: [id])

  @@index([formId])
  @@index([approverId])
  @@map("coordination_form_approvals")
}
```

**Modify `User` model** — add 2 reverse relations + `Department` 2 reverse relations:

```prisma
// in User
coordinationFormsCreated CoordinationForm[]         @relation("CFormCreator")
coordinationFormsApproved CoordinationFormApproval[] @relation("CFormApprover")

// in Department
coordinationFormsAsCreator  CoordinationForm[] @relation("CFormCreatorDept")
coordinationFormsAsExecutor CoordinationForm[] @relation("CFormExecutorDept")
```

## Migration SQL

```sql
CREATE TABLE "coordination_forms" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "creatorDeptId" INTEGER NOT NULL,
  "executorDeptId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'trung_binh',
  "deadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "coordination_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coordination_forms_code_key" ON "coordination_forms"("code");
CREATE INDEX "coordination_forms_executorDeptId_status_idx" ON "coordination_forms"("executorDeptId","status");
CREATE INDEX "coordination_forms_creatorId_idx" ON "coordination_forms"("creatorId");
CREATE INDEX "coordination_forms_status_idx" ON "coordination_forms"("status");

ALTER TABLE "coordination_forms"
  ADD CONSTRAINT "coordination_forms_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "coordination_forms_creatorDeptId_fkey"
    FOREIGN KEY ("creatorDeptId") REFERENCES "departments"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "coordination_forms_executorDeptId_fkey"
    FOREIGN KEY ("executorDeptId") REFERENCES "departments"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE "coordination_form_approvals" (
  "id" SERIAL NOT NULL,
  "formId" INTEGER NOT NULL,
  "step" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coordination_form_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coordination_form_approvals_formId_idx" ON "coordination_form_approvals"("formId");
CREATE INDEX "coordination_form_approvals_approverId_idx" ON "coordination_form_approvals"("approverId");

ALTER TABLE "coordination_form_approvals"
  ADD CONSTRAINT "coordination_form_approvals_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "coordination_forms"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT "coordination_form_approvals_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
```

## `lib/coordination-form/code-generator.ts`

```ts
import { prisma } from "@/lib/prisma";

const PREFIX = "PCV";

export async function nextFormCode(now: Date = new Date()): Promise<string> {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pattern = `${PREFIX}-${yyyymm}-%`;
  // count + 1 → simple approach. Caller handles UNIQUE collision via retry.
  const count = await prisma.coordinationForm.count({
    where: { code: { startsWith: `${PREFIX}-${yyyymm}-` } },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${PREFIX}-${yyyymm}-${seq}`;
}
```

Caller pattern (sẽ dùng ở Phase 2):
```ts
for (let i = 0; i < 3; i++) {
  try {
    const code = await nextFormCode();
    return await prisma.coordinationForm.create({ data: { code, ... } });
  } catch (e) {
    if (isUniqueViolation(e) && i < 2) continue;
    throw e;
  }
}
```

## Implementation Steps

1. Edit `prisma/schema.prisma` — add 2 models + 4 reverse relations
2. Create migration folder + SQL
3. Run `npx prisma migrate deploy` + `npx prisma generate`
4. Create `lib/coordination-form/code-generator.ts`
5. Verify: `npx tsc --noEmit` clean
6. Verify DB: `\d coordination_forms`, `\d coordination_form_approvals`

## Success Criteria

- [ ] Migration applied trên dev DB
- [ ] Prisma client regenerated, `prisma.coordinationForm` accessible
- [ ] `npx tsc --noEmit` pass
- [ ] `nextFormCode()` trả về `PCV-202605-001` khi DB rỗng

## Risk Assessment

- **Race trong code generator:** 2 user gọi `nextFormCode()` đồng thời → cùng nhận `PCV-202605-001` → 1 fail UNIQUE. Mitigation: caller retry. Acceptable cho admin tool tần suất thấp.
- **Year boundary:** chuyển tháng → counter reset. OK theo design.
- **No SKIP_AUDIT entry needed** — auto audit từ `lib/prisma.ts`.
