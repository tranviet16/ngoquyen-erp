# Tư vấn: lấy bản sao trên VIETPC làm production

- Ngày: 2026-11-24. Người tư vấn: Kongming (chỉ tư vấn, không sửa mã, không ghi DB, không đổi git).
- Yêu cầu của người dùng: "Bỏ qua dump production đi. Tôi đang muốn lấy bản trên máy hiện tại làm production. Giờ làm gì tiếp".
- Kế hoạch bị thay: `plans/261124-0448-production-release-train/`.

## Tóm tắt

Nên làm: **chép DB của bản sao sang admin-pc, admin-pc vẫn là máy production, chạy image phát hành `6863630`** (cách A dưới đây). Không chuyển production sang VIETPC.

Hai điều kiện bắt buộc trước khi đụng tới admin-pc:
1. Đo dữ liệu đã ghi trên admin-pc từ 09/11 (câu SQL chỉ đọc ở mục 2.1). Có dữ liệu nghiệp vụ thì phải quyết cách bù trước, vì thao tác này **ghi đè** DB admin-pc.
2. Vẫn sao lưu DB admin-pc ngay trước khi thay. "Bỏ dump" chỉ áp dụng cho buổi diễn tập, không áp dụng cho bản sao lưu để lùi.

## 1. Ba cách hiểu câu "lấy bản trên máy hiện tại làm production"

| | Cách hiểu | Dựa trên giả định | Hỏng trước tiên ở đâu |
|---|---|---|---|
| **A (khuyến nghị)** | Dữ liệu của bản sao thay DB trên admin-pc. admin-pc vẫn là máy chủ, địa chỉ cũ, image `6863630`. | Từ 09/11 không ai ghi dữ liệu nghiệp vụ đáng kể trên admin-pc; kế toán chấp nhận các quyết định đã chọn trong buổi chạy thử (ánh xạ, tách, ngày mơ hồ, danh sách dọn) là quyết định thật. | Dữ liệu người dùng nhập trên admin-pc sau 09/11 biến mất mà không ai báo. Không có công cụ gộp hai DB. |
| B | VIETPC thành máy production. | VIETPC bật liên tục, có sao lưu và giám sát. | Máy dev, repo nằm trong OneDrive, Docker Desktop từng lỗi khởi động, không có Uptime Kuma / GlitchTip / lịch sao lưu. Image bản sao build với `BETTER_AUTH_URL=http://localhost:3001` (đã kiểm), nên người dùng qua Tailscale không đăng nhập được. Địa chỉ người dùng đang dùng trỏ admin-pc. |
| C | Dùng nguyên bản sao, cả image đang chạy (`docker-erp-3001:ban-sao-tong-hop-dong`, build 18/11). | Image đó đủ tốt. | Image cũ hơn bản phát hành, thiếu các bản sửa đã gộp ngày 24/11 và chưa qua CI. Chỉ lấy dữ liệu, không lấy image. |

Đánh giá thẳng: nếu admin-pc gần như không có ghi mới, cách A **ít rủi ro hơn** kế hoạch cũ. Kế hoạch cũ bắt người duyệt làm lại toàn bộ quyết định trong một cửa sổ khoảng 3 giờ và phải tái tạo hai tuần chỉnh sửa tay đã đối chiếu. Nếu admin-pc có nhiều ghi mới thì cách A sai, quay lại kế hoạch cũ.

## 2. Phải xác nhận trước khi thay production

### 2.1 Dữ liệu ghi trên admin-pc từ 09/11 (chặn)

Bằng chứng đã có (đọc trên bản sao): dòng `audit_logs` cuối cùng trước buổi chạy thử có ngày **07/10/2026**; dòng đầu tiên của bản sao là 10/11. Tức là production không có ghi nào được audit trong hơn một tháng trước lúc dump. Suy đoán: admin-pc ít được dùng để nhập liệu, nên chênh lệch sau 09/11 có thể bằng 0. Phải đo, không được đoán.

