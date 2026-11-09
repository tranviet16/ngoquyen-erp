# Runbook go-live — Công nợ vật tư theo công trình

- Ngày soạn: 2026-11-06. Kế hoạch: [plan.md](../plan.md), [phase 8](../phase-08-regression-docs-go-live.md).
- Script: [`scripts/vat-tu-cutover-inventory.sql`](../../../scripts/vat-tu-cutover-inventory.sql) (chỉ đọc) và [`scripts/vat-tu-cutover-cleanup.sql`](../../../scripts/vat-tu-cutover-cleanup.sql) (một transaction, mặc định ROLLBACK).
- Migration: `prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review` (chỉ sửa tiến).
- Người tham gia: **người chạy lệnh** (admin kỹ thuật, có tài khoản admin ERP đang hoạt động) và **người duyệt** (kế toán phụ trách công nợ vật tư). Thời lượng go-live: khoảng 3 giờ.
- Mốc chuyển đổi: **hết 26/10/2026**. Tiền tới mốc chỉ đến từ lần import chuyển đổi; sau khi import, mọi ghi vật tư có ngày ≤ 26/10/2026 bị chặn.

> **Lưu ý về phase 7.** Adapter `vat-tu-chuyen-doi` đang được làm song song khi runbook này được viết. Các chi tiết ghi "(theo kế hoạch)" lấy từ [phase-07-cutover-adapter.md](../phase-07-cutover-adapter.md), chưa kiểm được trên code. Lần chạy thử (Phần A) phải xác nhận lại từng chi tiết đó và sửa runbook nếu lệch.

---

## 0. Quy ước

### 0.1 Thông số

| Mục | Giá trị | Nguồn |
|---|---|---|
| Thư mục repo | `C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp` | |
| Container Postgres | `docker-postgres-1` (cổng máy `5433`) | `docker/docker-compose.yml` |
| User DB | `nqerp` | `.env.example`, `docker/docker-compose.yml` (`POSTGRES_USER`) |
| DB thật | `ngoquyyen_erp` | |
| DB chạy thử | `ngoquyyen_erp_dryrun` | |
| App production | container `ngoquyen-erp-3001` (`127.0.0.1:3001`) | `docker/docker-compose.erp-3001.yml` — **cố định DB thật**, không dùng cho chạy thử |
| Thư mục Excel | `Quản Lý Công Nợ\` (file tổng, CSV "Tổng công nợ", `Theo Dõi Vật Tư\<công trình>\<NCC>.xlsx`) | |
| Thư mục lưu trữ go-live | `%LOCALAPPDATA%\NgoQuyenERP\backups\erp\cutover-<stamp>` | ngoài repo và OneDrive |

### 0.2 Bí mật

- Không in, không chép mật khẩu ra màn hình hay vào tệp báo cáo. Chỉ nhắc tên biến: `DATABASE_URL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`.
- `psql`, `pg_dump`, `pg_restore` đều chạy **trong** container qua socket nội bộ (`docker exec`), nên không cần mật khẩu.
- Chỉ `npx prisma migrate deploy` (chạy trên máy) cần `DATABASE_URL`; hàm ở mục 0.3 đọc biến này từ tệp env mà không in giá trị.

### 0.3 Hàm PowerShell dùng chung (dán một lần vào mỗi cửa sổ PowerShell)

```powershell
Set-Location "C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp"
$PG = "docker-postgres-1"
# Thư mục lưu trữ của phiên (bản sao lưu, kiểm kê, danh sách duyệt, kết quả dọn, bản lưu Excel).
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$bk = Join-Path $env:LOCALAPPDATA "NgoQuyenERP\backups\erp\cutover-$stamp"
New-Item -ItemType Directory -Force $bk | Out-Null

# Đặt $env:DATABASE_URL từ tệp env, thay tên DB; chỉ in host/cổng/DB, không in user/mật khẩu.
function Set-ErpDatabaseUrl([string]$EnvFile, [string]$DbName) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $line) { throw "Không thấy DATABASE_URL trong $EnvFile" }
  $url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  $url = $url -replace '/[^/?]+(\?|$)', "/$DbName`$1"
  if ($url -notmatch "/$([regex]::Escape($DbName))(\?|$)") { throw "Không đổi được tên DB trong DATABASE_URL" }
  $env:DATABASE_URL = $url
  Write-Host ("DATABASE_URL -> <ẩn>@" + ($url -replace '^[^@]*@', ''))
}

