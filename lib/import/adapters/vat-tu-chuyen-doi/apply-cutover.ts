/**
 * Ghi kế hoạch chuyển đổi trong transaction của engine (đã khóa NCC). Thứ tự ghi:
 *   1. danh mục "Tạo mới" (Chủ thể → NCC → công trình có Chủ thể → vật tư);
 *   2. số dư ròng asOf 31/12/2025 / 2 dòng lũy kế 26/12/2025;
 *   3. dòng Nhập Liệu ≤ mốc + "Trả Nợ" sau mốc không khớp thanh toán ERP;
 *   4. phiếu ngày (phần chênh so với ERP; không gắn deliveryId, không sinh event);
 *   5. marker chuyển đổi 01/01/2026 → mốc cho mọi cặp có dữ liệu tới mốc, ký ngay; snapshot + 4 cột
 *      tổng bằng `freezeCutoverMarkers` (gọi sau khi đối soát V1–V4 đạt, vẫn trong transaction).
 * Mọi dòng mang `importRunId`. Ghi bằng SQL thô (bỏ qua audit extension — có chủ đích cho import
 * lịch sử) theo lô; ném lỗi ngay khi có lỗi (engine rollback toàn bộ).
 *
 * `dryRun` (xem trước, engine luôn rollback): chạy đúng đường ghi này; thay bước đông cứng marker
 * (UPDATE qua audit extension ghi audit bằng kết nối riêng, không rollback theo transaction) bằng
 * phép tính bảng đối chiếu chỉ-đọc cùng mã.
 */

import { Prisma } from "@prisma/client";
import { assertPeriodBounds, assertPeriodOpen } from "@/lib/vat-tu-ncc/period-lock";
import { resolveMaterialEntityId } from "@/lib/vat-tu-ncc/pair-scope";
import { computeReconciliation, freezeReconciliationSnapshot } from "@/lib/vat-tu-ncc/reconciliation-compute";
import type { ImportTx } from "../adapter-types";
import { CUTOVER_DATE, CUTOVER_MARKER_FROM, OPENING_AS_OF } from "./cutover-constants";
import type { CutoverPlan } from "./cutover-plan";
import { refKey, type PairRef, type Ref } from "./mapping-keys";

const BATCH_SIZE = 250;
export const PROJECT_CODE_PREFIX = "CDVT-";
export const ITEM_CODE_PREFIX = "VTCD-";

type RefKind = "entity" | "supplier" | "project" | "item";

/** Đổi ref (có sẵn / vừa tạo) thành id. Ném lỗi khi ref chưa được tạo — lỗi lập trình. */
export class RefIds {
  private readonly created: Record<RefKind, Map<string, number>> = {
    entity: new Map(),
    supplier: new Map(),
    project: new Map(),
    item: new Map(),
  };

  set(kind: RefKind, ref: Ref, id: number): void {
    this.created[kind].set(refKey(ref), id);
  }

  id(kind: RefKind, ref: Ref): number {
    if (ref.kind === "id") return ref.id;
    const id = this.created[kind].get(refKey(ref));
    if (id === undefined) throw new Error(`${kind} mới «${ref.name}» chưa được tạo`);
    return id;
  }

  pair(pair: PairRef): { supplierId: number; projectId: number } {
    return { supplierId: this.id("supplier", pair.sRef), projectId: this.id("project", pair.pRef) };
  }
}

export interface CreatedMasterData {
  entities: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  projects: { id: number; code: string; name: string; entityId: number }[];
  items: { id: number; code: string; name: string; unit: string; type: string }[];
}

export interface ApplyCounts {
  openings: number;
  lifetimeRows: number;
  nhapLieuRows: number;
  postCutoverPayments: number;
  deliveriesBefore: number;
  deliveriesAfter: number;
  markers: number;
}

export interface ApplyResult {
  ids: RefIds;
  created: CreatedMasterData;
  counts: ApplyCounts;
  markerIds: number[];
}

async function insertReturningId(tx: ImportTx, sql: Prisma.Sql): Promise<number> {
  const rows = await tx.$queryRaw<{ id: number }[]>(sql);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("INSERT không trả id");
  return Number(id);
}

async function insertBatches(tx: ImportTx, head: Prisma.Sql, values: readonly Prisma.Sql[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    n += await tx.$executeRaw`${head} VALUES ${Prisma.join(values.slice(i, i + BATCH_SIZE))}`;
  }
  return n;
}

