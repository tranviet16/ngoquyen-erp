import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { listTransactions } from "@/lib/du-an/transaction-service";
import { queryProjectById } from "@/lib/master-data/project-query";
import { serializeDecimals } from "@/lib/serialize";
import { GiaoDichClient } from "./giao-dich-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import {
  loadProjectLedger,
  loadProjectLedgerSwitchInfo,
  type ProjectLedger,
  type ProjectLedgerSwitchInfo,
} from "@/lib/du-an/project-ledger/project-ledger-loader";
import { resolveTransactionsSource, SOURCE_LEDGER, SOURCE_PROJECT } from "@/lib/du-an/project-ledger/transactions-source";
import { SourceSwitch } from "./source-switch";
import { LedgerRowsClient } from "./ledger-rows-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NOTE = "rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground";

/** Đọc sổ Công nợ vật tư lỗi thì chỉ mất nguồn đó; Sổ dự án (tạo / sửa / xóa) vẫn chạy. */
async function readLedgerSafely<T>(projectId: number, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[giao-dich] không đọc được sổ Công nợ vật tư của công trình", projectId, err);
    return null;
  }
}

/**
 * Giao Dịch có hai nguồn tách hẳn (`?nguon=`): "Sổ công nợ vật tư" (chỉ xem, cần quyền đọc Công nợ vật tư)
 * và "Sổ dự án" (`project_transactions`, tạo / sửa / xóa như trước). Không bao giờ cộng gộp.
 */
export default async function GiaoDichPage({ params, searchParams }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [transactions, project, canCreate, canEdit, switchInfo, sp] = await Promise.all([
    listTransactions(projectId),
    queryProjectById(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    readLedgerSafely(projectId, () => loadProjectLedgerSwitchInfo(projectId)),
    searchParams,
  ]);

  let source = resolveTransactionsSource(sp.nguon, switchInfo);
  let ledgerFailed = switchInfo == null;
  let ledger: ProjectLedger | null = null;
  if (source === SOURCE_LEDGER) {
    ledger = await readLedgerSafely(projectId, () => loadProjectLedger(projectId, { withRows: true }));
    if (ledger == null) {
      ledgerFailed = true;
      source = SOURCE_PROJECT;
    }
  }

  return (
    <div className="space-y-3">
      {switchInfo?.rowsVisible && !ledgerFailed && (
        <SourceSwitch
          basePath={`/du-an/${projectId}/giao-dich`}
          current={source}
          ledgerRowCount={ledger?.rowCount ?? switchInfo.rowCount ?? 0}
          projectRowCount={transactions.length}
        />
      )}
      {ledgerFailed && <p className={NOTE}>Không đọc được sổ Công nợ vật tư lúc này; đang hiện Sổ dự án.</p>}

      {source === SOURCE_LEDGER && ledger ? (
        <LedgerRowsClient
          rows={ledger.rows ?? []}
          openings={ledger.openings ?? []}
          totals={ledger.totals}
          pending={ledger.pending}
        />
      ) : (
        <>
          {transactions.length === 0 && !ledgerFailed && <ProjectBookEmptyNotice projectId={projectId} info={switchInfo} />}
          <Suspense>
            <GiaoDichClient projectId={projectId} initialData={serializeDecimals(transactions)} categories={project?.categories ?? []} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} isAdmin={role === "admin"} />
          </Suspense>
        </>
      )}
    </div>
  );
}

/** Sổ dự án trống: chỉ chỗ có giao dịch vật tư (sổ Công nợ vật tư), không cộng gì vào sổ này. */
function ProjectBookEmptyNotice({ projectId, info }: { projectId: number; info: ProjectLedgerSwitchInfo | null }) {
  if (info?.rowsVisible) {
    if (!info.rowCount) return null;
    return (
      <p className={NOTE}>
        Sổ dự án của công trình chưa có giao dịch. Giao dịch vật tư của công trình nằm ở Sổ công nợ vật tư.{" "}
        <Link href={`/du-an/${projectId}/giao-dich?nguon=${SOURCE_LEDGER}`} className="font-medium text-primary hover:underline">
          Xem Sổ công nợ vật tư →
        </Link>
      </p>
    );
  }
  return (
    <p className={NOTE}>
      Sổ dự án của công trình chưa có giao dịch. Giao dịch vật tư (nếu có) nằm ở sổ Công nợ vật tư, cần quyền đọc Công
      nợ vật tư để xem từng dòng; tổng công nợ từng nhà cung cấp xem ở{" "}
      <Link href={`/du-an/${projectId}/cong-no`} className="font-medium text-primary hover:underline">
        tab Công Nợ NCC
      </Link>
      .
    </p>
  );
}