# Chạy một tệp SQL trong container, ghi toàn bộ đầu ra (UTF-8) vào /tmp/cutover/<OutName>.
function Invoke-CutoverSql([string]$Db, [string]$SqlFile, [string]$OutName, [string]$ExtraArgs = "") {
  docker exec $PG sh -c "psql -U nqerp -d $Db -v ON_ERROR_STOP=1 $ExtraArgs -f /tmp/cutover/$SqlFile > /tmp/cutover/$OutName 2>&1"
  $code = $LASTEXITCODE
  docker cp "${PG}:/tmp/cutover/$OutName" "$bk\$OutName" | Out-Null
  if ($code -ne 0) { Write-Warning "psql thoát mã $code — đọc $bk\$OutName"; } else { Write-Host "OK -> $bk\$OutName" }
}
```

- Tệp env có `DATABASE_URL` trỏ tới `docker-postgres-1` (localhost:5433, user `nqerp`): trên máy này là `.env.local` (không có `.env`). Xác nhận trong lần chạy thử.
- Mở kết quả bằng VS Code hoặc `Get-Content -Encoding UTF8 <tệp>`. Không dùng `>` của PowerShell để lưu đầu ra `psql` (lỗi mã hoá tiếng Việt); hàm trên ghi tệp ngay trong container.
- Câu SQL kiểm tra tay: mở `docker exec -it docker-postgres-1 psql -U nqerp -d <DB>` rồi dán câu lệnh vào dấu nhắc. Không truyền SQL có tên cột `"camelCase"` qua tham số `-c` từ PowerShell, vì PowerShell 5.1 bỏ dấu ngoặc kép bên trong.

### 0.4 Khuôn `approved.csv`

Script kiểm kê sinh `candidates.csv`; người duyệt chép thành `approved.csv`. Tiêu đề: `target,action,id,project_id,note`.

| target | action | Điều kiện độc lập (script dọn tự kiểm lại) |
|---|---|---|
| `reconciliation` | `delete` | Mọi kỳ đối chiếu, kể cả đã xoá mềm. Migration dừng nếu bảng còn dòng nào. |
| `ledger` | `delete` | Sổ vật tư ngày ≤ 26/10 của NCC **không giữ** (mục 0.5), cộng dòng đã xoá mềm mà thiếu công trình, cộng event **đã xoá mềm** trỏ tới phiếu sẽ xoá (xoá cùng phiếu; note ghi "event của phiếu sẽ xoá"). |
| `ledger` | `delete_payment_linked` | Phần của tập trên sinh từ đợt thanh toán (`paymentRoundItemId`). **Người duyệt phải tự đổi** từ `delete` sau khi đối chiếu với "Trả Nợ" của Nhập Liệu. |
| `ledger` | `assign` | Sổ vật tư thiếu công trình, chưa xoá mềm, ngày > 26/10 **hoặc của NCC giữ** (mọi ngày). Điền `project_id`. |
| `opening` | `delete` / `assign` | Số dư vật tư asOf ≤ 26/10 của NCC không giữ (xoá); thiếu công trình và asOf > 26/10 hoặc của NCC giữ (gán). |
| `delivery` | `delete` / `assign` | Phiếu ngày ≤ 26/10 của NCC không giữ, cộng phiếu đã xoá mềm mà thiếu công trình (xoá); phiếu thiếu công trình, ngày > 26/10 hoặc của NCC giữ (gán). |
| `quote` | `delete` | Báo giá có note bắt đầu bằng `PILOT`. |

Quy tắc duyệt:
- Danh sách duyệt phải **trùng khít** tập dòng thỏa điều kiện. Không được bớt hay thêm dòng. Nếu một dòng không được xoá hoặc gán, **dừng lại** và xử lý nguyên nhân (sửa dữ liệu qua UI, hoặc xin quyết định), rồi kiểm kê lại.
- Sửa bằng VS Code hoặc Notepad. Nếu bắt buộc dùng Excel thì lưu dạng "CSV UTF-8 (Comma delimited)" và kiểm lại dấu phân cách là dấu phẩy.
- Công trình được gán phải có cùng Chủ thể với dòng sổ / số dư. Một công trình không được nhận dòng của hai Chủ thể.
- Bất biến này kiểm cho **mọi** dòng sổ (còn hiệu lực) / số dư vật tư còn lại có công trình, kể cả dòng đã có công trình từ trước và không nằm trong danh sách duyệt. Kiểm kê mục 11f liệt kê dòng lệch; script dọn dừng nếu còn dòng `lech` (công trình đã có Chủ thể khác) hoặc `nhieu_chu_the` (công trình chưa có Chủ thể nhưng nhận dòng của nhiều Chủ thể). Xử lý: sửa Chủ thể của dòng hoặc của công trình (app cũ), hoặc chuyển dòng sang công trình đúng, rồi kiểm kê lại. Dòng `chua_co_chu_the` (một Chủ thể) không chặn: bước 8 gán đúng Chủ thể đó.

### 0.5 NCC giữ lịch sử ≤ 26/10 (`keep-suppliers.csv`, tuỳ chọn)

Mặc định script dọn xoá sổ, số dư và phiếu ≤ 26/10 của **mọi** NCC, vì import chuyển đổi nạp lại tất cả từ gói Excel. NCC có công nợ trong ERP nhưng **không có trong gói Excel** (không có trong Nhập Liệu, Số Dư, CSV hay file theo dõi) sẽ mất lịch sử tới 26/10, vì import không bù lại cặp không có trong gói.

- Kiểm kê mục 14 liệt kê **theo NCC** số dòng ≤ 26/10 sẽ bị xoá (sổ, số dư, phiếu) và tổng tiền. Người duyệt đối chiếu từng NCC với danh sách NCC trong gói Excel.
- NCC cần giữ: ghi vào `$bk\keep-suppliers.csv` (UTF-8, tiêu đề `supplier_id,note`; `note` ghi tên NCC và lý do), chép vào container, chạy **mọi** lần kiểm kê và dọn với `-v giu_ncc=on`.
- Sổ, số dư và phiếu ≤ 26/10 của NCC giữ **không bị xoá**. Dòng nào của họ thiếu công trình phải nằm trong danh sách `assign` (kiểm kê tự đề xuất); thiếu thì script dọn dừng như mọi lệch khác.
- Không giữ NCC có trong gói Excel: guard độc quyền của import sẽ chặn cặp đã có sổ ≤ 26/10 hoặc số dư.

```powershell
docker cp "$bk\keep-suppliers.csv" "${PG}:/tmp/cutover/keep-suppliers.csv"
$giu = "-v giu_ncc=on"          # để trống ("") nếu không giữ NCC nào
```

Hai quy tắc dưới đây do runbook suy ra, **người duyệt cần xác nhận ở bước 5**:
- Xoá cả dòng sổ, số dư và phiếu ≤ 26/10 **do import cũ ghi** (adapter `cong-no-vat-tu`, `gach-nam-huong`, `quang-minh` đã gỡ), trừ NCC giữ ở mục 0.5. Lý do: các dòng này không có công trình, nên CHECK của migration sẽ chặn. Gán công trình cho dòng ≤ 26/10 thì vi phạm bất biến "tiền tới 26/10 chỉ đến từ run chuyển đổi" và bị guard độc quyền của import chặn.
- Xoá **mọi phiếu ngày ≤ 26/10**. Lý do: 23 file theo dõi đưa vào toàn bộ lịch sử khối lượng (D6), nên giữ phiếu cũ sẽ thành phiếu trùng.

---

## Phần A — Chạy thử trên DB tên riêng (trước ngày go-live)

Mục tiêu: chạy bước 3–11 trên bản sao DB thật. Ghi kết quả vào `reports/dry-run-result.md`.

1. **Sao lưu DB thật** như bước 3 của Phần B. App vẫn chạy; `pg_dump` lấy một snapshot nhất quán.
2. **Tạo DB chạy thử** từ bản sao lưu. Lệnh `dropdb` chỉ được gõ với tên `ngoquyyen_erp_dryrun`:
   ```powershell
   docker exec $PG dropdb -U nqerp --if-exists ngoquyyen_erp_dryrun
   docker exec $PG createdb -U nqerp ngoquyyen_erp_dryrun
   docker exec $PG pg_restore -U nqerp -d ngoquyyen_erp_dryrun --no-owner "/tmp/backup-$stamp.dump"
   ```
   Đầu ra `pg_restore` không được có dòng `error`. Kiểm trong psql của cả hai DB: `SELECT count(*) FROM _prisma_migrations;` và `SELECT count(*) FROM ledger_transactions;` phải bằng nhau.
3. **Kiểm kê, duyệt, dọn** (bước 4–6) với `-d ngoquyyen_erp_dryrun`, dùng `Invoke-CutoverSql ngoquyyen_erp_dryrun …`. Ở lần chạy thử, người duyệt xem trước danh sách; `approved.csv` của lần chạy thử **không dùng lại** cho go-live, vì dữ liệu sẽ thay đổi.
4. **Migrate và chạy app dev trên DB chạy thử.** Dùng một cửa sổ PowerShell riêng, đóng lại sau khi chạy thử xong:
   ```powershell
   Set-ErpDatabaseUrl .env.local ngoquyyen_erp_dryrun   # phải in .../ngoquyyen_erp_dryrun?...
   npx prisma migrate deploy
   pnpm dev                                              # http://localhost:3000, DATABASE_URL của phiên này thắng .env.local
   ```
   Không dùng `docker-compose.erp-3001.yml`, không build image ở bước chạy thử, không chạy `prisma migrate dev` trên container dùng chung.
5. **Bước 8–11** trên app dev (`http://localhost:3000`), với thư mục Excel hiện có (CSV chưa xuất lại thì một số cặp có thể lệch đúng bằng phát sinh sau giờ xuất CSV).
6. **Ghi `reports/dry-run-result.md`:** kiểm kê trước và sau dọn (mục 1 phải toàn 0), số dòng của script dọn, kết quả migrate, V1–V4, các lệch so với runbook. Xác nhận các chi tiết "(theo kế hoạch)" ở Phụ lục P4. Nêu rõ thời gian thực tế của từng bước.
7. **Dọn:** dừng `pnpm dev`; `docker exec $PG dropdb -U nqerp ngoquyyen_erp_dryrun`; đóng cửa sổ PowerShell, để không còn `DATABASE_URL` trỏ DB chạy thử.