Người dùng lưu đoạn dưới thành `do-ghi-sau-0911.sql` trên admin-pc rồi chạy (đã chạy thử trên bản sao, chỉ đọc):

```powershell
Get-Content -Raw .\do-ghi-sau-0911.sql | docker exec -i docker-postgres-1 psql -U nqerp -d ngoquyyen_erp
```

```sql
-- Chi doc. Moc: 00:00 ngay 09/11/2026 gio Bangkok = 2026-11-08 17:00 UTC.
BEGIN TRANSACTION READ ONLY;
\echo == 1. audit_logs theo bang ==
SELECT "tableName", action, count(*) AS so_dong, min("createdAt") AS dau, max("createdAt") AS cuoi
FROM audit_logs WHERE "createdAt" >= '2026-11-08 17:00:00'
GROUP BY 1, 2 ORDER BY 3 DESC;
\echo == 2. Moi bang co cot createdAt: so dong tao moi ==
SELECT c.table_name,
       (xpath('/row/n/text()', query_to_xml(format(
         'SELECT count(*) AS n FROM %I WHERE "createdAt" >= %L', c.table_name, '2026-11-08 17:00:00'),
         false, true, '')))[1]::text::int AS tao_moi
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name = 'createdAt'
ORDER BY 2 DESC, 1;
\echo == 3. Moi bang co cot updatedAt: so dong sua ==
SELECT c.table_name,
       (xpath('/row/n/text()', query_to_xml(format(
         'SELECT count(*) AS n FROM %I WHERE "updatedAt" >= %L', c.table_name, '2026-11-08 17:00:00'),
         false, true, '')))[1]::text::int AS da_sua
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name = 'updatedAt'
ORDER BY 2 DESC, 1;
\echo == 4. Tai khoan, module, migration, phien ban ==
SELECT count(*) AS so_user, max("createdAt") AS user_moi_nhat FROM users;
SELECT "moduleKey", status FROM module_availability ORDER BY 1;
SELECT count(*) AS so_migration, max(migration_name) AS migration_cuoi FROM _prisma_migrations;
SELECT version();
ROLLBACK;
```

Cách đọc kết quả:
- Mốc lấy sớm hơn giờ dump, nên có thể đếm dư vài dòng của ngày 09/11. Đếm dư là an toàn.
- `sessions`, `verifications`, `notifications` khác 0 là bình thường (đăng nhập). Bỏ qua khi quyết.
- **Mọi bảng nghiệp vụ bằng 0:** đi tiếp cách A.
- **Vài chục dòng trở xuống:** xuất danh sách (`audit_logs.afterJson`), nhập lại bằng tay trên production mới trước khi mở module. DB cũ được giữ dưới tên khác để tra.
- **Nhiều dòng, hoặc có sổ / phiếu / đợt thanh toán / công việc dùng hằng ngày:** dừng. Quay lại kế hoạch cũ (chạy go-live trên dữ liệu admin-pc).
- Phần 4 phải ra 58 migration và migration cuối `20261006110000_…` (bản sao có 62, gồm 4 migration của bản phát hành). Khác thì admin-pc không ở trạng thái đã biết, dừng lại hỏi.

### 2.2 Excel và công nợ sau lần import của bản sao (chặn về nghiệp vụ)

- Run chuyển đổi của bản sao ghi ngày 10/11 từ thư mục Excel lúc đó; sổ của bản sao có ngày nghiệp vụ mới nhất 31/10/2026.
- Mọi phát sinh kế toán ghi vào Excel từ bản chụp đó tới nay (khoảng hai tuần) **không có trong bản sao**.
- Không import lại được: guard độc quyền chặn lần import thứ hai, và Hoàn tác bị từ chối vì đã có dòng sổ ngoài run.
- Phải quyết: ai nhập bù phần chênh qua giao diện (phiếu theo công trình, thanh toán, ngày sau 26/10), trước hay sau khi mở module, và hạn chót. Mặc định đề xuất: đóng băng Excel lúc chuyển, mở module, kế toán nhập bù trong 2 ngày làm việc, thông báo rõ "ERP đủ số đến ngày X".
- Cách đo phần chênh: so thư mục Excel hiện tại của kế toán với thư mục đã dùng cho run 10/11 (thư mục `Quản Lý Công Nợ` trên VIETPC, ngày sửa tệp).

