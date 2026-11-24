---
phase: 2
title: "Hàm tổng hợp thuần và unit test"
status: completed
priority: P1
effort: "6h"
dependencies: []
---

# Phase 2: Hàm tổng hợp thuần và unit test

## Goal
Chốt mọi công thức của màn chi tiết và cột danh mục thành code thuần có test trước.
- Code không import `@/lib/prisma`, chỉ dùng `Prisma.Decimal`.
- Code không tự phân loại giao dịch.
- Làm song song với Phase 1.

## Files to Create
Tất cả nằm trong `lib/du-an/contract-detail/`:
- `types.ts`: `LedgerRowInput`, `OpeningInput`, `CdtInputs`, `ContractFigures`, `ListFigure`, `UnfulfilledCell = { kind: "amount"; value } | { kind: "missing"; have; total }`.
- `ledger-figures.ts`: `buildLedgerFigures(rows, openings)`.
- `invoice-grouping.ts`: `groupInvoiceRows(rows)`.
- `cdt-figures.ts`: `buildCdtFigures({ acceptances, invoices, cashflows, projectContractValue, cdtContractsValueDt })`.
- `unfulfilled.ts`: `buildUnfulfilled(groupValues, performed)`.
- `contract-group.ts`: `resolveGroup(contract, siblings)`.
- `list-figures.ts`:
  - `buildListFigure(canonicalPairRows, cdtTotals)` dùng cho cột danh mục, không có bước đối chiếu;
  - `sumByEntityRounded(rows)` dùng cho tie-out ở Phase 4.
- `__tests__/*.test.ts` cho từng tệp.

Mỗi tệp dưới 200 dòng.

## Công thức

**Đầu vào.** Mỗi dòng sổ đến từ SQL ở Phase 4, đã mang sẵn `incTt, incHd, decTt, decHd`, tính bằng `increaseSql` / `decreaseSql` của `lib/ledger/transaction-classification.ts`. Dòng còn mang `entityId, date, transactionType, invoiceNo, invoiceDate, content, qty, itemName`. Hàm thuần không chứa literal loại giao dịch; nhãn lấy từ `TRANSACTION_TYPE_LABELS`.

**NCC và đội thi công.** Tổng hiển thị = Σ các dòng (cộng chính xác, làm tròn một lần khi hiển thị).

| Đại lượng | Công thức |
|---|---|
| `O_tt`, `O_hd` | Σ số dư đầu kỳ |
| Danh sách A "Lấy hàng" | Dòng có `incTt ≠ 0`: `lay_hang` (kể cả dòng âm khi trả hàng), `thue_hd`, `dieu_chinh` dương |
| `ΣA` | Σ `incTt` |
| `T`, trong đó thuế HĐ | Σ `incTt` của dòng `thue_hd`, hiện thành dòng phụ của A |
| Danh sách B "Lấy hóa đơn" | Dòng có `incHd ≠ 0`. Gom theo `btrim(invoiceNo)` khi có số; dòng không số đứng riêng với nhãn "Chưa ghi số HĐ" |
| `ΣB` | Σ `incHd` |
| Danh sách C "Chuyển tiền" | Dòng có `decTt ≠ 0` hoặc `decHd ≠ 0`. Có hai cột TT và HĐ |
| `ΣC_tt`, `ΣC_hd` | Σ `decTt`, Σ `decHd` |
| Còn phải trả theo thực tế | `O_tt + ΣA − ΣC_tt` |
| Còn phải trả theo hóa đơn | `O_hd + ΣB − ΣC_hd` |
| Hóa đơn còn phải lấy `G` | `(ΣA − T) − ΣB`. **Loại thuế HĐ**, người dùng đã chốt 2026-11-18 |

Một dòng `dieu_chinh` có TT và HĐ trái dấu nằm ở cả A và C, đúng như fragment SQL đã tách.

**CĐT.** Mọi số đều **gồm VAT**, người dùng đã chốt.
- `A'` = Σ `amountCdtVnd` của nghiệm thu chưa xóa và khác 0.
- `B'` = Σ (`amountVnd + vatVnd`) của hóa đơn CĐT chưa xóa. Dòng âm (điều chỉnh giảm) vẫn cộng vào.
- `C'` = dòng tiền chưa xóa: `cdt_to_cty` mang dấu +, `cty_to_cdt` mang dấu −, các chiều khác bỏ qua.
- Còn phải thu theo nghiệm thu = `A' − C'`; theo hóa đơn = `B' − C'`; hóa đơn còn phải xuất = `A' − B'`.
- `projectValueMismatch`: so `Project.contractValue` với Σ `valueVnd` (DT) của các hợp đồng CĐT. Cờ bật khi cả hai đều khác NULL mà lệch nhau. Kết quả trả thêm cả hai số để UI hiện cạnh nhau.

