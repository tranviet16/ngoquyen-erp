/**
 * Phần 3 "Ba danh sách": lấy hàng / lấy hóa đơn / chuyển tiền (NCC, đội) hoặc nghiệm thu / hóa đơn đã
 * xuất / đã nhận (CĐT), mỗi danh sách có dòng tổng, ghi nguồn và link "Sửa ở sổ gốc". Người không có
 * quyền xem sổ công nợ chỉ thấy các tổng.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { ContractFigures } from "@/lib/du-an/contract-detail/types";

interface ListProps {
  title: string;
  source: string;
  editHref: string;
  heads: string[];
  /** Cột số (căn phải) tính từ cuối. */
  numericCols: number;
  rows: ReactNode[][];
  total: ReactNode[];
  note?: ReactNode;
  emptyText: string;
}

function SourceList({ title, source, editHref, heads, numericCols, rows, total, note, emptyText }: ListProps) {
  const isNum = (i: number) => i >= heads.length - numericCols;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium">{title}</h4>
        <span className="text-xs text-muted-foreground">
          Nguồn: {source} · <Link className="underline" href={editHref}>Sửa ở sổ gốc →</Link>
        </span>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <Table className="min-w-0">
        <TableHeader>
          <TableRow>{heads.map((h, i) => <TableHead key={h} className={isNum(i) ? "text-right" : ""}>{h}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={heads.length} className="text-center text-muted-foreground">{emptyText}</TableCell></TableRow>
          ) : (
            rows.map((r, ri) => (
              <TableRow key={ri}>{r.map((c, i) => <TableCell key={i} className={isNum(i) ? "text-right tabular-nums" : ""}>{c}</TableCell>)}</TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">{total.map((c, i) => <TableCell key={i} className={isNum(i) ? "text-right tabular-nums" : ""}>{c}</TableCell>)}</TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

const n = (v: string | null | undefined) => formatNumber(v ?? null);

interface Props {
  projectId: number;
  figures: ContractFigures;
  ledgerDetailHidden: boolean;
}

export function ContractSourceLists({ projectId, figures, ledgerDetailHidden }: Props) {
  if (figures.partyKind === "cdt") {
    const c = figures.cdt;
    const base = `/du-an/${projectId}`;
    return (
      <section className="space-y-4">
        <h3 className="font-semibold">Nghiệm thu, hóa đơn, tiền nhận</h3>
        <SourceList
          title="Lũy kế nghiệm thu (gồm VAT)" source="tab Nghiệm thu" editHref={`${base}/nghiem-thu`} emptyText="Chưa có nghiệm thu có giá trị CĐT."
          heads={["Ngày", "Đợt", "Hạng mục", "Giá trị CĐT"]} numericCols={1}
          rows={c.lists.nghiemThu.map((r) => [formatDate(r.acceptedAt), r.acceptanceBatch ?? "", r.checkItem, n(r.amount)])}
          total={["Tổng", "", "", n(c.nghiemThu)]}
        />
        <SourceList
          title="Hóa đơn đã xuất" source="sổ hóa đơn xuất CĐT" editHref={`${base}/hop-dong/hoa-don-cdt`} emptyText="Chưa có hóa đơn xuất CĐT."
          heads={["Ngày", "Ký hiệu", "Số HĐ", "Chưa VAT", "VAT", "Tổng"]} numericCols={3}
          rows={c.lists.hoaDonXuat.map((r) => [formatDate(r.invoiceDate), r.invoiceSymbol ?? "", r.invoiceNo, n(r.amountVnd), n(r.vatVnd), n(r.total)])}
          total={["Tổng", "", "", "", "", n(c.hoaDonXuat)]}
        />
        <SourceList
          title="Đã nhận từ CĐT" source="tab Dòng tiền 3 bên (CĐT → công ty trừ công ty → CĐT)" editHref={`${base}/dong-tien-3-ben`} emptyText="Chưa có dòng tiền CĐT."
          heads={["Ngày", "Bên trả", "Bên nhận", "Số tiền"]} numericCols={1}
          rows={c.lists.daNhan.map((r) => [formatDate(r.date), r.payerName ?? "", r.payeeName ?? "", n(r.signedAmount)])}
          total={["Tổng", "", "", n(c.daNhan)]}
        />
      </section>
    );
  }

  const l = figures.ledger;
  const isNcc = figures.partyKind === "ncc";
  const editHref = isNcc ? "/cong-no-vt/nhap-lieu" : "/cong-no-nc/nhap-lieu";
  const source = isNcc ? "sổ công nợ vật tư" : "sổ công nợ nhân công";
  const t = l.totals;

  if (ledgerDetailHidden || !l.lists) {
    return (
      <section className="space-y-2">
        <h3 className="font-semibold">Lấy hàng, hóa đơn, chuyển tiền</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Lũy kế lấy hàng (TT)", n(t.layHang)],
            ["Hóa đơn đã lấy", n(t.hoaDon)],
            ["Đã chuyển tiền (TT / HĐ)", `${n(t.chuyenTienTt)} / ${n(t.chuyenTienHd)}`],
          ].map(([label, shown]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 font-semibold tabular-nums">{shown}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Cần quyền xem Công nợ {isNcc ? "vật tư" : "nhân công"} để xem từng dòng.</p>
      </section>
    );
  }

  const lists = l.lists;
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Lấy hàng, hóa đơn, chuyển tiền</h3>
      <SourceList
        title="Lấy hàng" source={source} editHref={editHref} emptyText="Chưa có dòng lấy hàng."
        heads={["Ngày", "Loại", "Nội dung", "Số lượng", "Thành tiền (TT)"]} numericCols={2}
        rows={lists.layHang.map((r) => [formatDate(r.date), r.typeLabel, r.itemName ?? r.content ?? "", n(r.qty), n(r.amount)])}
        total={["Tổng", `trong đó thuế HĐ: ${n(t.thueHd)}`, "", "", n(t.layHang)]}
      />
      <SourceList
        title="Lấy hóa đơn" source={source} editHref={editHref} emptyText="Chưa có hóa đơn."
        note={lists.hoaDonMissingNoCount > 0 ? `${lists.hoaDonMissingNoCount} dòng chưa ghi số HĐ.` : undefined}
        heads={["Số HĐ", "Ngày HĐ", "Số dòng", "Giá trị HĐ"]} numericCols={2}
        rows={lists.hoaDon.map((g) => [g.label, formatDate(g.invoiceDate), String(g.rows.length), n(g.total)])}
        total={["Tổng", "", "", n(t.hoaDon)]}
      />
      <SourceList
        title="Chuyển tiền" source={source} editHref={editHref} emptyText="Chưa có lần chuyển tiền."
        heads={["Ngày", "Loại", "Nội dung", "Theo TT", "Theo HĐ"]} numericCols={2}
        rows={lists.chuyenTien.map((r) => [formatDate(r.date), r.typeLabel, r.content ?? "", n(r.amountTt), n(r.amountHd)])}
        total={["Tổng", "", "", n(t.chuyenTienTt), n(t.chuyenTienHd)]}
      />
    </section>
  );
}