/** Mã kế tiếp `<prefix>0001…` (tính cả bản ghi đã xóa mềm để không dùng lại mã). */
async function nextCodes(tx: ImportTx, table: "projects" | "items", prefix: string, count: number): Promise<string[]> {
  if (count === 0) return [];
  const rows = await tx.$queryRaw<{ code: string }[]>`
    SELECT code FROM ${Prisma.raw(table === "projects" ? "projects" : "items")} WHERE code LIKE ${`${prefix}%`}`;
  let max = 0;
  for (const { code } of rows) {
    const n = Number(code.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(4, "0")}`);
}

async function createMasterData(tx: ImportTx, plan: CutoverPlan, ids: RefIds): Promise<CreatedMasterData> {
  const created: CreatedMasterData = { entities: [], suppliers: [], projects: [], items: [] };
  for (const e of plan.newMaster.entities) {
    const id = await insertReturningId(tx, Prisma.sql`
      INSERT INTO entities (name, type, "createdAt", "updatedAt") VALUES (${e.name}, ${e.type}, NOW(), NOW()) RETURNING id`);
    ids.set("entity", e.ref, id);
    created.entities.push({ id, name: e.name });
  }
  for (const s of plan.newMaster.suppliers) {
    const id = await insertReturningId(tx, Prisma.sql`
      INSERT INTO suppliers (name, "createdAt", "updatedAt") VALUES (${s.name}, NOW(), NOW()) RETURNING id`);
    ids.set("supplier", s.ref, id);
    created.suppliers.push({ id, name: s.name });
  }
  const projectCodes = await nextCodes(tx, "projects", PROJECT_CODE_PREFIX, plan.newMaster.projects.length);
  for (const [i, p] of plan.newMaster.projects.entries()) {
    if (!p.entityRef) throw new Error(`Công trình mới «${p.name}» chưa có Chủ thể`);
    const entityId = ids.id("entity", p.entityRef);
    const code = projectCodes[i];
    const id = await insertReturningId(tx, Prisma.sql`
      INSERT INTO projects (code, name, status, "entityId", "createdAt", "updatedAt")
      VALUES (${code}, ${p.name}, 'active', ${entityId}, NOW(), NOW()) RETURNING id`);
    ids.set("project", p.ref, id);
    created.projects.push({ id, code, name: p.name, entityId });
  }
  const itemCodes = await nextCodes(tx, "items", ITEM_CODE_PREFIX, plan.newMaster.items.length);
  for (const [i, item] of plan.newMaster.items.entries()) {
    const code = itemCodes[i];
    const id = await insertReturningId(tx, Prisma.sql`
      INSERT INTO items (code, name, unit, type, "createdAt", "updatedAt")
      VALUES (${code}, ${item.name}, ${item.unit}, ${item.type}, NOW(), NOW()) RETURNING id`);
    ids.set("item", item.ref, id);
    created.items.push({ id, code, name: item.name, unit: item.unit, type: item.type });
  }
  return created;
}

/** Chủ thể của mọi ghi vật tư = `Project.entityId` (thiếu → `missing_entity`). */
async function entityResolver(tx: ImportTx, projectIds: Iterable<number>): Promise<(projectId: number) => number> {
  const map = new Map<number, number>();
  for (const pid of new Set(projectIds)) map.set(pid, await resolveMaterialEntityId(tx, pid));
  return (pid) => {
    const e = map.get(pid);
    if (e === undefined) throw new Error(`Chưa suy được Chủ thể của công trình #${pid}`);
    return e;
  };
}

