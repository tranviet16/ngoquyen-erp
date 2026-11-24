/**
 * Guard chặn adapter import cũ ghi vào công trình đã chuyển sang sổ "Đối chiếu DT-HĐ-TT". Viết trước khi
 * tách điều kiện "công trình dùng sổ" ra module chung, chạy trên guard hiện có, rồi phải giữ xanh sau khi
 * tách. CSDL giả đánh giá đúng mệnh đề `where` mà guard gửi, nên đổi điều kiện là test đỏ.
 */

import { describe, expect, it, vi } from "vitest";
import { legacyImportBlocking } from "@/lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Khớp tối thiểu cho các mệnh đề guard dùng: bằng nhau, `{ not: null }`, `OR`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (cond !== null && typeof cond === "object" && "not" in (cond as Where)) return row[key] !== (cond as { not: unknown }).not;
    return row[key] === cond;
  });
}

function fakeDb(data: { projects: Row[]; transactions?: Row[]; estimates?: Row[] }) {
  const count = (rows: Row[]) => vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length);
  const db = {
    project: { findFirst: vi.fn(async ({ where }: { where: Where }) => data.projects.find((p) => matches(p, where)) ?? null) },
    projectTransaction: { count: count(data.transactions ?? []) },
    projectEstimate: { count: count(data.estimates ?? []) },
  };
  return { db, asGuardDb: db as unknown as Parameters<typeof legacyImportBlocking>[0] };
}

const PROJECT = { id: 4, code: "MNTC-GD1", deletedAt: null };
const OTHER = { id: 9, code: "KHAC", deletedAt: null };
const tx = (over: Row): Row => ({ projectId: 4, supersededByRunId: null, sourceInvoiceLineId: null, deletedAt: null, ...over });
const MESSAGE = 'Công trình MNTC-GD1 đã chuyển sang sổ "Đối chiếu DT-HĐ-TT" — nhập dự toán / hóa đơn ở tab đó, không import file này vào công trình này nữa.';

describe("legacyImportBlocking", () => {
  it("blocks when a transaction was superseded by a book import", async () => {
    const { asGuardDb } = fakeDb({ projects: [PROJECT], transactions: [tx({ supersededByRunId: 7 })] });
    expect(await legacyImportBlocking(asGuardDb, "MNTC-GD1")).toEqual([MESSAGE]);
  });

  it("blocks when a live transaction is derived from a book invoice line", async () => {
    const { asGuardDb } = fakeDb({ projects: [PROJECT], transactions: [tx({ sourceInvoiceLineId: 31 })] });
    expect(await legacyImportBlocking(asGuardDb, "MNTC-GD1")).toEqual([MESSAGE]);
  });

  it("blocks when an estimate was superseded by a book import", async () => {
    const { asGuardDb } = fakeDb({ projects: [PROJECT], estimates: [{ projectId: 4, supersededByRunId: 7 }] });
    expect(await legacyImportBlocking(asGuardDb, "MNTC-GD1")).toEqual([MESSAGE]);
  });

  it("does not block on a deleted derived transaction, plain rows, or another project's book", async () => {
    const { asGuardDb } = fakeDb({
      projects: [PROJECT, OTHER],
      transactions: [tx({ sourceInvoiceLineId: 31, deletedAt: new Date() }), tx({}), { ...tx({ supersededByRunId: 7 }), projectId: 9 }],
      estimates: [{ projectId: 4, supersededByRunId: null }, { projectId: 9, supersededByRunId: 7 }],
    });
    expect(await legacyImportBlocking(asGuardDb, "MNTC-GD1")).toEqual([]);
  });

  it("returns nothing and reads no counts for an unknown or deleted project code", async () => {
    const { db, asGuardDb } = fakeDb({ projects: [{ ...PROJECT, deletedAt: new Date() }], transactions: [tx({ supersededByRunId: 7 })] });
    expect(await legacyImportBlocking(asGuardDb, "MNTC-GD1")).toEqual([]);
    expect(await legacyImportBlocking(asGuardDb, "KHONG-CO")).toEqual([]);
    expect(db.projectTransaction.count).not.toHaveBeenCalled();
  });
});
