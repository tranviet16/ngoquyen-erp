/**
 * Test fixture: role → module-permission matrix.
 *
 * Mirrors `scripts/seed-roles.ts` exactly — the seed was written to reproduce
 * the legacy role-fallback behaviour, so any test that previously relied on the
 * hardcoded fallback matrix keeps identical results when driven by this data.
 *
 * NOT a test file (no `.test.ts` suffix) — never collected by Vitest.
 */

type PermRow = { moduleKey: string; level: string };

export const ROLE_PERMISSION_SEED: Record<string, PermRow[]> = {
  admin: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" },
    { moduleKey: "du-an", level: "edit" },
    { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" },
    { moduleKey: "cong-no-nc", level: "edit" },
    { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "edit" },
    { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
    { moduleKey: "master-data", level: "admin" },
    { moduleKey: "sl-dt", level: "admin" },
    { moduleKey: "tai-chinh", level: "admin" },
    { moduleKey: "admin.import", level: "admin" },
    { moduleKey: "admin.phong-ban", level: "admin" },
    { moduleKey: "admin.nguoi-dung", level: "admin" },
    { moduleKey: "admin.permissions", level: "admin" },
  ],
  ketoan: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" },
    { moduleKey: "du-an", level: "edit" },
    { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" },
    { moduleKey: "cong-no-nc", level: "edit" },
    { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "edit" },
    { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  chihuy_ct: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" },
    { moduleKey: "du-an", level: "edit" },
    { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" },
    { moduleKey: "cong-no-nc", level: "edit" },
    { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "edit" },
    { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  canbo_vt: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" },
    { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" },
    { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "edit" },
    { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  viewer: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
  ],
};

/**
 * Drop-in mock for `prisma.rolePermission.findMany({ where: { roleId } })`.
 * Stateless — safe to reference from a `vi.mock` factory and immune to
 * `vi.resetAllMocks()`.
 */
export function rolePermissionFindMany(args?: {
  where?: { roleId?: string };
}): Promise<PermRow[]> {
  const roleId = args?.where?.roleId ?? "";
  return Promise.resolve(ROLE_PERMISSION_SEED[roleId] ?? []);
}