---

## Phần B — Go-live

Dùng **một** cửa sổ PowerShell từ bước 2 tới bước 13, đã dán mục 0.3. Ghi giờ bắt đầu và kết thúc của từng bước vào `reports/go-live-result.md`.

### Bước 1 — Điều kiện

- [ ] Trên đúng commit sẽ deploy (ghi SHA bằng `git rev-parse HEAD`): `pnpm test`, `pnpm test:integration` (DB test riêng, tắt `fsync`), `npx tsc --noEmit`, `pnpm lint`, `pnpm build` đều xanh.
- [ ] `reports/dry-run-result.md` đạt: kiểm kê sau dọn ra 0, migrate thành công, V1–V4 đạt hoặc có giải thích.
- [ ] Docker Desktop bật; `docker ps` có `docker-postgres-1` và `ngoquyen-erp-3001`.
- [ ] Người duyệt có mặt. Thư mục `Quản Lý Công Nợ` trên máy là bản mới nhất.
- [ ] Đã thông báo **toàn bộ người dùng ERP** ngừng dùng hệ thống trong cửa sổ go-live, không riêng 3 module (xem "Rollback vận hành").

### Bước 2 — Đóng module, đóng băng Excel

1. Đăng nhập app hiện tại bằng tài khoản admin → `/admin/permissions/modules` → thẻ **Trạng thái phát hành** → **Quản lý trạng thái**.
2. Chuyển sang **Đang phát triển**: "Vật tư / NCC" (`vat-tu-ncc`), "Công nợ vật tư" (`cong-no-vt`), "Thanh toán – Kế hoạch" (`thanh-toan.ke-hoach`), "Thanh toán – Tổng hợp" (`thanh-toan.tong-hop`). Bấm **Lưu thay đổi** → **Xác nhận và lưu**. Thao tác này ghi `audit_logs` cùng transaction.
3. Kiểm trong psql:
   ```sql
   SELECT "moduleKey", status FROM module_availability
   WHERE "moduleKey" IN ('vat-tu-ncc', 'cong-no-vt', 'thanh-toan.ke-hoach', 'thanh-toan.tong-hop');
   ```
   Kết quả: 4 dòng `development`. Đăng nhập bằng một tài khoản kế toán (không phải admin) thì mở `/vat-tu-ncc` phải ra màn "đang phát triển".