### 2.3 Bước 12a và các chỉnh sửa tay

- Runbook go-live ghi: bản sao đã được **sửa tay** các nội dung của 12a, và lần thử script ngày 17/11 trên DB khác cho kết quả trùng bản sao. Ba chỉnh sửa số liệu ở bước 2.5 của runbook cũng đã sửa thẳng trong DB bản sao. Vậy bản sao đã có đủ, production mới **không chạy 12a**.
- Cách kiểm, không đụng DB sẽ chuyển: khôi phục bản dump cuối vào một DB tạm trên VIETPC, chạy script 12a **không có `APPLY`** (kiểm SHA-256 trước). Kỳ vọng: script dừng vì các dòng sắp thêm đã có. Nếu script chạy thử qua được thì bản sao còn thiếu, dừng lại hỏi.
- Người duyệt kiểm ba cặp ở bước 2.5 của runbook ra đúng nợ cuối đã chốt, trên bản sao.

### 2.4 Tài khoản (phát hiện mới)

- Bản sao có 3 user, cả 3 là admin. **2 trong 3 user và 2 account có `createdAt` từ 09/11 trở đi; cái mới nhất tạo ngày 18/11** trên bản sao. Tức là bộ tài khoản của bản sao không phải bộ tài khoản production.
- Phải xác nhận: 3 tài khoản này là ai; tài khoản tạo để thử thì xoá hoặc đổi mật khẩu trước khi dump; production hiện có bao nhiêu user (phần 4 của câu SQL); tài khoản kế toán không phải admin có cần tạo trước khi mở không.
- Mật khẩu sau khi chuyển là mật khẩu **của bản sao**. Kho mật khẩu admin DPAPI trên admin-pc có thể không còn khớp. Mọi người phải đăng nhập lại.
- 6 dòng `sessions` của bản sao: xoá trước khi dump (đăng xuất hết trên bản sao là đủ).

### 2.5 Trạng thái module

- Bản sao: `du-an`, `cong-no-nc`, `tai-chinh`, `thanh-toan.ke-hoach`, `thanh-toan.tong-hop`, `vat-tu-ncc`, `cong-no-vt` đang `development`.
- Runbook chỉ đóng 4 module. Ba module còn lại (`du-an`, `cong-no-nc`, `tai-chinh`) đóng từ trước hay do thử nghiệm thì chưa rõ; so với phần 4 của câu SQL trên admin-pc.
- Mặc định đề xuất: mở 4 module của runbook và `du-an` (bản phát hành có DT-HĐ-TT và giao diện Dự án mới); `cong-no-nc` và `tai-chinh` giữ đúng trạng thái admin-pc đang có. Đây là quyết định của người dùng.

### 2.6 Dữ liệu thử còn trong bản sao

- 1 công việc và 2 tệp đính kèm tạo ngày 18/11 (2 tệp, khoảng 15,7 MB, ở `C:\Users\tranv\.ngoquyen-ban-sao\uploads`). Là thật thì chép tệp sang `D:\docker-data\ngoquyyen-erp\uploads` trên admin-pc, giữ nguyên đường dẫn con. Là thử thì xoá qua giao diện trước khi dump.
- Ngày 17/11 khoảng 15:32–15:35 UTC có một cụm ghi lẻ, mỗi bảng một dòng: dòng hoá đơn, giao dịch, thực thu, chi tiền, bí danh của Dự án. Trông giống một phiên thử tay (suy đoán). Người dùng xác nhận là dữ liệu thật.
- Các run `rolled_back` / `preview` là dấu vết, vô hại, giữ nguyên.

