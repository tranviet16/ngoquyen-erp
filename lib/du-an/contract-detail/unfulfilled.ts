/**
 * Phần hợp đồng chưa thực hiện: bảng 3 dòng × 2 cột (giá trị theo DT và theo TT).
 *
 * Mỗi ô = V − đã thực hiện, với V cộng trên mọi hợp đồng của nhóm gộp. Nếu có hợp đồng
 * trong nhóm chưa nhập giá trị ở cột đó thì cả cột trả `missing` kèm k/N; giá trị 0 vẫn
 * tính là đã nhập. Số âm giữ nguyên dấu (UI hiển thị "Vượt x"). Module thuần.
 *
 * "Đã thực hiện" do hàm dựng số cung cấp (`performed`):
 *  - NCC/đội: ΣA − T (loại thuế HĐ), ΣB, ΣC_hd (chuyển tiền theo số HĐ);
 *  - CĐT: A', B', C' (gồm VAT).
 */

import { decStr, toDec, type ContractGroup, type GroupValue, type PerformedTotals, type UnfulfilledCell, type UnfulfilledTable } from "./types";

function cell(value: GroupValue, performed: string): UnfulfilledCell {
  if (value.have < value.total) return { kind: "missing", have: value.have, total: value.total };
  return { kind: "amount", value: decStr(toDec(value.sum).minus(toDec(performed))) };
}

export function buildUnfulfilled(
  groupValues: Pick<ContractGroup, "valueDt" | "valueTt">,
  performed: PerformedTotals,
): UnfulfilledTable {
  const row = (done: string) => ({
    dt: cell(groupValues.valueDt, done),
    tt: cell(groupValues.valueTt, done),
  });
  return {
    layHang: row(performed.layHang),
    hoaDon: row(performed.hoaDon),
    chuyenTien: row(performed.chuyenTien),
  };
}
