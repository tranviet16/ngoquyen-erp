import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { isAdmin } from "@/lib/rbac";
import { loadContractDetail } from "@/lib/du-an/contract-detail/contract-detail-loader";
import { listContractorOptions } from "@/lib/du-an/contract-service";
import { listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { CONTRACT_PARTY_KIND_SHORT, isPartyKind } from "@/lib/du-an/contract-labels";
import { serializeDecimals } from "@/lib/serialize";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { toContractFormValues, withBoundPartyOptions } from "@/lib/du-an/contract-form-values";
import { ContractDetailHeader } from "./contract-detail-header";
import { ContractScanSection } from "./contract-scan-section";
import { ContractValueSection } from "./contract-value-section";
import { ContractSourceLists } from "./contract-source-lists";
import { ContractDebtSection } from "./contract-debt-section";
import { ContractUnfulfilledSection } from "./contract-unfulfilled-section";

interface Props {
  params: Promise<{ id: string; contractId: string }>;
}

const AMBER = "rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Màn chi tiết hợp đồng: thông tin + bản scan, giá trị, ba danh sách, công nợ, phần chưa thực hiện. */
export default async function ContractDetailPage({ params }: Props) {
  const { id, contractId: rawContractId } = await params;
  const projectId = Number(id);
  const contractId = Number(rawContractId);
  if (!Number.isInteger(projectId) || !Number.isInteger(contractId) || contractId <= 0) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const admin = isAdmin(role);
  const [canEditProject, detail] = await Promise.all([
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    loadContractDetail(projectId, contractId, userId, { includeDeleted: admin }),
  ]);
  if (!detail) notFound();
  const c = detail.contract;
  // Hợp đồng đã xóa (chỉ admin mở được): không sửa, chỉ còn xóa vĩnh viễn bản scan.
  const canEdit = canEditProject && !c.deletedAt;
  // Scan đã xóa mềm chỉ gửi cho admin (để xóa vĩnh viễn).
  const scans = admin ? detail.scans : detail.scans.filter((s) => !s.deletedAt);
  const row = serializeDecimals(c);

  let form = null;
  if (canEdit) {
    const [suppliers, contractors, project] = await Promise.all([
      listSupplierOptions(projectId),
      listContractorOptions(projectId),
      prisma.project.findUnique({ where: { id: projectId }, select: { ownerInvestor: true } }),
    ]);
    form = {
      initialValues: toContractFormValues(row),
      ...withBoundPartyOptions(row, suppliers, contractors),
      ownerInvestor: project?.ownerInvestor ?? null,
    };
  }

  const kind = c.docType === "contract" && isPartyKind(c.partyKind) ? c.partyKind : null;
  const party = kind === "ncc" ? c.supplier : kind === "doi_thi_cong" ? c.contractor : null;
  const partyName = party?.name ?? c.partyName ?? "";
  const partyLabel = kind ? `${CONTRACT_PARTY_KIND_SHORT[kind]} · ${partyName || "—"}` : partyName || "—";
  const figures = detail.figures;
  const valueDt = c.valueVnd?.toFixed() ?? null;
  const valueTt = c.valueTtVnd?.toFixed() ?? null;

  return (
    <div className="space-y-6">
      <ContractDetailHeader
        projectId={projectId}
        contractId={contractId}
        docName={c.docName}
        docType={c.docType}
        status={c.status}
        expiryDate={c.expiryDate?.toISOString() ?? null}
        canEdit={canEdit}
        form={form}
      />

      <section className="space-y-3">
        <h3 className="font-semibold">Thông tin</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Info label="Đối tác">
            {partyLabel}
            {party?.deletedAt && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(đã xóa khỏi danh mục)</span>}
          </Info>
          <Info label="Ngày ký">{formatDate(c.signedDate)}</Info>
          <Info label="Hết hạn">{formatDate(c.expiryDate)}</Info>
          <Info label="Nơi lưu bản giấy">{c.storage || "—"}</Info>
          <Info label="Ghi chú">{c.note || "—"}</Info>
          {c.docType !== "contract" && <Info label="Giá trị">{c.valueVnd == null ? "—" : formatNumber(c.valueVnd.toFixed())}</Info>}
        </div>
        {c.importRunId != null && <p className="text-xs text-muted-foreground">Nhập từ file (lần import #{c.importRunId}).</p>}
        <ContractScanSection projectId={projectId} contractId={contractId} scans={scans} canEdit={canEdit} isAdmin={admin} contractDeleted={c.deletedAt != null} />
      </section>

      {c.deletedAt && (
        <div className={AMBER}>Hợp đồng này đã bị xóa. Admin chỉ còn xóa vĩnh viễn được các bản scan (để hoàn tác lần import, nếu cần).</div>
      )}

      {c.docType === "contract" && !c.deletedAt && !figures && (
        <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground">Hợp đồng chưa gắn đối tác có mã. Gắn đối tác để xem số liệu.</p>
      )}

      {figures && (
        <>
          {party?.deletedAt && <div className={AMBER}>Đối tác «{party.name}» đã bị xóa khỏi danh mục; số liệu vẫn đọc từ sổ gốc.</div>}
          {detail.entityBreakdown.length >= 2 && (
            <div className={AMBER}>
              Cặp đối tác × công trình có số liệu ở {detail.entityBreakdown.length} Chủ thể; số bên dưới cộng chung:{" "}
              {detail.entityBreakdown.map((e) => `${e.entityName} còn phải trả TT ${formatNumber(e.conPhaiTraTt)}`).join("; ")}.
            </div>
          )}
          {detail.pendingDeliveries && detail.pendingDeliveries.count > 0 && (
            <div className={AMBER}>
              {detail.pendingDeliveries.count} phiếu vật tư ngày ({formatNumber(detail.pendingDeliveries.knownAmount)} đ
              {detail.pendingDeliveries.unpricedCount > 0 ? `, ${detail.pendingDeliveries.unpricedCount} phiếu chưa có giá` : ""}) chưa chốt vào sổ công nợ nên chưa nằm trong Lấy hàng.
            </div>
          )}
          <ContractValueSection
            projectId={projectId}
            valueDt={valueDt}
            valueTt={valueTt}
            figures={figures}
            partyLabel={partyLabel}
            groupMembers={detail.groupMembers}
          />
          <ContractSourceLists projectId={projectId} figures={figures} ledgerDetailHidden={detail.ledgerDetailHidden} />
          <ContractDebtSection figures={figures} />
          <ContractUnfulfilledSection figures={figures} />
        </>
      )}
    </div>
  );
}