4. **Admin đang hoạt động vẫn vào được** module đang phát triển (`requireReleasedModuleRequest`, `canAccess` cho admin đi thẳng). Chỉ người chạy lệnh thao tác trên 3 module; các admin khác không đăng nhập.
5. **Đóng băng Excel:**
   - Chốt giờ đóng băng và báo người dùng ngừng sửa file.
   - Xác nhận các file theo dõi đã cập nhật đến giờ đó.
   - **Xuất lại CSV "Tổng công nợ"** từ bảng tính nguồn đúng giờ đóng băng. Thay tệp CSV cũ trong `Quản Lý Công Nợ\`, chỉ để lại một tệp CSV.
   - Lưu checksum cả thư mục (`$bk` đã tạo ở mục 0.3):
     ```powershell
     Get-ChildItem -Recurse -File "Quản Lý Công Nợ" | Get-FileHash -Algorithm SHA256 |
       Export-Csv -Encoding UTF8 -NoTypeInformation "$bk\excel-checksum-dong-bang.csv"
     ```

### Bước 3 — Sao lưu

```powershell
docker exec $PG pg_dump -U nqerp -Fc -d ngoquyyen_erp -f "/tmp/backup-$stamp.dump"
docker cp "${PG}:/tmp/backup-$stamp.dump" "$bk\"
Get-FileHash -Algorithm SHA256 "$bk\backup-$stamp.dump" | Format-List      # ghi hash vào go-live-result.md
docker exec $PG pg_restore -l "/tmp/backup-$stamp.dump" | Measure-Object -Line # phải > 0 dòng, không lỗi
```

- `scripts/backup-db.sh` không chạy trên Windows; dùng lệnh trên.
- Giữ bản trong container (`/tmp/backup-$stamp.dump`) tới khi go-live xong. Ghi giờ sao lưu (giờ Bangkok và UTC).

### Bước 4 — Kiểm kê

```powershell
docker exec $PG mkdir -p /tmp/cutover
docker cp scripts/vat-tu-cutover-inventory.sql "${PG}:/tmp/cutover/"
Invoke-CutoverSql ngoquyyen_erp vat-tu-cutover-inventory.sql inventory-1.txt $giu   # $giu: mục 0.5
docker cp "${PG}:/tmp/cutover/candidates.csv" "$bk\candidates-1.csv"
```

Đọc `inventory-1.txt` cùng người duyệt:
- Mục 1 cho biết còn bao nhiêu dòng chặn migration.
- Mục 2–4: sổ, số dư, phiếu theo nguồn (import / đợt thanh toán / phiếu / tay), tách ≤ và > 26/10, gồm cả dòng xoá mềm.
- Mục 6: các kỳ đối chiếu sẽ bị xoá, gồm 2 kỳ Nam Hương đã ký của pilot.
- Mục 7–9: đợt thanh toán.
- Mục 11: cảnh báo. 11d khác rỗng thì script dọn sẽ dừng (event còn hiệu lực trỏ tới phiếu sẽ xoá; event đã xoá mềm thì xoá cùng phiếu, không nằm ở đây). 11e khác 0 thì báo kỹ thuật trước khi đi tiếp. 11f có dòng `lech` / `nhieu_chu_the` thì script dọn sẽ dừng (mục 0.4).
- Mục 14: theo NCC, số dòng ≤ 26/10 sẽ bị xoá. Đối chiếu với danh sách NCC trong gói Excel (mục 0.5).
- Mục 12: đối chiếu với danh sách pilot ở `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/reports/pilot-result.md`. Theo tài liệu đó: phiếu 1–9, báo giá 1–3, kỳ 1–4, sổ 1–12, số dư 1, 3, 5.

### Bước 5 — Duyệt

1. **Đợt thanh toán `vat_tu` còn mở** (mục 8): `draft` / `submitted` / `approved`. Đợt còn mở **không còn là lỗi chặn**; import yêu cầu xác nhận từng đợt (bước 9, mục 8 của màn xem trước). Trước khi import, soát từng đợt ở `/thanh-toan/ke-hoach/<id>` (admin vẫn vào được):
   - Đợt **đã chi thật**: **Đóng đợt** (chỉ được khi `approved`). App cũ ghi `thanh_toan` theo ngày đóng, tức sau 26/10; dòng thiếu công trình sẽ thành dòng `assign` ở danh sách mới. Đợt đã đóng đi qua kiểm "khớp chéo mốc" như cũ.
   - Đợt **chưa chi** và khoản đó **chưa có** trong Nhập Liệu: để nguyên; ở màn xem trước tick "Đợt #… chưa chi và chưa có trong Nhập Liệu". Khi đợt được đóng sau go-live, `thanh_toan` vào sổ theo ngày đóng.
   - Đợt `draft` / `submitted` không còn dùng: có thể **Xoá đợt** (draft) hoặc **Từ chối** (submitted). **Không có thao tác nào trên UI để hủy đợt `approved`** (`deleteRound` từ chối approved / closed, `rejectRound` chỉ nhận submitted); đợt `approved` chỉ đóng được.
   - Đợt có dòng **trùng số tiền (± 1 đồng)** với một dòng "Trả Nợ" của Nhập Liệu cùng NCC × công trình (mọi ngày): màn xem trước **chặn** đợt đó và liệt kê các dòng NL trùng (NL#, ngày, số tiền). Chọn:
     - **Bỏ dòng Nhập Liệu**: khoản này là khoản của đợt, sẽ vào sổ khi đóng đợt. Các dòng NL trùng bị bỏ khỏi lần import.
     - **Giữ cả hai**: là hai khoản khác nhau. Vẫn phải tick xác nhận của đợt.

   Sau đó chạy lại kiểm kê (`inventory-2.txt`, `candidates-2.csv`, cùng `$giu`) để có danh sách đợt còn mở cập nhật.
2. **NCC giữ lịch sử** (mục 0.5): người duyệt soát mục 14 của `inventory-1.txt` cùng danh sách NCC trong gói Excel. Mỗi NCC có dòng sẽ xoá mà **không** có trong gói Excel: hoặc ghi vào `keep-suppliers.csv` (giữ lịch sử ERP), hoặc xác nhận xoá. Có NCC giữ thì chép tệp vào container, đặt `$giu = "-v giu_ncc=on"` và chạy lại kiểm kê như trên. Ghi danh sách NCC giữ (id, tên, lý do) vào `go-live-result.md`.
3. **Người duyệt duyệt** trên `candidates-2.csv` → chép thành `$bk\approved.csv`:
   - xoá dữ liệu pilot 07/10 (V5), gồm 2 kỳ Nam Hương đã ký, phiếu, báo giá `PILOT…`, sổ cái, số dư;
   - xoá mọi kỳ đối chiếu cũ;
   - xoá sổ vật tư ≤ 26/10 (Nhập Liệu thay thế), số dư vật tư (Số Dư Ban Đầu thay thế) và phiếu ≤ 26/10 (file theo dõi thay thế) của NCC không giữ; xác nhận hai quy tắc ở mục 0.4;
   - với mỗi dòng ghi "DÒNG ĐỢT THANH TOÁN": đối chiếu với "Trả Nợ" cùng NCC, số tiền trong Nhập Liệu, rồi đổi `delete` thành `delete_payment_linked`;
   - điền `project_id` cho mọi dòng `assign`. Tra id ở `/master-data/projects` hoặc bằng `SELECT id, code, name, "entityId" FROM projects WHERE "deletedAt" IS NULL ORDER BY name;`.
4. Người duyệt ghi tên, giờ duyệt và số dòng từng loại vào `go-live-result.md`.

### Bước 6 — Dọn và bù công trình (DB vẫn ở schema cũ, module đã đóng)

```powershell
docker cp "$bk\approved.csv" "${PG}:/tmp/cutover/approved.csv"
docker cp scripts/vat-tu-cutover-cleanup.sql "${PG}:/tmp/cutover/"
$runner = "<email tài khoản admin ERP của người chạy>"

# Lần 1 — chạy thử, kết thúc ROLLBACK ($giu: mục 0.5, phải giống lần kiểm kê sinh candidates)
Invoke-CutoverSql ngoquyyen_erp vat-tu-cutover-cleanup.sql cleanup-thu.txt "-v runner_email=$runner $giu"
docker cp "${PG}:/tmp/cutover/cleanup-result.csv" "$bk\cleanup-result-thu.csv"
```

- Đọc `cleanup-thu.txt`. Bảng **TÓM TẮT** phải có ba cột bằng nhau ở mọi dòng. Bảng "NCC GIỮ LỊCH SỬ" liệt kê số dòng ≤ 26/10 được giữ của từng NCC giữ. Danh sách gán công trình và danh sách "công trình chưa có Chủ thể" (gồm cả công trình của dòng giữ nguyên) sẽ dùng ở bước 8.
- Script dừng (RAISE) thì không có gì được ghi. Đọc thông báo, sửa nguyên nhân (thường là danh sách cũ, hoặc dòng đợt thanh toán chưa đổi action), kiểm kê lại, duyệt lại.

Khi người duyệt đồng ý kết quả lần 1:

```powershell
# Lần 2 — ghi thật
Invoke-CutoverSql ngoquyyen_erp vat-tu-cutover-cleanup.sql cleanup-commit.txt "-v runner_email=$runner -v xac_nhan_commit=on $giu"
docker cp "${PG}:/tmp/cutover/cleanup-result.csv" "$bk\cleanup-result-$stamp.csv"
Get-FileHash -Algorithm SHA256 "$bk\cleanup-result-$stamp.csv" | Format-List

