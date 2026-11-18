/**
 * Loader của màn chi tiết hợp đồng và cột "Công nợ còn lại (TT)" của danh mục.
 *
 * Tổng hiển thị = Σ các dòng (hàm thuần); không đối chiếu lúc chạy — độ khớp với báo cáo công nợ lũy
 * kế được chứng minh bằng integration test và script tie-out. Ranh giới quyền: người đọc được dự án
 * thấy các tổng; danh sách từng dòng của sổ NCC / đội cần thêm quyền đọc `cong-no-vt` / `cong-no-nc`
 * (không có quyền thì `lists = null`, không dòng nào sang client).
 *
 * Cố ý KHÔNG nằm trong file "use server": hàm nội bộ của page, không được lộ thành server action.
 */

import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { canAccess } from "@/lib/acl/effective";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { buildContractFigures, resolveGroup, type ContractFigureSource } from "./contract-group";
import { buildListFigure } from "./list-figures";
import { loadLedgerOpenings, loadLedgerRows, loadPendingDeliveries, type PendingDeliveries } from "./ledger-source";
import { loadCdtInputs, loadCdtTotals } from "./cdt-source";
import { parsePartyKind, type ContractFigures, type ContractRef, type PartyKind } from "./types";

const CONTRACT_SELECT = {
  id: true, projectId: true, docName: true, docType: true, status: true, partyKind: true, supplierId: true,
  contractorId: true, partyName: true, valueVnd: true, valueTtVnd: true, signedDate: true, expiryDate: true,
  storage: true, note: true, importRunId: true, deletedAt: true,
  supplier: { select: { id: true, name: true, deletedAt: true } },
  contractor: { select: { id: true, name: true, deletedAt: true } },
} as const;

function assertNever(value: never): never {
  throw new Error(`Loại đối tác không xử lý: ${String(value)}`);
}

/** Các hợp đồng có thể cùng nhóm gộp (lọc thô; `resolveGroup` lọc đúng). */
async function loadSiblings(projectId: number, kind: PartyKind, partyId: number | null) {
  return prisma.projectContract.findMany({
    where: {
      projectId, deletedAt: null, docType: "contract", partyKind: kind,
      ...(kind === "ncc" ? { supplierId: partyId } : kind === "doi_thi_cong" ? { contractorId: partyId } : {}),
    },
    select: { ...CONTRACT_SELECT, supplier: false, contractor: false },
    orderBy: { id: "asc" },
  });
}

async function ledgerSource(ledgerType: "material" | "labor", partyId: number, projectId: number): Promise<ContractFigureSource> {
  const [rows, openings] = await Promise.all([
    loadLedgerRows(ledgerType, partyId, projectId),
    loadLedgerOpenings(ledgerType, partyId, projectId),
  ]);
  return { kind: "ledger", rows, openings };
}

export interface ContractDetail {
  contract: Awaited<ReturnType<typeof loadContractRow>> & object;
  figures: ContractFigures | null;
  /** Người xem thiếu quyền đọc sổ công nợ tương ứng: chỉ có tổng, không có từng dòng. */
  ledgerDetailHidden: boolean;
  /** Hợp đồng cùng nhóm gộp (gồm chính nó) — cho băng "N hợp đồng với …". */
  groupMembers: { id: number; docName: string }[];
  /** Công nợ theo Chủ thể khi cặp có từ 2 Chủ thể trở lên. */
  entityBreakdown: { entityId: number; entityName: string; conPhaiTraTt: string; conPhaiTraHd: string }[];
  pendingDeliveries: PendingDeliveries | null;
  /** Mọi bản scan, kể cả đã xóa mềm (`deletedAt`) — page chỉ đưa scan đã xóa cho admin (để xóa vĩnh viễn). */
  scans: { id: number; filename: string; mimeType: string; sizeBytes: number; createdAt: Date; deletedAt: Date | null; uploaderName: string }[];
}

function loadContractRow(projectId: number, contractId: number, includeDeleted = false) {
  return prisma.projectContract.findFirst({
    where: { id: contractId, projectId, ...(includeDeleted ? {} : { deletedAt: null }) },
    select: CONTRACT_SELECT,
  });
}

/**
 * `includeDeleted` (chỉ cho admin): mở cả hợp đồng đã xóa mềm — không có khối số, chỉ để admin xóa
 * vĩnh viễn bản scan còn lại (gỡ chặn hoàn tác import).
 */
