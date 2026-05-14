# Brainstorm — Payment refactor + Báo cáo chi tiết công nợ

Date: 2026-05-14
Trigger: Flow `/thanh-toan` hiện tại không khớp SOP — 1 đợt phải chứa nhiều đề xuất khác category; congNo & luyKe nhập tay thay vì compute từ ledger.

## Problem statement

1. **Round bị khóa 1 category**: `PaymentRound.category` (vat_tu/nhan_cong/dich_vu/khac) khiến kế toán phải tạo nhiều đợt song song trong 1 tháng. SOP cho phép 1 đợt gom đề xuất thuộc nhiều category.
2. **congNo + luyKe nhập tay**: Người lập phải tra cứu thủ công từ module công nợ → dễ sai, không tự cập nhật khi ledger thay đổi.
3. **Module công nợ thiếu báo cáo chi tiết**: chưa có view group theo (chủ thể × nhà cung cấp × công trình) để tra cứu số dư + lũy kế.

## Constraints chốt qua Q&A

| Q | A |
|---|---|
| Chủ đợt | 1 mình kế toán lập (đơn giản permission) |
| Nguồn công nợ | LedgerTransaction (cong-no-vt + cong-no-nc) theo party × project |
| Phạm vi lũy kế | Toàn vòng đời theo công trình |
| Lũy kế lấy từ đâu | LedgerTransaction.thanh_toan — cần TẠO báo cáo chi tiết trong 2 module công nợ |
| Data hiện có | Wipe sạch (mới test) |

## Recommended solution — 2 sub-projects

### Sub-A: Balance service + báo cáo chi tiết công nợ (foundation)

**1. `lib/ledger/balance-service.ts`** (mới)
- `getOutstandingDebt(partyId, projectId, asOf?)` = SUM(lay_hang.totalTt) − SUM(thanh_toan.totalTt) đến mốc
- `getCumulativePaid(partyId, projectId)` = SUM(thanh_toan.totalTt) toàn vòng đời
- `getBalancesBulk(pairs)` → Map: 1 query GROUP BY tránh N+1

**2. `/cong-no-vt/chi-tiet` + `/cong-no-nc/chi-tiet`** (mới)
- Group: Chủ thể × Nhà cung cấp/Tổ đội × Công trình
- Cột: Phát sinh / Đã trả / Công nợ / Lũy kế
- Filter: tháng / dự án / chủ thể

**3. ACL + sidebar**
- Module keys: `cong-no-vt.chi-tiet`, `cong-no-nc.chi-tiet`
- axis: "dept", levels read/comment/edit
- VN labels + breadcrumb segment "chi-tiet" → "Chi tiết"

### Sub-B: Payment refactor (depend Sub-A)

**1. Schema migration** (wipe data đã confirm)
- `PaymentRound`: drop `category`; unique `(month, sequence, category)` → `(month, sequence)`
- `PaymentRoundItem`: + `category` (vat_tu/nhan_cong/dich_vu/khac); giữ `congNo` + `luyKe` làm **snapshot frozen** lúc create; +`balancesRefreshedAt` (optional)

**2. Service rewrite (`lib/payment/payment-service.ts`)**
- `upsertItem` (create path): auto-fill congNo + luyKe via balance-service
- New `refreshItemBalances(itemId)`: pull lại từ ledger (chỉ khi round draft)
- Bỏ `category` ở `createRound`; mỗi item tự khai
- Bỏ unique key chứa category

**3. UI**
- Create round: chỉ month + note
- Round detail: cột Category, dropdown khi add new item
- Khi chọn supplier+project → auto fill congNo/luyKe (read-only, có toggle override cho admin)
- Nút "Cập nhật số dư từ ledger" trên header (draft only)
- Tong-hop pivot: rows = supplier, cols = category × scope (8 cột) + totals

## Trade-offs đã chốt

| Decision | Lựa chọn | Lý do |
|---|---|---|
| Snapshot vs live compute | **Snapshot frozen + refresh button** | Báo cáo lịch sử ổn định, không shift khi ledger backdate |
| Override congNo/luyKe | **Read-only mặc định, admin override** | Trust source of truth, escape hatch khi cần |
| Build order | **Sub-A trước, Sub-B sau** | B tiêu thụ balance-service của A |
| Migration data | **Wipe** | Chưa go-live, đơn giản |

## Risks

- Performance: `getBalancesBulk` bắt buộc — N+1 chết table 100+ rows
- Ledger data completeness: nếu cong-no-vt/nc chưa nhập đủ, auto-fill sai → cần nút override + warning
- Existing payment data: 1 round + items vừa test sẽ mất sau wipe → confirmed OK
- ACL refactor 4-file ritual (modules.ts + labels.ts + role-defaults.ts + sidebar/breadcrumb) — đã có pattern từ thanh-toan

## Success criteria

- 1 đợt chứa nhiều category được & duyệt được per-item
- congNo/luyKe trên item create khớp với báo cáo chi tiết cùng (party, project)
- Báo cáo chi tiết cong-no-vt/nc match với data ledger
- Tong-hop pivot mới hiển thị đúng 8 cột × supplier

## Next steps

1. Plan Sub-A (3-4 phases): balance-service → cong-no-vt detail → cong-no-nc detail → ACL/nav
2. Plan Sub-B (3 phases): schema migration → service rewrite → UI refactor
3. Execute Sub-A first; Sub-B sau khi A green