### 2.7 Người duyệt chấp nhận

Buổi chạy thử trở thành go-live. Kế toán phụ trách phải ký nhận V1–V4 và bước 11 **trên bản sao** như ký go-live. Runbook từng ghi danh sách duyệt của lần chạy thử "không dùng lại"; người dùng đang chọn dùng lại, nên cần ghi rõ quyết định này.

## 3. Các bước tối thiểu cho cách A

Người dùng chạy mọi lệnh trên admin-pc. Dùng `$PG`, `$stamp`, `$bk` như mục 0.3 của runbook go-live.

**Trên VIETPC (chưa đụng production):**
1. Xong mục 2.1–2.7. Dọn tài khoản thử, phiên đăng nhập, dữ liệu thử qua giao diện bản sao.
2. Dừng `ngoquyen-bansao-erp` để không còn ghi. Từ đây bản sao đóng băng.
3. Dump và ghi hash:
   ```powershell
   docker exec ngoquyen-bansao-pg pg_dump -U nqerp -Fc -d ngoquyyen_erp -f /tmp/ban-sao-$stamp.dump
   docker cp "ngoquyen-bansao-pg:/tmp/ban-sao-$stamp.dump" "$bk\"
   Get-FileHash -Algorithm SHA256 "$bk\ban-sao-$stamp.dump"
   ```
   Để tệp ngoài repo và ngoài OneDrive (repo công khai).
4. Diễn tập ngắn, thay phase 2 cũ: khôi phục dump vào DB tạm trên VIETPC, build image từ `6863630`, chạy trên DB tạm. Kiểm `npx prisma migrate status` (xem rủi ro 1), `/api/health`, đăng nhập, các kiểm tra của phase 5, kiểm 12a ở mục 2.3. Ghi số dòng `ledger_transactions`, `audit_logs`, `_prisma_migrations` để so ở bước 9.

**Trên admin-pc:**
5. App cũ vẫn chạy: lấy mã `6863630`; gắn thẻ image cũ `:truoc-chuyen-doi`; build image mới (runbook bước 7.1). Tạo `D:\docker-data\ngoquyyen-erp\uploads` nếu chưa có.
6. Chép dump sang qua Tailscale. `Get-FileHash` phải trùng bước 3. Sai thì dừng.
7. Báo người dùng ngừng dùng. `docker stop ngoquyen-erp-3001`.
8. Sao lưu DB cũ (runbook bước 3): `pg_dump -Fc`, chép ra `$bk`, ghi SHA-256, `pg_restore -l` không lỗi. **Không có bản này thì không đi tiếp.**
9. Khôi phục vào tên mới rồi đổi tên, không xoá DB cũ:
   ```powershell
   docker cp "$bk\ban-sao-$stamp.dump" "${PG}:/tmp/"
   docker exec $PG createdb -U nqerp ngoquyyen_erp_moi
   docker exec $PG pg_restore -U nqerp -d ngoquyyen_erp_moi --no-owner --exit-on-error "/tmp/ban-sao-$stamp.dump"
   ```
   So số dòng với bước 4. Khớp thì:
   ```powershell
   docker exec $PG psql -U nqerp -d postgres -c "ALTER DATABASE ngoquyyen_erp RENAME TO ngoquyyen_erp_cu_$stamp"
   docker exec $PG psql -U nqerp -d postgres -c "ALTER DATABASE ngoquyyen_erp_moi RENAME TO ngoquyyen_erp"
   ```
   (Tên DB có dấu gạch trong `$stamp` thì đổi thành gạch dưới.)
