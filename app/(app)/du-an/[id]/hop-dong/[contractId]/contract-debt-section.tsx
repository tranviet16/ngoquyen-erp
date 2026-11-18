/**
 * Phần 4 "Công nợ": NCC / đội — đầu kỳ, còn phải trả theo TT và theo HĐ, hóa đơn còn phải lấy (loại
 * thuế HĐ); CĐT — còn phải thu theo nghiệm thu, theo hóa đơn, hóa đơn còn phải xuất (gồm VAT).
 */
import { formatNumber } from "@/lib/utils/format";
import type { ContractFigures } from "@/lib/du-an/contract-detail/types";

export const OPENING_NOTE = "Chỉ tính giao dịch từ sau số dư đầu kỳ.";

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="font-semibold tabular-nums">{formatNumber(value)}</div>
    </div>
  );
}

export function ContractDebtSection({ figures }: { figures: ContractFigures }) {
  if (figures.partyKind === "cdt") {
    const c = figures.cdt;
    return (
      <section className="space-y-2">
        <h3 className="font-semibold">Công nợ</h3>
        <div className="rounded-lg border px-3">
          <Row label="Còn phải thu theo nghiệm thu" value={c.conPhaiThuTheoNghiemThu} hint="Nghiệm thu − đã nhận (gồm VAT)" />
          <Row label="Còn phải thu theo hóa đơn" value={c.conPhaiThuTheoHoaDon} hint="Hóa đơn đã xuất − đã nhận" />
          <Row label="Hóa đơn còn phải xuất" value={c.hoaDonConPhaiXuat} hint="Nghiệm thu − hóa đơn đã xuất" />
        </div>
      </section>
    );
  }
  const d = figures.ledger.debt;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Công nợ</h3>
      <div className="rounded-lg border px-3">
        <Row label="Số dư đầu kỳ (TT / HĐ)" value={d.dauKyTt} hint={`HĐ: ${formatNumber(d.dauKyHd)}`} />
        <Row label="Còn phải trả theo thực tế" value={d.conPhaiTraTt} hint="Đầu kỳ + lấy hàng − đã chuyển (TT)" />
        <Row label="Còn phải trả theo hóa đơn" value={d.conPhaiTraHd} hint="Đầu kỳ + hóa đơn đã lấy − đã chuyển (HĐ)" />
        <Row
          label="Hóa đơn còn phải lấy"
          value={d.hoaDonConPhaiLay}
          hint={`Lấy hàng (không gồm thuế HĐ) − hóa đơn đã lấy.${d.openingNote ? ` ${OPENING_NOTE}` : ""}`}
        />
      </div>
    </section>
  );
}