export async function applyCutoverPlan(
  tx: ImportTx,
  plan: CutoverPlan,
  runId: number,
  opts: { dryRun: boolean },
): Promise<ApplyResult> {
  const ids = new RefIds();
  const created = await createMasterData(tx, plan, ids);
  const projectIds = plan.touchedPairs.map((p) => ids.pair(p).projectId);
  const entityOf = await entityResolver(tx, projectIds);
  const note = `Chuyển đổi từ Excel đến 26/10/2026 — import #${runId}`;

  const openings = plan.openings.map((o) => {
    const { supplierId, projectId } = ids.pair(o.pair);
    return Prisma.sql`('material', ${entityOf(projectId)}, ${supplierId}, ${projectId}, ${o.tt}, ${o.hd}, ${OPENING_AS_OF},
      ${`Số Dư Ban Đầu (${o.sourceKeys.join("; ")}) — import #${runId}`}, ${runId}, NOW(), NOW())`;
  });
  await insertBatches(tx, Prisma.sql`INSERT INTO ledger_opening_balances
    ("ledgerType", "entityId", "partyId", "projectId", "balanceTt", "balanceHd", "asOfDate", note, "importRunId", "createdAt", "updatedAt")`, openings);

  const ledger: Prisma.Sql[] = [];
  let postCutoverPayments = 0;
  for (const r of plan.ledgerRows) {
    const { supplierId, projectId } = ids.pair(r.pair);
    if (r.date.getTime() > CUTOVER_DATE.getTime()) {
      // Dòng sau mốc của chính run: kiểm kỳ đã ký của cặp (khóa rồi mới kiểm), bỏ qua guard mốc.
      await assertPeriodOpen(supplierId, projectId, r.date, tx, { cutoverImportRunId: runId });
      postCutoverPayments += 1;
    }
    const itemId = r.itemRef ? ids.id("item", r.itemRef) : null;
    ledger.push(Prisma.sql`('material', ${r.date}, ${r.type}, ${entityOf(projectId)}, ${supplierId}, ${projectId}, ${itemId},
      ${r.amountTt}, ${r.vatPctTt}, ${r.vatTt}, ${r.totalTt}, ${r.amountHd}, ${r.vatPctHd}, ${r.vatHd}, ${r.totalHd},
      ${r.invoiceNo}, ${r.invoiceDate}, ${r.content}, ${r.status}, ${r.note}, ${runId}, NOW(), NOW())`);
  }
  await insertBatches(tx, Prisma.sql`INSERT INTO ledger_transactions
    ("ledgerType", date, "transactionType", "entityId", "partyId", "projectId", "itemId",
     "amountTt", "vatPctTt", "vatTt", "totalTt", "amountHd", "vatPctHd", "vatHd", "totalHd",
     "invoiceNo", "invoiceDate", content, status, note, "importRunId", "createdAt", "updatedAt")`, ledger);

  const deliveries = plan.deliveries.map((d) => {
    const { supplierId, projectId } = ids.pair(d.pair);
    return Prisma.sql`(${supplierId}, ${projectId}, ${d.date}, ${ids.id("item", d.itemRef)}, ${d.qty}, ${d.unit},
      ${d.unitPrice}, ${d.totalAmount}, ${d.cbVatTu}, ${d.chiHuyCt}, ${d.keToan}, ${d.note}, ${runId}, NOW(), NOW())`;
  });
  await insertBatches(tx, Prisma.sql`INSERT INTO supplier_delivery_daily
    ("supplierId", "projectId", date, "itemId", qty, unit, "unitPrice", "totalAmount", "cbVatTu", "chiHuyCt", "keToan",
     note, "importRunId", "createdAt", "updatedAt")`, deliveries);

  const markerIds: number[] = [];
  for (const pair of plan.markers) {
    const { supplierId, projectId } = ids.pair(pair);
    await assertPeriodBounds(supplierId, projectId, { from: CUTOVER_MARKER_FROM, to: CUTOVER_DATE }, tx);
    const id = await insertReturningId(tx, Prisma.sql`
      INSERT INTO supplier_reconciliations
        ("supplierId", "projectId", "periodFrom", "periodTo", "signedBySupplier", "signedDate", note, "importRunId", "createdAt", "updatedAt")
      VALUES (${supplierId}, ${projectId}, ${CUTOVER_MARKER_FROM}, ${CUTOVER_DATE}, true, NOW(), ${note}, ${runId}, NOW(), NOW())
      RETURNING id`);
    // Chạy thử: tính bảng đối chiếu chỉ-đọc (cùng mã với bước đông cứng). Ghi thật: đông cứng bằng
    // `freezeCutoverMarkers` SAU khi đối soát đạt.
    if (opts.dryRun) await computeReconciliation(supplierId, projectId, CUTOVER_MARKER_FROM, CUTOVER_DATE, tx);
    markerIds.push(id);
  }

  const lifetimeRows = plan.ledgerRows.filter((r) => r.sourceKey.startsWith("LK-")).length;
  return {
    ids,
    created,
    markerIds,
    counts: {
      openings: plan.openings.length,
      lifetimeRows,
      nhapLieuRows: plan.ledgerRows.length - lifetimeRows - postCutoverPayments,
      postCutoverPayments,
      deliveriesBefore: plan.deliveries.filter((d) => !d.afterCutover).length,
      deliveriesAfter: plan.deliveries.filter((d) => d.afterCutover).length,
      markers: markerIds.length,
    },
  };
}

/**
 * Đông cứng marker chuyển đổi: 4 cột tổng + snapshot + ký (`freezeReconciliationSnapshot`, trong
 * transaction đang giữ khóa NCC). Gọi SAU khi V1–V4 đạt: UPDATE đi qua audit extension, dòng audit
 * ghi bằng kết nối riêng và không rollback theo transaction — đối soát lệch thì không để lại audit.
 */
export async function freezeCutoverMarkers(tx: ImportTx, markerIds: readonly number[]): Promise<void> {
  for (const id of markerIds) await freezeReconciliationSnapshot(tx, id);
}