export async function loadContractDetail(
  projectId: number,
  contractId: number,
  userId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<ContractDetail | null> {
  // Lớp phòng thủ thứ hai — page đã guard trước.
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const contract = await loadContractRow(projectId, contractId, opts.includeDeleted === true);
  if (!contract) return null;

  const scans = (
    await prisma.projectContractAttachment.findMany({
      where: { contractId },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true, deletedAt: true, uploader: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  ).map(({ uploader, ...s }) => ({ ...s, uploaderName: uploader.name }));

  const base = { contract, figures: null, ledgerDetailHidden: false, groupMembers: [], entityBreakdown: [], pendingDeliveries: null, scans };
  const kind = contract.docType === "contract" && !contract.deletedAt ? parsePartyKind(contract.partyKind) : null;
  if (kind === null) return base;

  let source: ContractFigureSource;
  let ledgerDetailHidden = false;
  let pendingDeliveries: PendingDeliveries | null = null;
  const partyId = kind === "ncc" ? contract.supplierId : kind === "doi_thi_cong" ? contract.contractorId : null;
  switch (kind) {
    case "ncc":
    case "doi_thi_cong": {
      if (partyId == null) return base;
      const ledgerType = kind === "ncc" ? "material" : "labor";
      const [src, canSeeLedger, pending] = await Promise.all([
        ledgerSource(ledgerType, partyId, projectId),
        canAccess(userId, kind === "ncc" ? "cong-no-vt" : "cong-no-nc", { minLevel: "read", scope: "module" }),
        kind === "ncc" ? loadPendingDeliveries(partyId, projectId) : Promise.resolve(null),
      ]);
      source = src;
      ledgerDetailHidden = !canSeeLedger;
      pendingDeliveries = pending;
      break;
    }
    case "cdt":
      source = { kind: "cdt", inputs: await loadCdtInputs(projectId) };
      break;
    default:
      return assertNever(kind);
  }

  const siblings = await loadSiblings(projectId, kind, partyId);
  const figures = buildContractFigures(contract as ContractRef, siblings as ContractRef[], source);
  if (figures && figures.partyKind !== "cdt" && ledgerDetailHidden) figures.ledger.lists = null;

  let entityBreakdown: ContractDetail["entityBreakdown"] = [];
  if (figures && figures.partyKind !== "cdt" && figures.ledger.byEntity.length >= 2) {
    const names = await prisma.entity.findMany({
      where: { id: { in: figures.ledger.byEntity.map((e) => e.entityId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    entityBreakdown = figures.ledger.byEntity.map((e) => ({ ...e, entityName: nameOf.get(e.entityId) ?? `Chủ thể #${e.entityId}` }));
  }

  const memberIds = new Set(figures?.group.contractIds ?? []);
  return {
    contract,
    figures,
    ledgerDetailHidden,
    groupMembers: siblings.filter((s) => memberIds.has(s.id)).map((s) => ({ id: s.id, docName: s.docName })),
    entityBreakdown,
    pendingDeliveries,
    scans,
  };
}

/** Cột "Công nợ còn lại (TT)" của danh mục, theo id hợp đồng. */
export async function loadContractListFigures(projectId: number): Promise<Record<number, { debtTt: string | null; groupSize: number }>> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const contracts = await prisma.projectContract.findMany({
    where: { projectId, deletedAt: null, docType: "contract", partyKind: { not: null } },
    select: { ...CONTRACT_SELECT, supplier: false, contractor: false },
  });
  if (contracts.length === 0) return {};
  const kinds = new Set(contracts.map((c) => c.partyKind));
  const filters = { projectIds: [projectId], showZero: true };
  const [material, labor, cdtTotals] = await Promise.all([
    kinds.has("ncc") ? queryDetailReport({ ...filters, ledgerType: "material" }) : null,
    kinds.has("doi_thi_cong") ? queryDetailReport({ ...filters, ledgerType: "labor" }) : null,
    kinds.has("cdt") ? loadCdtTotals(projectId) : { nghiemThu: "0", daNhan: "0" },
  ]);
  const canonical = { material: material?.rows ?? [], labor: labor?.rows ?? [] };
  const refs = contracts as ContractRef[];
  const out: Record<number, { debtTt: string | null; groupSize: number }> = {};
  for (const c of refs) {
    out[c.id] = {
      debtTt: buildListFigure(c, canonical, cdtTotals).debtTt,
      groupSize: resolveGroup(c, refs)?.contractIds.length ?? 1,
    };
  }
  return out;
}
