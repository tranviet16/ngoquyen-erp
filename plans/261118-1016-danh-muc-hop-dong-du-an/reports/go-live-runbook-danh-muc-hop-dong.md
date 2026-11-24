# Runbook go-live — Danh mục hợp đồng dự án

Chủ hệ thống tự chạy trên **admin-pc** (container `ngoquyen-erp-3001`, Postgres `docker-postgres-1`). Không chạy trên VIETPC: bản sao ở đó có tên container khác (`ngoquyen-bansao-*`).

Thay đổi gồm một migration chỉ thêm (`20261118120000_du_an_danh_muc_hop_dong`), code mới, và bản scan lưu ở `UPLOAD_DIR`. Lưu tệp dùng chung hạ tầng của đính kèm task (PR #23, runbook `docs/operations/task-attachment-storage.md`).

## 0. Điều kiện trước

- [ ] Nhánh deploy có migration `20261118120000_du_an_danh_muc_hop_dong` và là migration mới nhất (nếu có migration timestamp lớn hơn được merge trước, đổi tên thư mục migration này trước khi merge).
- [ ] Đã chạy xong runbook `docs/operations/task-attachment-storage.md` (volume `D:\docker-data\ngoquyyen-erp\uploads` → `/data/uploads`, `UPLOAD_DIR=/data/uploads`). Nếu chưa, làm bước 3–5 dưới đây.

## 1. Đếm hiện trạng (chỉ đọc)

```powershell
docker exec docker-postgres-1 psql -U nqerp -d ngoquyyen_erp -At -c "SELECT \"docType\", status, count(*) FROM project_contracts WHERE \"deletedAt\" IS NULL GROUP BY 1,2 ORDER BY 1,2"
```

Ghi lại kết quả. Sau migrate, các số này phải giữ nguyên.

## 2. Sao lưu DB

```powershell
docker exec docker-postgres-1 pg_dump -U nqerp -d ngoquyyen_erp -Fc -f /tmp/truoc-danh-muc-hop-dong.dump
docker cp docker-postgres-1:/tmp/truoc-danh-muc-hop-dong.dump D:\docker-data\backups\
```

## 3. Thư mục lưu tệp (bỏ qua nếu runbook đính kèm task đã làm)

- Tạo `D:\docker-data\ngoquyyen-erp\uploads` trên host. Bind mount Windows ghi được bởi uid 1001 không cần chown; trên Linux thì `chown 1001` thư mục.
- **Đưa thư mục này vào lịch sao lưu** cùng các bản dump DB: dòng `project_contract_attachments` trỏ tới tệp theo đường dẫn tương đối `contract-scans/<projectId>/<contractId>/<uuid>-<tên>`. Thư mục phải đi cùng DB của nó.

## 4. Compose và recreate container (bỏ qua nếu đã làm)

`docker/docker-compose.erp-3001.yml` (và `docker-compose.prod.yml` nếu dùng stack đó) có `UPLOAD_DIR: /data/uploads` và volume `D:/docker-data/ngoquyyen-erp/uploads:/data/uploads`. Build và recreate container như các lần deploy `erp-3001` trước.

## 5. Ghi thử vào thư mục lưu

```powershell
docker exec ngoquyen-erp-3001 sh -c 'touch /data/uploads/.ghi-thu && rm /data/uploads/.ghi-thu && echo GHI_DUOC'
```

Phải in `GHI_DUOC`. Nếu lỗi `EACCES` hoặc không có `/data`, dừng lại và sửa mount trước khi đi tiếp.

## 6. Migrate

```powershell
npx prisma migrate deploy
```

Chạy với `DATABASE_URL` của production như các lần migrate trước. Không dùng `migrate dev` / `migrate reset`. Sau đó chạy lại câu đếm ở bước 1: số theo `docType` / `status` phải giữ nguyên.

## 7. Kiểm nhanh

1. Mở một công trình → tab **Hợp Đồng**: danh mục mở được, cột "Giá trị theo DT" hiện giá trị cũ của các hợp đồng đã import.
2. Tạo một hợp đồng NCC cho một cặp đã có số liệu; mở màn chi tiết, so tổng lấy hàng / chuyển tiền với `/cong-no-vt` (công nợ lũy kế, lọc theo công trình).
3. Tải lên một bản scan PDF khoảng 15 MB; bấm **Xem** (PDF hiện được trên Chrome / Edge) và **Tải về**.
4. Tùy chọn, chạy tie-out (chỉ đọc): `npx tsx scripts/verify-contract-detail-tie-out.ts` phải in "N/N cặp khớp" cho sổ vật tư.

## 8. Theo dõi

- Dung lượng `D:\docker-data\ngoquyyen-erp\uploads` (mỗi tệp tối đa 25 MB; xóa mềm giữ tệp, chỉ admin "Xóa vĩnh viễn" mới giải phóng chỗ).
- Log app có `[du-an/scan]`: lỗi ghi / đọc tệp (chi tiết chỉ nằm trong log, người dùng chỉ thấy câu chung).

## Rollback

1. **Rollback build trước** (deploy lại image cũ). Schema mới chỉ thêm nên build cũ vẫn đọc, tạo và sửa hợp đồng chưa gắn đối tác.
   - **Ngoại lệ:** build cũ đổi `docType` của một hợp đồng **đã gắn đối tác** sang loại khác sẽ vi phạm CHECK `project_contracts_party_doc_type_check`, người dùng chỉ thấy lỗi chung. Báo người dùng tránh thao tác này cho tới khi rollback DB hoặc deploy lại.
2. **Chỉ khi thật cần** mới rollback DB bằng `plans/261118-1016-danh-muc-hop-dong-du-an/rollback-danh-muc-hop-dong.sql`. Trước khi chạy, **xuất CSV** ba phần sẽ mất (các lệnh `\copy` ở đầu tệp SQL): liên kết đối tác + giá trị TT, danh mục bản scan, sổ hóa đơn xuất CĐT. Tệp scan trên đĩa không bị xóa; giữ lại cùng CSV.

## Hoàn tác import sau go-live

Hoàn tác một lần import "Dự án xây dựng" bị chặn khi hợp đồng của lần import đó đã được gắn đối tác, có giá trị TT, hoặc có bản scan (kể cả đã xóa mềm). Câu báo nêu tên hợp đồng. Cách gỡ: gỡ đối tác và xóa giá trị TT trên màn hình, nhờ admin **Xóa vĩnh viễn** bản scan ở màn chi tiết hợp đồng, rồi hoàn tác.
