import Link from "next/link";
import { notFound } from "next/navigation";
import { getReconciliationView } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { formatDate, formatVND, formatNumber } from "@/lib/utils/format";
import { PrintButton } from "@/components/export-buttons";
import { SignReconButton } from "./sign-button";

interface Props {
  params: Promise<{ supplierId: string; reconciliationId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReconDetailPage({ params }: Props) {
  const { supplierId, reconciliationId } = await params;
  const sid = Number(supplierId);
  const rid = Number(reconciliationId);
  if (isNaN(sid) || isNaN(rid)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const canEdit = await canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" });

  const view = await getReconciliationView(rid);
  if (view.supplierId !== sid) notFound();

  const totalDebt = view.closing;

  return (
    <div className="space-y-4 print:text-black">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/vat-tu-ncc/${sid}/doi-chieu`} className="text-sm text-muted-foreground hover:underline">
          ← Danh sách kỳ
        </Link>
        <div className="flex gap-2">
          <PrintButton label="In bảng đối chiếu" />
          {canEdit && !view.signedBySupplier && <SignReconButton reconciliationId={rid} />}
        </div>
      </div>

      {!view.signedBySupplier && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Kỳ chưa ký — số liệu bên dưới tính trực tiếp từ sổ công nợ vật tư và sẽ thay đổi nếu có ghi mới trong kỳ.
        </p>
      )}
      {view.signedBySupplier && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 print:hidden dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
          Đã ký ngày {view.signedDate ? formatDate(view.signedDate) : ""} — bản đông cứng, kỳ đã khóa ghi.
        </p>
      )}

      <div className="mx-auto max-w-4xl space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold uppercase">Bảng đối chiếu công nợ</h1>
          <p className="text-sm">
            Kỳ từ ngày {formatDate(view.periodFrom)} đến ngày {formatDate(view.periodTo)}
          </p>
        </div>

        <div className="text-sm space-y-1">
          <p><strong>Bên mua:</strong> {view.entityNames.length ? view.entityNames.join(", ") : "—"}</p>
          <p>
            <strong>Bên bán:</strong> {view.supplierName}
            {view.supplierTaxCode ? ` — MST: ${view.supplierTaxCode}` : ""}
            {view.supplierAddress ? ` — ${view.supplierAddress}` : ""}
          </p>
          {view.projectNames.length > 0 && (
            <p><strong>Công trình:</strong> {view.projectNames.join(" + ")}</p>
          )}
          {view.note && <p><strong>Ghi chú:</strong> {view.note}</p>}
        </div>

        <table className="w-full text-sm border-collapse [&_td]:border [&_th]:border [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1">
          <tbody>
            <tr className="bg-muted/50 font-semibold">
              <td colSpan={7}>A. Dư nợ mang sang</td>
              <td className="text-right whitespace-nowrap">{formatVND(view.opening)}</td>
            </tr>
            <tr className="bg-muted/30 text-left">
              <th className="w-10">STT</th>
              <th>Ngày</th>
              <th>Tên vật tư</th>
              <th className="text-right">KL</th>
              <th>Công trình</th>
              <th className="text-right">Đơn giá</th>
              <th colSpan={2} className="text-right">Thành tiền</th>
            </tr>
            {view.layHangRows.map((r, i) => (
              <tr key={r.id}>
                <td className="text-center">{i + 1}</td>
                <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                <td>{r.itemLabel}</td>
                <td className="text-right">{r.qty == null ? "—" : formatNumber(r.qty)}</td>
                <td>{r.projectLabel}</td>
                <td className="text-right whitespace-nowrap">{r.unitPrice == null ? "—" : formatNumber(r.unitPrice)}</td>
                <td colSpan={2} className="text-right whitespace-nowrap">{formatVND(r.amount)}</td>
              </tr>
            ))}
            {view.byProject.length > 1 &&
              view.byProject.map((s) => (
                <tr key={`p-${s.key}`} className="italic">
                  <td colSpan={6} className="text-right">Cộng {s.label}</td>
                  <td colSpan={2} className="text-right whitespace-nowrap">{formatVND(s.amount)}</td>
                </tr>
              ))}
            {view.byItem.length > 1 &&
              view.byItem.map((s) => (
                <tr key={`i-${s.key}`} className="italic text-muted-foreground print:text-black">
                  <td colSpan={3} className="text-right">Tổng {s.label}</td>
                  <td className="text-right">{s.qty == null ? "—" : formatNumber(s.qty)}</td>
                  <td colSpan={2}></td>
                  <td colSpan={2} className="text-right whitespace-nowrap">{formatVND(s.amount)}</td>
                </tr>
              ))}
            <tr className="bg-muted/50 font-semibold">
              <td colSpan={7}>B. Cộng phát sinh trong kỳ</td>
              <td className="text-right whitespace-nowrap">{formatVND(view.totalIn)}</td>
            </tr>
            {view.thanhToanRows.map((r) => (
              <tr key={r.id}>
                <td></td>
                <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                <td colSpan={4}>{r.content ?? "Chuyển khoản"}</td>
                <td colSpan={2} className="text-right whitespace-nowrap">{formatVND(r.amount)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <td colSpan={7}>C. Chuyển khoản trong kỳ</td>
              <td className="text-right whitespace-nowrap">{formatVND(view.totalPaid)}</td>
            </tr>
            {view.adjustRows.length > 0 && (
              <>
                {view.adjustRows.map((r) => (
                  <tr key={r.id}>
                    <td></td>
                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                    <td colSpan={4}>{r.content ?? "Điều chỉnh"}</td>
                    <td colSpan={2} className="text-right whitespace-nowrap">{formatVND(r.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-semibold">
                  <td colSpan={7}>Điều chỉnh trong kỳ</td>
                  <td className="text-right whitespace-nowrap">{formatVND(view.totalAdjust)}</td>
                </tr>
              </>
            )}
            <tr className="bg-muted font-bold">
              <td colSpan={7}>Tổng nợ (A + B − C{view.adjustRows.length > 0 ? " + Điều chỉnh" : ""})</td>
              <td className="text-right whitespace-nowrap">{formatVND(totalDebt)}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-sm">
          Đề nghị quý Nhà cung cấp kiểm tra, đối chiếu và ký xác nhận số liệu trên. Mọi chênh lệch
          vui lòng phản hồi trong vòng 05 ngày kể từ ngày nhận bảng đối chiếu.
        </p>

        <div className="grid grid-cols-3 gap-4 pt-6 text-center text-sm">
          <div>
            <p className="font-semibold">Cán bộ vật tư</p>
            <p className="text-muted-foreground print:text-black">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-semibold">Kế toán phụ trách</p>
            <p className="text-muted-foreground print:text-black">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-semibold">Đại diện Nhà cung cấp</p>
            <p className="text-muted-foreground print:text-black">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
