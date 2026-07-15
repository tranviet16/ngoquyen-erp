# Brainstorm — Module "Nghĩa vụ với Nhà nước"

Date: 2026-05-21 | Status: Approved → plan

## 1. Problem statement

Cần theo dõi nghĩa vụ thực hiện với nhà nước (thuế GTGT/TNDN/TNCN/môn bài, BHXH/BHYT/BHTN/KPCĐ...)
theo mô hình: **đầu kỳ → trong kỳ (phát sinh tăng / giảm) → cuối kỳ**.

## 2. Bối cảnh codebase (scout)

- Chưa có hệ thống tài khoản kế toán (GL). `JournalEntry` dùng tên TK dạng chuỗi, focus thu/chi tiền.
- Mẫu "Đầu kỳ | PS Tăng | PS Giảm | Cuối kỳ" đã có ở `components/ledger/monthly-report.tsx`
  (`cuối = đầu + tăng − giảm`) — tái dùng được.
- Công thức số dư: `lib/ledger/balance-service.ts` — `outstanding = opening + Σtăng(≤asOf) − Σgiảm(≤asOf)`.
- 2 kiểu lưu kỳ: ledger giao dịch (công nợ, cắt theo `date`) vs nhập tháng (SL-DT, cột year+month).
- Hạ tầng lưới: `components/data-grid/` (ResourceSpec, sửa tại chỗ, dán, sort/filter — vừa mở rộng plan 260520).
- Module tài chính: `app/(app)/tai-chinh/` (vay, nguồn-tiền, nhật-ký, phân-loại, phải-thu-trả, báo-cáo-thanh-khoản).

## 3. Quyết định kiến trúc (chốt qua hỏi đáp)

| Vấn đề | Lựa chọn |
|--------|----------|
| Mức chi tiết | Số dư đầu kỳ nhập 1 lần + **sổ giao dịch** từng khoản phải trả/đã nộp; tổng hợp theo Tháng/Quý/Năm |
| Chiều phân tích | **Toàn công ty** — không entityId/projectId |
| Danh mục nghĩa vụ | **Seed sẵn + cho sửa**, có mã TK kế toán (333x/338x) optional |
| Liên kết dòng tiền | **Liên kết JournalEntry** — khoản "đã nộp" sinh bút toán chi |

## 4. Approaches đã cân nhắc

- **A. Snapshot tổng tháng (denormalized):** 1 dòng/(nghĩa vụ,tháng) lưu sẵn opening/tăng/giảm/closing.
  Đơn giản nhập liệu nhưng đầu kỳ N+1 phải = cuối kỳ N (rủi ro lệch), mất chi tiết giao dịch. → loại.
- **B. Ledger giao dịch + kỳ tính SQL (CHỌN):** master + sổ phát sinh có `date`; đầu/cuối kỳ derived.
  Khớp yêu cầu "tổng hợp Tháng/Quý/Năm", không lệch, tái dùng `balance-service.ts`.
- **C. Tái dùng JournalEntry làm sổ:** không bắt được "phát sinh phải trả" (accrual, không phải dòng tiền). → loại.

## 5. Giải pháp chốt

### Mô hình dữ liệu — 2 bảng mới

**`StateObligationType`** (danh mục, seed sẵn):
- `name` unique, `code` String? (mã TK "3331"...), `category` String (`thue`|`bao_hiem`|`khac`)
- `openingBalance` Decimal(18,2), `openingDate` DateTime — số dư đầu kỳ nhập 1 lần
- `sortOrder` Int, `deletedAt` DateTime?, timestamps

**`StateObligationTxn`** (sổ phát sinh):
- `typeId` FK → StateObligationType
- `date` DateTime (ngày ghi nhận), `kind` String (`phai_tra`|`da_nop`), `amount` Decimal(18,2)
- `cashAccountId` Int? + `journalEntryId` Int? — chỉ với `da_nop`
- `refNo` String?, `description` String?, `note` String?, `deletedAt`, timestamps
- index `[typeId, date]`, `[kind, date]`