# Kiểm kê lại (cùng $giu): mục 1 phải toàn 0
Invoke-CutoverSql ngoquyyen_erp vat-tu-cutover-inventory.sql inventory-3.txt $giu
```

- Cuối `cleanup-commit.txt` phải có dòng "ĐÃ COMMIT".
- Script ghi một dòng `audit_logs`: `"tableName" = 'vat_tu_cutover_cleanup'`, `action = 'cleanup'` (`afterJson.keptSuppliers` = danh sách NCC giữ).
- `cleanup-result-<stamp>.csv` chứa toàn bộ nội dung từng dòng bị xoá hoặc gán (JSON). Lưu cùng bản sao lưu bước 3.

### Bước 7 — Deploy: dừng app → migrate → chạy build mới

1. **Chuẩn bị (app cũ vẫn chạy):**
   ```powershell
   docker inspect -f "{{.Config.Image}}" ngoquyen-erp-3001      # tên image hiện tại, ví dụ docker-erp-3001
   $img = "<tên image vừa in, bỏ phần :tag nếu có>"
   docker tag "${img}:latest" "${img}:truoc-chuyen-doi"          # để rollback app
   ```
   Đặt các biến môi trường build/chạy theo đúng cách của lần deploy `erp-3001` trước. Cần `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, và `DATABASE_URL` cho secret lúc build; không in giá trị. Sau đó build sẵn image mới:
   ```powershell
   docker compose -f docker/docker-compose.erp-3001.yml build
   ```
2. **Dừng app:** `docker stop ngoquyen-erp-3001`.
3. **Migrate DB thật:**
   ```powershell
   Set-ErpDatabaseUrl .env.local ngoquyyen_erp    # phải in .../ngoquyyen_erp?...
   npx prisma migrate status
   npx prisma migrate deploy
   npx prisma migrate status                      # "Database schema is up to date"
   ```
   Migration tự dừng nếu còn kỳ đối chiếu, hoặc còn dòng sổ / số dư / phiếu vật tư thiếu công trình (3 CHECK kiểm ngay trên mọi dòng, kể cả dòng xoá mềm). Khi đó cả migration rollback, DB giữ nguyên schema cũ. Xử lý:
   - `npx prisma migrate resolve --rolled-back 20261106090000_vat_tu_pair_scope_and_import_review`;
   - `docker start ngoquyen-erp-3001` (container cũ, image cũ);
   - quay lại bước 4.
4. **Chạy build mới:** `docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build`.
5. **Smoke test:**
   - `Invoke-RestMethod http://127.0.0.1:3001/api/health` phải có `status = ok` và `db = ok`;
   - đăng nhập admin;
   - mở `/vat-tu-ncc/cong-trinh` và `/cong-no-vt/tong-hop-cong-trinh` (admin vào được dù module đang đóng).

### Bước 8 — Danh mục

Ở **Dữ liệu nền tảng** (`/master-data`):
1. **Chủ Thể** (`/master-data/entities`): có đủ "Công Ty Quản Lý", "Lê Văn Huyên", "Lưu Minh Xuân". Thiếu thì tạo.
2. **Dự Án** (`/master-data/projects`). Kiểm tên đang có trước để không tạo trùng; pilot đã dùng "Tân Lộc CDC" và "ĐVP-CDC".
   - Tạo nếu chưa có: "Tiên Lãng (Việt Úc)" (Chủ thể Lưu Minh Xuân), "Tiên Lãng (SH)" (Lê Văn Huyên), "Tân Lộc CDC", "ĐVP-CDC" (Chủ thể theo dòng "CDC" trong Số Dư; mặc định Công Ty Quản Lý).
   - Gán cột **Chủ thể** cho **mọi** công trình sẽ được ánh xạ, kể cả công trình đã xong: Trại Chuối, Mầm non Trại chuối, Mầm non GĐ2, Xây dựng Dải cây xanh, Quán Toan, 326 - Lô 34, Trụ sở 149 Hai Bà Trưng, Phí khác (các dự án)… Chủ thể lấy theo cột "Chủ Thể" của Số Dư / Nhập Liệu.
   - Gán đúng Chủ thể cho các công trình trong danh sách "công trình chưa có Chủ thể" của `cleanup-commit.txt`.
   - Chủ thể gán lần đầu (từ trống) được, **trừ khi** công trình đã có dòng sổ / số dư vật tư mang Chủ thể khác (app báo "Không thể gán Chủ thể #…") — gán đúng Chủ thể trong danh sách của `cleanup-commit.txt`. Khi công trình đã có sổ, phiếu, số dư hoặc kỳ vật tư thì không đổi sang Chủ thể khác được nữa.
3. Kiểm trong psql: `SELECT id, code, name FROM projects WHERE "deletedAt" IS NULL AND "entityId" IS NULL ORDER BY name;` không còn công trình nào sẽ được ánh xạ. Theo kế hoạch, import báo lỗi chặn nếu công trình đã có mà chưa gán Chủ thể.
4. Tuỳ chọn: pilot đã đổi vật tư `CA-MX` từ `machine` sang `material`. Nay báo giá nhận cả ca máy (commit `df1e1e7`), nên có thể đổi lại `machine` ở **Vật Tư / Hạng Mục**.

### Bước 9 — Import

1. `/admin/import` (**Quản trị > Nhập dữ liệu**) → **Adapter (loại file)**: "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)" (theo kế hoạch) → **Thư mục nguồn** → chọn thư mục `Quản Lý Công Nợ` → **Tải lên và phân tích**.
   - Gói chỉ nhận `.xlsx` và `.csv`, tối đa 200 file và 20 MB. File ẩn, file tạm `~$…` và file đuôi khác bị bỏ qua và được liệt kê.
   - Run được tạo ở trạng thái `preview`, kèm "Phiên bản xem trước: v1".
