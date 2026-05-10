# Phase 1 — Formula Mapping (read-only audit)

Source: `SOP/SL - DT 2025.xlsx`, sheets tháng 10/11/12 + master sheets (`TIẾN ĐỘ NỘP TIỀN`, `CauHinh`).
Method: parse với `xlsx.readFile(..., { cellFormula: true })`, dedupe formulas theo column-letter.

## 1. Báo cáo Sản lượng (per month) — `Báo cáo sản lượng Tháng XX năm`

Layout: 1 row/lô. Cols A=STT, B=Tên lô, C..K = số liệu.

| Col | Tên | Loại | Công thức / Nguồn |
|---|---|---|---|
| C | Giá trị dự toán | INPUT | từ dự toán lô (static) |
| D | SL kế hoạch kỳ này | INPUT | chỉ tiêu giao kỳ |
| E | SL thực kỳ này (thô) | INPUT | nghiệm thu thô kỳ này |
| F | SL lũy kế (thô) | INPUT | tổng nghiệm thu thô tới kỳ |
| G | SL trát (lũy kế) | INPUT | tổng trát tới kỳ |
| **H** | **Tổng thô+trát** | **COMPUTED** | `= F + G` |
| **I** | **Còn phải thực hiện** | **COMPUTED** | `= C - F` |
| **J** | **% kế hoạch kỳ** | **COMPUTED** | `= IF(D=0, 0, E/D)` |
| **K** | **% lũy kế** | **COMPUTED** | `= IF(C=0, 0, F/C)` |

Subtotal: hàng giai đoạn = `Hg11 + Hg64 + Hg72 + Hg84` (sum nhóm). Hàng nhóm = `SUM(rows)` của các lô con. → app phải tự rollup theo hierarchy phase → group → lot.

Edge cases (1-off cells, rare):
- `M16 = ROUND(13.806*4, 3)` — m² × số tầng cho 1 lô đặc biệt → bỏ qua (không nằm trong cấu trúc chính).
- `G37 = 170235000/1.08` — strip VAT 8% cho 1 lô → bỏ qua.

**Rule for adapter:** chỉ import C, D, E, F, G. Bỏ H, I, J, K (compute lại).

---

## 2. Báo cáo Doanh thu (per month) — `Báo cáo doanh thu Tháng XX năm`

Layout: 1 row/lô. Cols D..Q.

| Col | Tên | Loại | Công thức |
|---|---|---|---|
| D | Giá trị HĐ | INPUT | hợp đồng |
| E | DT dự kiến | INPUT | KH kỳ |
| F | DT Thô kỳ này | INPUT | thanh toán thô kỳ |
| G | DT Thô lũy kế | INPUT | tổng thanh toán thô |
| **H** | **Công nợ thu (Thô)** | **COMPUTED** | `= D - G` |
| I | QT Trát chưa | INPUT | quyết toán trát |
| J | DT Trát kỳ này | INPUT | thanh toán trát kỳ |
| K | DT Trát lũy kế | INPUT | tổng thanh toán trát |
| **L** | **Công nợ thu (Trát)** | **COMPUTED** | `= I - K` |
| **M** | **DT Tổng kỳ này** | **COMPUTED** | `= F + J` |
| **N** | **DT Tổng lũy kế** | **COMPUTED** | `= G + K` |
| **O** | **Công nợ tổng** | **COMPUTED** | `= H + L` |
| **P** | **% HT kế hoạch** | **COMPUTED** | `= IF(E=0, 0, F/E)` |
| **Q** | **% HT lũy kế** | **COMPUTED** | `= IF(D=0, 0, G/D)` |

Subtotal pattern khớp với Sản lượng: `D10 = D11+D64+D72+D84` (giai đoạn = sum nhóm); `D11 = SUM(D12:D62)` (nhóm = sum lô).

**Rule for adapter:** chỉ import D, E, F, G, I, J, K. Bỏ H, L, M, N, O, P, Q.

---

## 3. Chỉ tiêu — `Chỉ tiêu SL DT Tháng XX năm`

Format khác hẳn 2 báo cáo trên. Đa số cells trong block lô là INPUT thủ công. Hai cột compute lớn:

### L = "Phải nộp tiền" (cumulative payment cần nộp tới tiến độ hiện tại)
```
IF(P = "Đã quyết toán", C,
  LET(
    MaLo, B,
    Diem_HienTai = VLOOKUP(M, CauHinh!$A:$B, 2, 0)   // M = tiến độ hiện tại (text)
    Tien_Dot1..4 = VLOOKUP(MaLo, 'TIẾN ĐỘ NỘP TIỀN'!$B:$Z, 3/5/7/9, 0)
    Moc_Diem_1..3 = VLOOKUP(MaLo, 'TIẾN ĐỘ NỘP TIỀN'!$B:$Z, 23/24/25, 0)
    Can_DotN = Diem_HienTai >= (Moc_Diem_(N-1) - 10)
    PhaiNop = Tien_Dot1 + IF(Can_Dot2, Tien_Dot2, 0) + IF(Can_Dot3, Tien_Dot3, 0) + IF(Can_Dot4, Tien_Dot4, 0)
  )
)
```

### O = "Trạng thái nộp tiền"
- `TienDaDong = E + I` (đã nộp lũy kế)
- nếu `TienDaDong >= L` → `"✅ Đủ tiền"`
- ngược lại → `"⚠️ Cần nộp Đợt N (Còn thiếu X) - Tổng cần nộp Y"`
- `TenDot` = đợt cao nhất mà `Diem_HienTai >= (Moc_Diem_(N-1) - 10)`.

### Phụ thuộc bên ngoài
- **`CauHinh` sheet (A:B)** — map text milestone → numeric score (e.g. "Mái tầng 1" → 5, "Xong khung BTCT" → 10, ...). Cần import như một lookup config.
- **`TIẾN ĐỘ NỘP TIỀN` (master)** — 1 row/lô, holds: B=mã lô, C=Giá trị dự toán, D=Tiền đợt 1, E=Mốc đợt 1 (text), F=Tiền đợt 2, G=Mốc đợt 2, H=Tiền đợt 3, I=Mốc đợt 3, J=Tiền đợt 4, K=Mốc đợt 4. Cols X/Y/Z = VLOOKUP convert text → score (cached cho perf).

---

## 4. Tiến độ Xây Dựng (per month) — `TIẾN ĐỘ XÂY DỰNG THÁNG XX`

Mọi cell đều là **echo** từ Chỉ tiêu sheet:
```
A2 = 'Chỉ tiêu SL DT Tháng XX'!A2
E11 = 'Chỉ tiêu SL DT Tháng XX'!N13   // tiến độ hiện tại của lô 1
```
→ **Không có compute**. Đây là view rendered từ Chỉ tiêu (status text per lô + per stage). App: lấy thẳng từ `sl_dt_progress_status` snapshot, không cần lưu riêng.

---

## 5. TIẾN ĐỘ NỘP TIỀN (master, không theo tháng)

| Col | Nội dung |
|---|---|
| B | Mã lô / tên lô |
| C | Giá trị dự toán |
| D, F, H, J | Tiền đợt 1/2/3/4 (số) |
| E, G, I, K | Mốc đợt 1/2/3/4 (text milestone) |
| X, Y, Z | VLOOKUP các mốc → score (derived, cached) |

**Là plan tĩnh**, không thay đổi theo tháng. Phải có 1 lần seed/import + edit trong UI.

---

## Tóm tắt — Compute layer cần có trong app

| Đầu vào (import) | Đầu ra (compute) |
|---|---|
| C, D, E, F, G (Sản lượng) | H = F+G, I = C-F, J = E/D, K = F/C |
| D, E, F, G, I, J, K (Doanh thu) | H = D-G, L = I-K, M = F+J, N = G+K, O = H+L, P = F/E, Q = G/D |
| Chỉ tiêu inputs (P trạng thái, M tiến độ text, E/I tiền đã nộp) + master plan + CauHinh | L (phải nộp), O (trạng thái) |
| Subtotals nhóm/giai đoạn | rollup từ lô con |

Nguyên tắc: **không lưu cột compute trong DB**. Chỉ lưu inputs + recompute mỗi lần render.