**Phần hợp đồng chưa thực hiện.** Bảng 3 dòng × 2 cột, gồm `V_dt = Σ valueVnd` và `V_tt = Σ valueTtVnd` cộng trên các hợp đồng của nhóm gộp.

| Dòng | NCC / đội | CĐT |
|---|---|---|
| Giá trị − lũy kế lấy hàng | `V − (ΣA − T)` | `V − A'` |
| Giá trị − hóa đơn đã lấy (đã xuất) | `V − ΣB` | `V − B'` |
| Giá trị − đã chuyển tiền (đã nhận) | `V − ΣC_hd` (**theo số HĐ** của dòng thanh toán, người dùng đã chốt) | `V − C'` |

- Ô thiếu giá trị trả `{ kind: "missing", have, total }`. Giá trị 0 vẫn tính là đã nhập.
- Số âm giữ nguyên dấu; UI hiển thị "Vượt x".
- Khi `O_tt ≠ 0` hoặc `O_hd ≠ 0`, bật cờ `openingNote` để UI ghi "Chỉ tính giao dịch từ sau số dư đầu kỳ" ở khối này và ở `G`.

**Nhóm gộp:** các hợp đồng chưa xóa cùng dự án, cùng `partyKind`, và cùng `supplierId` hoặc `contractorId`. Với CĐT là mọi hợp đồng CĐT của dự án. Hợp đồng đã hết hạn hoặc chấm dứt vẫn nằm trong nhóm.

**`buildListFigure`.** Cột "Công nợ còn lại (TT)":
- NCC/đội: `cuoiKyTt` của cặp, lấy từ báo cáo canonical (Σ qua Chủ thể);
- CĐT: `A' − C'`;
- loại khác: `null`.

## Tasks & Steps
1. Viết `types.ts`, sau đó viết test trước theo bảng dưới.
2. Cài đặt. Không dùng `Number()` cho tiền. Số đưa ra ngoài là chuỗi.

## Verification
- `pnpm vitest run lib/du-an/contract-detail` và `pnpm exec tsc --noEmit`.

| # | Fixture | Kỳ vọng | AC |
|---|---|---|---|
| U1 | Gồm:<br>• đầu kỳ 1000/900;<br>• `lay_hang` 500/550 HĐ "HD1";<br>• `lay_hang` 300/0;<br>• `lay_hang` 200/220 không số;<br>• `lay_hang` −50/−50;<br>• `thue_hd` 30/0;<br>• `dieu_chinh` +40 TT / −20 HĐ;<br>• `dieu_chinh` −15/0;<br>• `thanh_toan` 600/650 | ΣA = 1020; T = 30; ΣB = 720; ΣC_tt = 615; ΣC_hd = 670; công nợ TT 1405; công nợ HĐ 950; G = 270. Dòng `dieu_chinh` trái dấu nằm ở cả A và C. | 2, 9 |
| U2 | Số HĐ " HD1" và "HD1", cộng một dòng không số | 2 mục; Σ các nhóm = ΣB | 2 |
| U3 | `sumByEntityRounded`: hai Chủ thể, mỗi bên 0,50 | Ra 1 + 1 = 2. Nếu cộng gộp rồi mới làm tròn sẽ ra 1, nên test phân biệt được hai cách | 2 |
| U4 | V_dt 2000, V_tt 1800, dùng số U1 | Lấy hàng: 2000 − 990 = 1010 và 1800 − 990 = 810. Hóa đơn: 1280 và 1080. Chuyển tiền (theo HĐ 670): 1330 và 1130 | 4 |
| U5 | `V_tt = null`, `V_dt = 0` | Cột TT ra `missing`; cột DT ra số, có thể âm | 4 |
| U6 | Nhóm 3 hợp đồng, 1 hợp đồng thiếu `V_tt` | `missing 2/3`; `V_dt` = tổng của cả 3 | 4, 5 |
| U7 | `docType = license` hoặc `partyKind = null` | Không có khối số | 7 |
| U8 | Gồm:<br>• nghiệm thu 100 và 0;<br>• `cdt_to_cty` 70 và 20;<br>• `cty_to_cdt` 10;<br>• `cty_to_doi` 999;<br>• hóa đơn 60 + 6 và hóa đơn điều chỉnh −10 − 1 | A' = 100; C' = 80; B' = 55; còn phải thu 20 / −25; hóa đơn còn phải xuất 45 | 3 |
| U9 | Cặp chỉ có đầu kỳ; cặp không có gì | Danh sách rỗng, tổng 0, `openingNote` bật/tắt đúng | 2, 3 |
| U10 | `contractValue` 5000, Σ V_dt CĐT 4800; trường hợp `contractValue` null | Cờ lệch bật; null thì không bật | 3 |
| U11 | `buildListFigure` với cặp có 2 Chủ thể và CĐT | Cuối kỳ TT = Σ qua Chủ thể; CĐT = A' − C' | 1 |
