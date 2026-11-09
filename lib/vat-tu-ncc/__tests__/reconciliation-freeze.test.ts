/**
 * Unit: đông cứng kỳ đối chiếu ghi MỌI thứ qua client transaction — UPDATE bỏ qua audit extension
 * (extension ghi audit bằng kết nối riêng, không rollback theo transaction) và dòng audit_logs được
 * ghi ngay trong transaction, nên commit import bị huỷ không để lại audit rác.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { isAuditBypassed } from "@/lib/async-context";
import { freezeReconciliationSnapshot, type ReconFreezeClient } from "@/lib/vat-tu-ncc/reconciliation-compute";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function fakeDb(opts: { importRunId?: number | null; userExists?: boolean; updatedCount?: number } = {}) {
  const bypassSeen: boolean[] = [];
  const db = {
    supplierReconciliation: {
      findFirst: vi.fn(async () => ({
        supplierId: 5,
        projectId: 50,
        periodFrom: day("2026-01-01"),
        periodTo: day("2026-10-26"),
        importRunId: opts.importRunId ?? null,
      })),
      updateMany: vi.fn(async () => {
        bypassSeen.push(isAuditBypassed());
        return { count: opts.updatedCount ?? 1 };
      }),
      update: vi.fn(),
    },
    ledgerTransaction: {
      findMany: vi.fn(async () => [
        {
          id: 1,
          transactionType: "lay_hang",
          totalTt: 300,
          date: day("2026-03-01"),
          itemId: null,
          qty: null,
          unitPriceSnapshot: null,
          content: "NL",
          invoiceNo: null,
          invoiceDate: null,
        },
      ]),
    },
    item: { findMany: vi.fn(async () => []) },
    project: { findUnique: vi.fn(async () => ({ code: "CT50" })) },
    user: { findUnique: vi.fn(async () => (opts.userExists === false ? null : { id: "user-1" })) },
    auditLog: { create: vi.fn(async () => ({ id: "a1" })) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("balance_tt") ? [{ balance_tt: 100 }] : [{ entity_name: "E1", project_name: "CT 50" }],
    ),
  };
  return { db: db as unknown as ReconFreezeClient, raw: db, bypassSeen };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("freezeReconciliationSnapshot", () => {
  it("UPDATE qua client transaction trong bypassAudit, không dùng update có audit ngoài transaction", async () => {
    const { db, raw, bypassSeen } = fakeDb();
    const snapshot = await freezeReconciliationSnapshot(db, 77, { auditUserId: "user-1" });

    expect(snapshot).toMatchObject({ opening: 100, totalIn: 300, closing: 400 });
    expect(raw.supplierReconciliation.update).not.toHaveBeenCalled();
    expect(raw.supplierReconciliation.updateMany).toHaveBeenCalledTimes(1);
    expect(bypassSeen).toEqual([true]);
    const args = raw.supplierReconciliation.updateMany.mock.calls[0] as unknown as [
      { where: unknown; data: Record<string, unknown> },
    ];
    expect(args[0].where).toEqual({ id: 77, deletedAt: null });
    expect(args[0].data).toMatchObject({ signedBySupplier: true });
    expect(String(args[0].data.closingBalance)).toBe("400");
  });

  it("dòng audit ghi bằng chính client transaction (rollback cùng commit), có người ký", async () => {
    const { db, raw } = fakeDb();
    await freezeReconciliationSnapshot(db, 77, { auditUserId: "user-1" });

    expect(raw.auditLog.create).toHaveBeenCalledTimes(1);
    const [{ data }] = raw.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(data).toMatchObject({ userId: "user-1", tableName: "SupplierReconciliation", recordId: "77", action: "update" });
    expect(data.afterJson).toMatchObject({ event: "signed", closingBalance: 400, signedBySupplier: true });
  });

  it("marker chuyển đổi (không có người ký) / id người dùng không còn → userId null", async () => {
    const marker = fakeDb({ importRunId: 9 });
    await freezeReconciliationSnapshot(marker.db, 77);
    expect(marker.raw.user.findUnique).not.toHaveBeenCalled();
    const [{ data: markerAudit }] = marker.raw.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(markerAudit).toMatchObject({ userId: null });
    expect(markerAudit.afterJson).toMatchObject({ event: "cutover_marker_signed", importRunId: 9 });

    const gone = fakeDb({ userExists: false });
    await freezeReconciliationSnapshot(gone.db, 77, { auditUserId: "deleted-user" });
    const [{ data: goneAudit }] = gone.raw.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(goneAudit.userId).toBeNull();
  });

  it("kỳ bị xoá giữa chừng (UPDATE 0 dòng) → lỗi, không ghi audit", async () => {
    const { db, raw } = fakeDb({ updatedCount: 0 });
    await expect(freezeReconciliationSnapshot(db, 77)).rejects.toThrow(/Kỳ đối chiếu #77 không tồn tại/);
    expect(raw.auditLog.create).not.toHaveBeenCalled();
  });
});