10. `npx prisma migrate status` trên DB mới: phải "up to date", không còn migration chờ. Còn migration chờ thì dừng, **không chạy `migrate deploy`**.
11. `docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build`.
12. Kiểm khi module còn đóng (admin vẫn vào được): `/api/health` có `status=ok`, `db=ok`; đăng nhập; `/vat-tu-ncc/cong-trinh`, `/cong-no-vt/tong-hop-cong-trinh`; ba báo cáo DT-HĐ-TT của Mầm Non; tải lên một tệp đính kèm thử rồi xoá. Người duyệt xem lại vài số đã ký ở mục 2.7.
13. Runbook bước 13: nén và đặt chỉ đọc thư mục Excel, mở module theo quyết định 2.5, kiểm bằng câu SQL bước 2 của runbook, thông báo người dùng. **Đây là điểm không lùi được.**
14. Theo dõi Uptime Kuma và GlitchTip 2 ngày làm việc. Xác nhận lịch sao lưu chạy trên DB mới. Giữ bản dump bước 8, DB `ngoquyyen_erp_cu_…` và thẻ image cũ 14 ngày sau khi ký nhận. Bản sao trên VIETPC giữ ở trạng thái dừng cùng thời hạn, để không ai nhập nhầm vào đó.

**Lùi lại (chỉ trước bước 13):**
```powershell
docker stop ngoquyen-erp-3001
docker exec $PG psql -U nqerp -d postgres -c "ALTER DATABASE ngoquyyen_erp RENAME TO ngoquyyen_erp_loi_$stamp"
docker exec $PG psql -U nqerp -d postgres -c "ALTER DATABASE ngoquyyen_erp_cu_$stamp RENAME TO ngoquyyen_erp"
docker tag "${img}:truoc-chuyen-doi" "${img}:latest"
docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build --force-recreate
```
DB cũ và image cũ đi cùng nhau. Nếu DB đổi tên bị hỏng thì khôi phục bản dump bước 8. Sau bước 13: chỉ sửa tiến, không khôi phục.

**Điều có thể sai, theo khả năng xảy ra:**
1. **Cảnh báo checksum migration.** Đã kiểm: nội dung 4 migration trong bản sao trùng tệp ở `6863630`, nhưng 2 cái được áp từ tệp xuống dòng CRLF và 2 cái từ LF (`core.autocrlf=true`). Trên admin-pc Prisma có thể báo "migration đã bị sửa sau khi áp". Theo hiểu biết của tôi `migrate status` / `migrate deploy` chỉ cảnh báo, không chặn (chưa kiểm trên mã Prisma của repo; bước 4 sẽ cho thấy). Tuyệt đối không chạy `migrate dev` hay `migrate reset` để "sửa".
2. Mất dữ liệu admin-pc sau 09/11 (mục 2.1).
3. Phát sinh Excel hai tuần không được nhập bù, số công nợ thiếu mà không ai biết (mục 2.2).
4. Tài khoản thử hoặc mật khẩu của bản sao lọt vào production (mục 2.4).
5. Build image trên admin-pc cần `DATABASE_URL` lúc build. Nếu build đọc schema mới thì build ở bước 5 lỗi; khi đó build sau bước 9, thời gian ngừng dài thêm vài phút.
6. Postgres trên admin-pc khác bản chính với bản sao (16.15). Compose ghi `postgres:16-alpine` nên khả năng thấp; phần 4 của câu SQL in phiên bản.
7. Có người tiếp tục dùng bản sao trên VIETPC sau khi chuyển. Dừng container ở bước 2 và không bật lại.

## 4. Kế hoạch release train: bỏ, giữ, đổi