2. Trang run `/admin/import/<id>`: panel **Duyệt** hiện lỗi chặn, xác nhận còn thiếu và file trong gói. Phần review của adapter hiển thị theo thứ tự (theo kế hoạch): tóm tắt → lỗi chặn → ánh xạ tên → tách CDC → duyệt từng cặp → ngày mơ hồ → neo V1, V2–V4 → sau mốc → chẩn đoán cặp × tháng → phiếu theo cặp → danh mục tạo mới. Mỗi lần sửa thì bấm **Lưu & tính lại**; `reviewVersion` tăng.
3. Trình tự làm:
   1. **Ánh xạ tên** (theo kế hoạch):
      - NCC, gồm bí danh "Cty (Anh Công)" → Khánh Đức, "Cty Hiệu Trần (Anh Hiếu)" và "Thép Hiệu Trần ( chú Hiếu )" → Thương Hiệu Trần;
      - công trình theo `tên@Chủ thể`: "Cống hộp - Tiên lãng@Lưu Minh Xuân" → Tiên Lãng (Việt Úc), "@Lê Văn Huyên" → Tiên Lãng (SH); "CDC@…" → tách;
      - thư mục: "Mầm Non TC1" → Mầm non Trại chuối, "Mầm Non TC2" → Mầm non GĐ2, "Dải Cây Xanh" → Xây dựng Dải cây xanh;
      - tên CSV: "Ngô quyền Trại chuối" → Trại Chuối, "Tân lộc CDC" → Tân Lộc CDC, "ĐVP -CDC" → ĐVP-CDC;
      - vật tư.

      NCC, công trình và Chủ thể không có lựa chọn "Bỏ qua".
   2. **Tách CDC**: Nam Hương CDC 153.936.700 / 27.734.400 → Tân Lộc CDC 109.336.700 / 0 và ĐVP-CDC 44.600.000 / 27.734.400. CSV mới lệch thì chọn công trình nhận phần chênh và `ack`.
   3. **Duyệt từng cặp**: lũy kế (2 dòng ngày 26/12/2025) hay ròng (số dư asOf 31/12/2025). Mặc định lũy kế khi TT và HĐ đều khớp CSV ±1 đồng. Cặp lệch chọn lũy kế thì phải `ack`.
   4. **Ngày** — 2 lỗi chặn đã biết (chọn ngày `yyyy-mm-dd` trong màn xem trước, hoặc sửa Excel trước giờ đóng băng):
      - **Cát xây Quang Minh (MN TC1)**, sheet đối chiếu ô **B20** ghi "3,4,5/4/2026": một phiếu 12 m³ trải ba ngày. Chọn một ngày, hoặc tách thành 3 dòng trong Excel.
      - **Thiết bị điện Việt Đức (MN TC1)**, sheet đối chiếu ô **B116**: khối 27/06→26/07 có 27 dòng không ghi ngày. Chọn ngày cho B116; cả nhóm dòng sau nhận theo. Ngày nên nằm trong 27/06–26/07/2026.
   5. **7 ngày mơ hồ** (loại `straddles-cutover`, ô ngày bị đảo ngày/tháng trong khối 27/09→26/10, đọc được 11/10 hay 10/11, 12/10 hay 10/12): Máy xúc Lộc Tài (DCX) B27, B28; Gạch Nam Hương (Trại Chuối) B255, B256; Quang Minh (Trại Chuối) B295, B296; Xi măng Phương Minh (Trại Chuối) B206. Chọn theo chứng từ gốc. Nếu chọn ngày > 26/10 thì phiếu thành phiếu sau mốc và phải ghép được với một dòng "Lấy Hàng" sau mốc của Nhập Liệu.
   6. **Sau mốc** (theo kế hoạch): mọi dòng "Lấy Hàng" 27–31/10 phải ghép được với phiếu (dòng không ghép được là lỗi chặn; Lấy Hàng sau mốc không bao giờ được ghi thành dòng sổ). "Trả Nợ" sau mốc trùng thanh toán ERP thì bỏ, không trùng thì ghi `thanh_toan`. Đợt `vat_tu` còn mở: xác nhận từng đợt "chưa chi và chưa có trong Nhập Liệu" (`ack:open-round:<id>:<tổng>`); đợt có dòng trùng số tiền với "Trả Nợ" thì chọn bỏ dòng Nhập Liệu hoặc giữ cả hai (`round:<id>`) trước. Khớp chéo mốc (đợt đã đóng) thì chọn bỏ dòng Nhập Liệu hoặc giữ cả hai kèm `ack`.
   7. **Neo V1**: lệch thì xem chênh và `ack` nếu Excel tự mâu thuẫn. 5 cảnh báo `daily-conflict` (quan trọng nhất: Lộc Tài DCX 27/10, Vật tư ngày ghi 0,5 ca, đối chiếu ghi 1 ca × 2.800.000) cần người duyệt xác nhận.
4. Khi không còn lỗi chặn và đủ xác nhận: **Ghi dữ liệu**. Hệ thống ghi đúng bản xem trước đang xem, trong một transaction 300 giây. Theo kế hoạch, V2–V4 lệch lúc ghi thì cả lần ghi rollback. Run thành `committed`. Bấm Ghi lần hai không đổi trạng thái.

### Bước 10 — Đối soát

Ghi vào `reports/go-live-result.md` (dung sai ±1 đồng). Số kỳ vọng ở Phụ lục P1.
- **V1 — neo Excel**: nợ TT ERP tại biên thực Y của khối + Σ dòng khối có ngày > Y = "Tổng nợ". Bê tông HP × Trại Chuối: 480.583.111 + 28.980.000 = 509.563.111. Nam Hương nhóm Trại Chuối + Tân Lộc CDC + ĐVP-CDC = 294.445.120. Lộc Tài MN2: dòng 27/10 1.400.000 nằm trong khối cuối.
- **V2**: Đầu kỳ 2026 (TT, HĐ) = Số Dư (sau tách CDC) ở mọi cặp. Cặp đã `ack` lệch được ghi chú.
- **V3**: cặp lũy kế có LH (Toàn bộ) + "Lấy Hàng" sau mốc bị bỏ = G / M của CSV; Đã trả + "Trả Nợ" sau mốc bị bỏ = H+I / N.
- **V4**: mọi "Lấy Hàng" sau mốc đã ghép phiếu (dữ liệu hiện tại: 11/11; tính lại tại giờ đóng băng).
- Chạy các câu SQL ở Phụ lục P2.

Nếu sai: bấm **Hoàn tác** ở danh sách `/admin/import`. Việc này được phép vì chưa có kỳ ERP nào được ký. Run chuyển `rolled_back` và được giữ làm dấu vết. Sau đó sửa Excel hoặc ánh xạ, rồi import lại bằng một run mới. Hoàn tác bị từ chối khi một cặp của run đã có kỳ ký ngoài run, dòng sổ hoặc số dư vật tư mới không thuộc run (kể cả `dieu_chinh`), hoặc event trỏ tới phiếu của run.

### Bước 11 — Kiểm tay

