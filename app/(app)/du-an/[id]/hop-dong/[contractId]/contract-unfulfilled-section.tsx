/**
 * Phần 5 "Phần hợp đồng chưa thực hiện": bảng 3 × 2 (DT, TT). Ô thiếu giá trị ghi rõ số hợp đồng đã
 * có giá trị; số âm ghi "Vượt x".
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils/format";
import type { ContractFigures, UnfulfilledCell } from "@/lib/du-an/contract-detail/types";
import { OPENING_NOTE } from "./contract-debt-section";

function Cell({ cell }: { cell: UnfulfilledCell }) {
  if (cell.kind === "missing") {
    return <span className="text-muted-foreground">Chưa nhập giá trị ({cell.have}/{cell.total} hợp đồng có giá trị)</span>;
  }
  if (cell.value.startsWith("-")) {
    return <span className="text-red-700 dark:text-red-300">Vượt {formatNumber(cell.value.slice(1))}</span>;
  }
  return <span>{formatNumber(cell.value)}</span>;
}

export function ContractUnfulfilledSection({ figures }: { figures: ContractFigures }) {
  const u = figures.unfulfilled;
  const cdt = figures.partyKind === "cdt";
  const rows: [string, keyof typeof u][] = [
    [cdt ? "Giá trị − lũy kế nghiệm thu" : "Giá trị − lũy kế lấy hàng (không gồm thuế HĐ)", "layHang"],
    [cdt ? "Giá trị − hóa đơn đã xuất" : "Giá trị − hóa đơn đã lấy", "hoaDon"],
    [cdt ? "Giá trị − đã nhận" : "Giá trị − đã chuyển tiền (theo số HĐ của các lần thanh toán)", "chuyenTien"],
  ];
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Phần hợp đồng chưa thực hiện</h3>
      <Table className="min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="text-right">Theo giá trị DT</TableHead>
            <TableHead className="text-right">Theo giá trị TT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, key]) => (
            <TableRow key={key}>
              <TableCell>{label}</TableCell>
              <TableCell className="text-right tabular-nums"><Cell cell={u[key].dt} /></TableCell>
              <TableCell className="text-right tabular-nums"><Cell cell={u[key].tt} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {figures.openingNote && <p className="text-xs text-muted-foreground">{OPENING_NOTE}</p>}
    </section>
  );
}
