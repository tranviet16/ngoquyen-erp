/**
 * Giải thích vì sao Cân Đối VT, Định Mức và Dashboard trống ở công trình chưa có dự toán / sổ dự án: các tab
 * này so dự toán với sổ dự án (`project_transactions`), còn hoạt động vật tư của công trình nằm ở sổ Công nợ
 * vật tư (tab Công Nợ NCC, Giao Dịch nguồn "Sổ công nợ vật tư"). Đặt phía trên client, không che ô nhập.
 */

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { projectUsesBook } from "@/lib/du-an/dt-hd-tt/book-presence";
import { loadProjectLedger } from "@/lib/du-an/project-ledger/project-ledger-loader";

const LINK = "font-medium text-primary hover:underline";

const NO_ESTIMATES = "Công trình chưa có dự toán / hạng mục nên chưa có số.";

export function ProjectBookEmptyState({ projectId, lead, reason = NO_ESTIMATES }: { projectId: number; lead: string; reason?: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      {lead} {reason} Công nợ nhà cung cấp xem ở{" "}
      <Link href={`/du-an/${projectId}/cong-no`} className={LINK}>tab Công Nợ NCC</Link>, giao dịch vật tư ở{" "}
      <Link href={`/du-an/${projectId}/giao-dich?nguon=so-cong-no`} className={LINK}>Giao Dịch (Sổ công nợ vật tư)</Link>.
    </div>
  );
}

/**
 * Dashboard: chỉ hiện khi công trình không dùng sổ đội, sổ dự án trống và sổ Công nợ vật tư có ít nhất một NCC
 * (công trình hoàn toàn mới thì không). Server component, đặt trong Suspense riêng: đọc lỗi thì chỉ mất thông
 * báo, không hỏng trang.
 */
export async function DashboardLedgerOnlyNotice({ projectId }: { projectId: number }) {
  try {
    const [usesBook, projectRows] = await Promise.all([
      projectUsesBook(prisma, projectId),
      prisma.projectTransaction.count({ where: { projectId, deletedAt: null } }),
    ]);
    if (usesBook || projectRows > 0) return null;
    const ledger = await loadProjectLedger(projectId, { withRows: false });
    if (ledger.suppliers.length === 0) return null;
  } catch (err) {
    unstable_rethrow(err);
    console.error("[du-an dashboard] không kiểm được nguồn số của công trình", projectId, err);
    return null;
  }
  return (
    <ProjectBookEmptyState
      projectId={projectId}
      lead="Các thẻ Hóa đơn và Thực tế dưới đây lấy từ sổ dự án."
      reason="Sổ dự án của công trình chưa có giao dịch, còn hoạt động vật tư nằm ở sổ Công nợ vật tư."
    />
  );
}