- `/vat-tu-ncc/cong-trinh` → **Trại Chuối** → Bê tông Hải Phòng: nợ 480.583.111 tại 26/10. Phiếu 27/10 (18 m³ BT M300) nằm ở tab **Vật tư ngày**, chưa chốt nên chưa vào nợ.
- `/cong-no-vt/tong-hop-cong-trinh`:
  - **Năm 2026**: Đầu kỳ = Số Dư.
  - **Kỳ chuẩn 27→26, T1/2026** (27/12/2025–26/01/2026): Đầu kỳ = Số Dư (dòng lũy kế 26/12/2025 nằm ngoài cửa sổ).
  - **Toàn bộ**: Còn nợ (đến T) = Cuối kỳ (Năm 2026, đến T).
  - Xuất Excel cho cùng số. Thử cả hai chiều nhóm NCC → công trình và Công trình → NCC.
- Một cặp bất kỳ → tab **Đối chiếu công nợ**: có "Kỳ chuyển đổi (khóa)" 01/01/2026→26/10/2026 đã ký, không có nút gỡ ký.
- Tab **Chốt kỳ** của cặp đó: kỳ gợi ý là 27/10/2026→26/11/2026.
- Tab **Vật tư ngày**: thêm phiếu ngày 20/10/2026 → toast lỗi khóa (giai đoạn đã chuyển đổi từ Excel). Phiếu không được ghi.

### Bước 12 — Kiểm tiếp: chốt kỳ đầu trong ERP

Chỉ làm sau khi người duyệt chấp nhận bước 10–11. Chốt kỳ sinh event trỏ tới phiếu của run, nên sau bước này **không hoàn tác được import cho cặp đó**.

- Quang Minh × Xây dựng Dải cây xanh → tab **Chốt kỳ**: 27/10/2026→26/11/2026, giá 450.000/m³ → **Chốt kỳ** (không ký).
- Tab **Đối chiếu công nợ**: không có thanh toán trong kỳ thì nợ cuối = **159.360.000** (152.160.000 tại 26/10 + 16 m³ × 450.000).
- Kỳ chưa ký chốt lại được khi có thêm phiếu.

### Bước 13 — Đóng băng Excel và mở lại hệ thống

```powershell
Compress-Archive -Path "Quản Lý Công Nợ\*" -DestinationPath "$bk\Quan-Ly-Cong-No-$stamp.zip"
Get-FileHash -Algorithm SHA256 "$bk\Quan-Ly-Cong-No-$stamp.zip" | Format-List
Get-ChildItem -Recurse -File "Quản Lý Công Nợ" | ForEach-Object { $_.IsReadOnly = $true }
```

- Đặt chỉ đọc cả bản Excel gốc người dùng đang dùng (OneDrive / Google Drive), không riêng bản trên máy này.
- `/admin/permissions/modules` → chuyển 4 module về **Phát hành** → Lưu. Kiểm bằng câu SQL của bước 2: 4 dòng `ready`.
- Thông báo: từ giờ này ERP là nguồn công nợ vật tư. Nhập theo công trình (`/vat-tu-ncc/cong-trinh`). Sai lệch tới 26/10 ghi bằng điều chỉnh có ngày sau 26/10.
- Ghi giờ mở lại vào `go-live-result.md`; người duyệt ký nhận.

---

## Rollback vận hành

| Thời điểm | Cách lùi |
|---|---|
| Bước 2–6 (chưa migrate) | Script dọn chưa COMMIT thì không có gì thay đổi. Đã COMMIT mà cần lùi: khôi phục bản sao lưu bước 3 (xem dưới). Mở lại module. |
| Bước 7 migrate lỗi | Migration tự rollback. `npx prisma migrate resolve --rolled-back 20261106090000_vat_tu_pair_scope_and_import_review`, `docker start ngoquyen-erp-3001` (image cũ), sửa dữ liệu rồi chạy lại từ bước 4. |
| Bước 7–12 (đã migrate) | Ưu tiên **Hoàn tác import** ở `/admin/import` (bước 10). Nếu phải bỏ hẳn: khôi phục bản sao lưu bước 3 **cùng build cũ**. Không revert code trên DB đã migrate; schema mới chỉ sửa tiến. |
| **Sau bước 13** | **Không khôi phục bản sao lưu**, vì sẽ xoá dữ liệu các module ghi sau giờ đó. Sai lệch sửa bằng `dieu_chinh` có ngày sau 26/10/2026. |

**Khôi phục bản sao lưu bước 3 + build cũ** (chỉ trước bước 13):
1. Kiểm có ghi nào sau giờ sao lưu sẽ bị mất (các module không đóng vẫn ghi được sau bước 7):
   ```sql
   SELECT "tableName", count(*) FROM audit_logs WHERE "createdAt" > '<giờ sao lưu, UTC>' GROUP BY 1 ORDER BY 2 DESC;
   ```
2. Thực hiện:
   ```powershell
   docker stop ngoquyen-erp-3001
   docker exec $PG psql -U nqerp -d postgres -c "ALTER DATABASE ngoquyyen_erp RENAME TO ngoquyyen_erp_loi_$stamp"
   docker exec $PG createdb -U nqerp ngoquyyen_erp
   docker exec $PG pg_restore -U nqerp -d ngoquyyen_erp --no-owner "/tmp/backup-$stamp.dump"
   docker tag "${img}:truoc-chuyen-doi" "${img}:latest"
   docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build --force-recreate
   ```
   - Đổi tên DB lỗi thay vì xoá, để giữ hiện trạng phân tích. Lệnh đổi tên cần không còn kết nối nào tới DB đó.
   - `scripts/restore-db.sh` là bash và từ chối DB không phải `*_test`, nên không dùng ở đây.
3. Mở lại module (bước 13, phần quyền). Ghi sự cố vào `go-live-result.md`.

---

## Phụ lục

### P1. Số liệu kỳ vọng

Số liệu dưới đây lấy trên thư mục Excel ngày 05–06/11 (báo cáo phase 6, gói bằng chứng). Excel cập nhật tới giờ đóng băng thì số dòng có thể tăng; các neo ≤ 26/10 không đổi.