### Công thức
```
Còn phải nộp tại asOf = openingBalance + Σ phai_tra(date≤asOf) − Σ da_nop(date≤asOf)
Đầu kỳ N = còn phải nộp ngay trước kỳ N ; Cuối kỳ N = Đầu kỳ N + Σtăng kỳ − Σgiảm kỳ
```
Đầu/cuối kỳ luôn derived (không lưu) → không lệch. Tổng hợp Tháng/Quý/Năm cắt theo `date`.

### Liên kết JournalEntry
- Nguồn sự thật = `StateObligationTxn`. Tạo dòng `da_nop` → tự sinh `JournalEntry`
  (`entryType="chi"`, `fromAccountId=cashAccountId`, `refModule="state_obligation"`, `refId=txn.id`).
- Sửa amount / xóa `da_nop` → đồng bộ / soft-delete bút toán liên kết, trong 1 transaction.
- `phai_tra` không sinh bút toán. Dashboard/báo cáo thanh khoản đọc `journal_entries` → tự đúng.

### UI — 3 trang `/tai-chinh/nghia-vu-nha-nuoc/`
1. `/danh-muc` — lưới danh mục (tên, mã TK, nhóm, số dư đầu kỳ).
2. `/so-theo-doi` — lưới phát sinh (FK nghĩa vụ, ngày, loại, số tiền, TK tiền, chứng từ; dán hàng loạt).
3. `/bao-cao` — bảng tổng hợp chọn kỳ Tháng|Quý|Năm: mỗi nghĩa vụ 1 dòng Đầu kỳ|PS phải trả|Đã nộp|Cuối kỳ,
   gộp tổng theo nhóm Thuế/Bảo hiểm (pattern `monthly-report.tsx`).
- Thêm 1 nav item ở `/tai-chinh/`.

### Seed chuẩn VN
Thuế: GTGT (3331), TNDN (3334), TNCN (3335), Môn bài (3338).
Bảo hiểm: BHXH (3383), BHYT (3384), BHTN (3386), KPCĐ (3382).

### Tái dùng
DataGrid + ResourceSpec, `formatVND`, balance-service pattern, `monthly-report.tsx` pattern.

## 6. Ngoài phạm vi (YAGNI)
Hệ thống TK kế toán đầy đủ + bút toán kép; phân bổ theo dự án/chủ thể; lịch nhắc hạn nộp;
tách "kỳ tính thuế" khỏi ngày ghi nhận (hướng dẫn: dòng `phai_tra` nhập `date` = ngày cuối kỳ thuế).
Import Excel: chưa làm ngay, hạ tầng `ImportRun` sẵn sàng cho sau.

## 7. Rủi ro & giảm thiểu
1. **Đồng bộ JournalEntry ↔ StateObligationTxn** (sửa/xóa) — phần dễ sai nhất → làm trong transaction, test kỹ.
2. Đếm trùng dòng tiền nếu ghi khoản nộp thuế ở cả Nhật ký lẫn module này → quy ước: nộp thuế chỉ ghi ở đây.
3. Số dư đầu kỳ sai → mọi kỳ sai theo → validate input, cho phép sửa.

## 8. Success criteria
- Tạo/sửa danh mục nghĩa vụ; seed 8 mục chuẩn VN.
- Nhập phát sinh phải trả & đã nộp; dán hàng loạt OK.
- Báo cáo Tháng/Quý/Năm: đầu kỳ + tăng − giảm = cuối kỳ khớp; tổng theo nhóm đúng.
- Mỗi khoản "đã nộp" sinh đúng 1 bút toán chi; xóa/sửa đồng bộ; cashflow không đếm trùng.
- `tsc --noEmit` + lint + vitest xanh.

## 9. Next steps
→ `/ck:plan` lập kế hoạch chi tiết theo phase (schema+migration → service → UI danh mục → UI sổ → UI báo cáo → seed → test).