| Phần | Xử lý |
|---|---|
| Phase 1 (commit phát hành `6863630`) | **Giữ.** Đã xong. |
| Phase 2 (diễn tập trên dump production mới) | **Đổi** thành diễn tập ngắn ở bước 4: image `6863630` trên bản dump của bản sao. Gắn thẻ `release-2026-11-golive` sau khi đạt. |
| Phase 3, runbook bước 2 đóng module, 4–6 kiểm kê / duyệt / dọn, 7.3 migrate, 8–12 danh mục / import / đối soát / chốt kỳ, 12a | **Bỏ** trên admin-pc. Đã làm trên bản sao. |
| Phase 3, runbook bước 3 sao lưu, 7.1 thẻ và build image, 7.4 chạy image, 7.5 smoke, 13 đóng băng Excel và mở module | **Giữ.** Thêm bước đổi DB (bước 9 ở trên). |
| Phase 4 (import DT-HĐ-TT) | **Bỏ** phần nạp dữ liệu. **Giữ** phần kiểm (`after.sql`, ba báo cáo) làm kiểm chỉ đọc sau khi chuyển. |
| Phase 5 (kiểm sau deploy, theo dõi) | **Giữ.** Đổi mục "xoá DB diễn tập trên VIETPC" thành giữ bản sao ở trạng thái dừng 14 ngày. |
| Bảng rollback | **Thay** bằng mục "Lùi lại" ở trên. |
| Script deploy của PR #22 | Không dùng lần này. Giữ cho lần deploy sau. |
| Script 12a (bản riêng, ngoài git) | Chỉ dùng để kiểm ở mục 2.3. Không chạy `APPLY` ở đâu cả. |
| `go-live-result.md` | Vẫn ghi: quyết định dùng bản sao, người duyệt ký, hash hai bản dump, giờ mở lại. |
| Nguyên tắc "lệnh production do người dùng chạy trên admin-pc" | **Giữ.** |

## Giả định

| Giả định | Độ tin | Điều làm đổi kết luận |
|---|---|---|
| Người dùng muốn cách A (giữ admin-pc làm máy chủ) | Trung bình | Nếu thật sự muốn VIETPC làm máy chủ: phải làm lại hạ tầng (URL, Tailscale serve, sao lưu, giám sát); tôi khuyên không. |
| admin-pc gần như không có ghi nghiệp vụ sau 09/11 | Trung bình (dựa vào khoảng trống audit 07/10–09/11) | Câu SQL 2.1 ra nhiều dòng thì quay lại kế hoạch cũ. |
| Bản sao đã có đủ nội dung 12a và ba chỉnh sửa số liệu | Trung bình–cao (theo runbook, chưa tự kiểm) | Kiểm 12a ở mục 2.3 chạy thử qua được thì bản sao thiếu. |
| `migrate status` chỉ cảnh báo khi checksum lệch do xuống dòng | Trung bình–cao | Bước 4 báo lỗi thì phải xử lý trước khi lên admin-pc. |
| admin-pc dùng `docker-postgres-1`, user `nqerp`, Postgres 16, compose `erp-3001` như tài liệu | Cao | Phần 4 của câu SQL và `docker ps` trên admin-pc. |

## Câu hỏi còn mở (không chặn việc chuẩn bị)

1. Kết quả câu SQL 2.1 trên admin-pc.
2. Ba tài khoản của bản sao là ai; tài khoản nào tạo để thử.
3. Công việc có 2 tệp đính kèm ngày 18/11 và cụm ghi ngày 17/11 là thật hay thử.
4. `du-an`, `cong-no-nc`, `tai-chinh` mở hay giữ đóng.
5. Ai nhập bù phát sinh Excel sau bản chụp 10/11, và hạn chót.
6. Kế toán phụ trách có ký nhận số liệu của bản sao như go-live không.

Status: DONE_WITH_CONCERNS
Summary: Khuyến nghị chép DB bản sao sang admin-pc bằng cách khôi phục vào tên mới rồi đổi tên, chạy image `6863630`, giữ DB cũ và image cũ để lùi. Không chuyển máy chủ sang VIETPC.
Concerns: chưa biết admin-pc đã ghi gì từ 09/11; hai tuần phát sinh Excel chưa có trong bản sao; 2 trong 3 tài khoản của bản sao được tạo sau 09/11; checksum migration lệch do xuống dòng cần xem ở buổi diễn tập ngắn.