| Kiểm | Kỳ vọng |
|---|---|
| Nhập Liệu | 922 dòng đọc được (dòng 5→926), dừng trước dòng ma; 773 "Lấy Hàng", 149 "Trả Nợ"; ghi nhận 771 `lay_hang`, 146 `thanh_toan`, 2 `thue_hd`; 3 dòng 0 đồng bỏ (NL#816, 831, 832); 3 năm "0206" sửa (NL#5 → 15/08, NL#6 → 26/08, NL#7 → 26/10/2026); 11 dòng sau mốc |
| Số Dư Ban Đầu | 73 dòng, asOf 31/12/2025 |
| CSV | 59 dòng hợp đồng (22 dòng bỏ: "Cộng", mồ côi, tổng không nhãn) |
| File theo dõi | 23 file (không phải 24), 83 khối, 570 dòng phiếu → 538 phiếu sau khử trùng, 0 phiếu bổ sung từ Vật tư ngày |
| Ngày | 2 lỗi chặn + 7 quyết định ngày mơ hồ (bước 9) |
| Tách CDC (Nam Hương) | Tân Lộc CDC 109.336.700 / 0; ĐVP-CDC 44.600.000 / 27.734.400 (tổng = Số Dư CDC 153.936.700 / 27.734.400) |
| Cặp Nam Hương × Trại Chuối | ròng trước 2026 = 59.868.420, mặc định lũy kế |
| V1 | Bê tông HP × Trại Chuối 480.583.111 + 28.980.000 = 509.563.111; Nam Hương nhóm TC + Tân Lộc CDC + ĐVP-CDC = 294.445.120; Quang Minh DCX khối 27/09→26/10 = 152.160.000; Gạch NH MN = 23.370.400 |
| V4 | 11/11 dòng "Lấy Hàng" sau mốc ghép phiếu: BT HP TC 18 m³ × 1.610.000; Lộc Tài DCX 1 ca × 2.800.000; Lộc Tài MN2 0,5 ca × 2.800.000; Nam Hương DCX 5.400 viên × 1.350 (×2), 230,4 m² × 88.000 (×2); Quang Minh DCX 4, 4, 8 m³ × 450.000; Quang Minh TC 4 m³ × 450.000 |
| Sau import | mỗi cặp có dữ liệu tới 26/10 có đúng một marker 01/01→26/10/2026 đã ký; kỳ gợi ý 27/10→26/11; ghi ngày ≤ 26/10 ở mọi cặp bị chặn |
| Bước 12 | Quang Minh × DCX chốt 27/10→26/11, không thanh toán → nợ 159.360.000 |

### P2. SQL kiểm sau import (dán vào psql của DB thật; thay `<run>` bằng id run)

```sql
-- Một run chuyển đổi đã ghi, có mốc (guard mốc đọc reviewJson.expected.cutoverDate).
SELECT id, status, "committedAt", "reviewJson" -> 'expected' ->> 'cutoverDate' AS moc
FROM import_runs WHERE adapter = 'vat-tu-chuyen-doi' ORDER BY id;

-- Marker: mỗi cặp một kỳ 01/01→26/10/2026, đã ký (theo kế hoạch).
SELECT count(*) AS so_marker, count(DISTINCT ("supplierId", "projectId")) AS so_cap,
       bool_and("signedBySupplier") AS deu_da_ky
FROM supplier_reconciliations
WHERE "importRunId" = <run> AND "deletedAt" IS NULL
  AND "periodFrom" = '2026-01-01' AND "periodTo" = '2026-10-26';

-- Không có dòng sổ vật tư ≤ 26/10 ngoài run, trừ NCC giữ ở mục 0.5 (kỳ vọng 0; thay <ncc giữ> bằng
-- danh sách id trong keep-suppliers.csv, hoặc 0 nếu không giữ NCC nào).
SELECT count(*) FROM ledger_transactions
WHERE "ledgerType" = 'material' AND "date" < '2026-10-27' AND "deletedAt" IS NULL
  AND "importRunId" IS DISTINCT FROM <run> AND "partyId" NOT IN (<ncc giữ>);

-- Phiếu lịch sử của run không sinh event (kỳ vọng 0).
SELECT count(*) FROM supplier_delivery_daily d
WHERE d."importRunId" = <run> AND d."date" < '2026-10-27'
  AND EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."deliveryId" = d.id);

-- Dòng lũy kế ngày 26/12/2025 của các cặp chọn lũy kế (2 dòng mỗi cặp, theo kế hoạch).
SELECT "transactionType", count(*), sum("totalTt") AS tt, sum("totalHd") AS hd
FROM ledger_transactions WHERE "importRunId" = <run> AND "date" = '2025-12-26' GROUP BY 1;
```

### P3. Khôi phục dòng từ `cleanup-result-<stamp>.csv` (chỉ khi DB còn schema cũ)

Tệp có cột `target, action, id, row_data` (JSON đầy đủ của dòng trước khi xoá; với `assign` là dòng sau khi gán). Chép tệp vào `/tmp/cutover/` của container. Nạp phiếu (`delivery`) trước sổ (`ledger`), vì `deliveryId` có khoá ngoại. Ví dụ với bảng sổ:

```sql
CREATE TEMP TABLE r (target text, action text, id int, row_data jsonb);
\copy r FROM '/tmp/cutover/cleanup-result.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO ledger_transactions SELECT (jsonb_populate_record(NULL::ledger_transactions, row_data)).* FROM r WHERE target = 'ledger' AND action LIKE 'delete%';
```

Sau migrate, kỳ đối chiếu cũ không nạp lại được, vì cột `projectId` mới là NOT NULL. Khi đó dùng bản sao lưu.

### P4. Chi tiết "(theo kế hoạch)" phải xác nhận ở lần chạy thử

- Tên và nhãn adapter `vat-tu-chuyen-doi` trong danh sách adapter. Component duyệt `cutover-review.tsx` hiển thị đủ các mục ở bước 9.2.
- Khoá ánh xạ (`entity:`, `supplier:`, `project:<tên>@<Chủ thể>`, `project-csv:`, `project-folder:`, `project-label:`, `item:`, `pair:`, `cdc:`, `date:<file>:<sheet>!<ô>`, `ack:`) và cách chọn trên UI.
- Lỗi chặn khi công trình đã có mà chưa gán Chủ thể. Đợt `vat_tu` còn mở: xác nhận từng đợt; chỉ đợt trùng số tiền với "Trả Nợ" mới chặn tới khi có quyết định.
- V1–V4 tính bằng cùng đường mã ở xem trước (chạy thử rồi rollback) và lúc ghi; V2–V4 lệch lúc ghi thì rollback.
- Marker 01/01→26/10 cho mọi cặp có dữ liệu, `expected.cutoverDate = "2026-10-26"` trong `reviewJson`.
- Guard độc quyền chặn import lần hai (kể cả file sửa 1 byte).
- Tên image của container `ngoquyen-erp-3001` (bước 7.1), tệp env chứa `DATABASE_URL` (mục 0.3), và cách đặt biến cho `docker compose … build`.
