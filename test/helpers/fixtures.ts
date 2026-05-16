/**
 * Typed factory builders for integration tests. Each returns a valid Prisma
 * `data` object with sane defaults; pass `overrides` to vary fields.
 *
 * IDs that the DB autogenerates (Project/PaymentRound/Task) are omitted — let
 * Prisma assign them. User ids are cuid-like strings the caller controls.
 */
import type { Prisma } from "@prisma/client";

let seq = 0;
const uniq = () => `${Date.now()}-${++seq}`;

export function makeUser(
  overrides: Partial<Prisma.UserCreateInput> = {},
): Prisma.UserCreateInput {
  const u = uniq();
  return {
    id: `user-${u}`,
    name: `Test User ${u}`,
    email: `user-${u}@test.local`,
    role: "viewer",
    ...overrides,
  };
}

export function makeProject(
  overrides: Partial<Prisma.ProjectCreateInput> = {},
): Prisma.ProjectCreateInput {
  const u = uniq();
  return {
    code: `P-${u}`,
    name: `Test Project ${u}`,
    status: "active",
    ...overrides,
  };
}

export function makePaymentRound(
  createdById: string,
  overrides: Partial<Prisma.PaymentRoundUncheckedCreateInput> = {},
): Prisma.PaymentRoundUncheckedCreateInput {
  return {
    month: "2026-05",
    sequence: 1,
    status: "draft",
    createdById,
    ...overrides,
  };
}

export function makeTask(
  args: { creatorId: string; deptId: number },
  overrides: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Prisma.TaskUncheckedCreateInput {
  const u = uniq();
  return {
    title: `Test Task ${u}`,
    status: "todo",
    priority: "trung_binh",
    deptId: args.deptId,
    creatorId: args.creatorId,
    ...overrides,
  };
}
