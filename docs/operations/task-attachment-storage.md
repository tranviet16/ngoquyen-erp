# Runbook — Lưu trữ đính kèm task trên production

Runbook này để chủ hệ thống tự chạy trên **admin-pc**, với container `ngoquyen-erp-3001` dựng từ `docker/docker-compose.erp-3001.yml`. Không chạy trên máy VIETPC: bản sao ở đó có tên container khác và thư mục lưu riêng.

## Vì sao cần làm

Trước bản sửa này, tải đính kèm task (`/van-hanh/cong-viec`) hỏng trong container vì hai lý do:

1. **Không có chỗ ghi.** App ghi vào `UPLOAD_DIR`, mặc định là `./uploads`, tức `/app/uploads`. Container chạy bằng user `nextjs` (uid 1001), còn `/app` thuộc root. Mọi lần tải đều lỗi `EACCES: permission denied, mkdir '/app/uploads'`. Kể cả khi ghi được, tệp nằm trong container cũng mất khi container bị tạo lại.
2. **Proxy cắt body ở 10MB.** `proxy.ts` bắt mọi đường dẫn, nên Next đệm body cho proxy và mặc định chỉ giữ 10MB đầu. Tệp lớn hơn bị cắt và báo lỗi `Unexpected end of form`.

Bản sửa gồm ba phần:

- Compose gắn thư mục host `D:\docker-data\ngoquyyen-erp\uploads` vào `/data/uploads` và đặt `UPLOAD_DIR=/data/uploads`.
- `next.config.ts` đặt `experimental.proxyClientMaxBodySize: "27mb"`, lớn hơn giới hạn body của server action (`serverActions.bodySizeLimit: "26mb"`: tệp tối đa 25 MiB cộng phần bao multipart). Hai giới hạn này được nới từ 26mb / 25mb khi thêm bản scan hợp đồng dự án, vì tệp đúng 25 MiB cộng phần bao vượt 25mb.
- Route tải về kiểm tệp còn trên ổ trước khi gửi. Nếu tệp mất, route trả 404 thay vì đứt giữa chừng, và log ghi `[task-attachment] file missing from storage`.

Không có migration và không đổi dữ liệu DB.

## Môi trường và thư mục lưu

| Môi trường | Container | Thư mục host → `/data/uploads` |
|---|---|---|
| Production trên VIETPC (từ 11/2026) | `ngoquyen-prod-erp` (`docker/docker-compose.erp-vietpc.yml`) | `UPLOAD_HOST_DIR` của file env production: `C:\Users\tranv\.ngoquyen-prod\uploads`, ngoài OneDrive |
| Bản sao dev (VIETPC) | server dev qua `scripts/serve-local-build.mjs`, CSDL `ngoquyen-dev-pg` cổng 5434 | `UPLOAD_DIR` của file env dev: `C:\Users\tranv\.ngoquyen-dev\uploads` |
| Production cũ (admin-pc, tới lúc chuyển 11/2026) | `ngoquyen-erp-3001` | `D:\docker-data\ngoquyyen-erp\uploads` |
| Stack thay thế `docker-compose.prod.yml` (admin-pc) | `ngoquyyen-nextjs` | cùng thư mục trên, vì stack này dùng chung dữ liệu Postgres `D:\docker-data\ngoquyyen-erp\postgres`. Không chạy hai stack cùng lúc. |

Thư mục đính kèm phải đi cùng DB của nó. Mỗi dòng `task_attachments` trỏ tới một tệp theo đường dẫn tương đối (`task-attachments/<taskId>/<uuid>-<tên>`).

## 0. Điều kiện trước

- [ ] Nhánh deploy đã có bản sửa: `next.config.ts` có `proxyClientMaxBodySize`, và `docker/docker-compose.erp-3001.yml` có `UPLOAD_DIR` và `volumes`.
- [ ] Biến môi trường build/chạy đặt như các lần deploy `erp-3001` trước (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `DATABASE_URL` cho secret lúc build). Không in giá trị ra màn hình.

## 1. Kiểm hiện trạng (chỉ đọc)

```powershell
docker inspect -f "{{json .Mounts}}" ngoquyen-erp-3001
docker exec ngoquyen-erp-3001 sh -c 'echo "UPLOAD_DIR=$UPLOAD_DIR"; ls -la /app/uploads 2>&1 | head'
docker exec docker-postgres-1 psql -U nqerp -d ngoquyyen_erp -At -c "SELECT count(*) FROM task_attachments"
```

Kết quả mong đợi trước bản sửa là `Mounts=[]`, không có `/app/uploads`, và `0` dòng.

Nếu `/app/uploads` **có** tệp, phải chép chúng ra trước bước 4, vì bước 4 tạo lại container và xoá hệ thống tệp bên trong:

```powershell
New-Item -ItemType Directory -Force D:\docker-data\ngoquyyen-erp\uploads | Out-Null
docker cp ngoquyen-erp-3001:/app/uploads/. D:\docker-data\ngoquyyen-erp\uploads\
```

## 2. Ghi lại image hiện tại để có thể quay lại

```powershell
docker inspect -f "{{.Config.Image}}" ngoquyen-erp-3001      # ví dụ docker-erp-3001
$img = "<tên image vừa in, bỏ phần :tag nếu có>"
docker tag "${img}:latest" "${img}:truoc-dinh-kem-task"
```

## 3. Tạo thư mục lưu trên host

```powershell
New-Item -ItemType Directory -Force D:\docker-data\ngoquyyen-erp\uploads | Out-Null
```

Trên Docker Desktop cho Windows, thư mục bind mount từ ổ Windows ghi được với mọi uid trong container, nên không cần chown. Điều này đã kiểm trên bản sao VIETPC.

Nếu sau này chạy trên host Linux, phải giao thư mục cho uid của user `nextjs`:

```bash
sudo mkdir -p /srv/ngoquyyen-erp/uploads
sudo chown 1001:1001 /srv/ngoquyyen-erp/uploads
```

## 4. Build và tạo lại container

```powershell
docker compose -f docker/docker-compose.erp-3001.yml build
docker compose -f docker/docker-compose.erp-3001.yml up -d
```

`up -d` tự tạo lại container vì môi trường và volume đã đổi. Nếu không cần build lại, dùng `up -d --no-build`.

Image cố ý không có sẵn `/data`. Nếu thiếu mount, việc tải lên báo lỗi `EACCES` ngay, thay vì ghi tạm vào container rồi mất tệp khi tạo lại.

## 5. Kiểm sau khi chạy

```powershell
docker inspect -f "{{json .Mounts}}" ngoquyen-erp-3001                     # phải thấy ...\uploads -> /data/uploads
docker exec ngoquyen-erp-3001 sh -c 'echo "UPLOAD_DIR=$UPLOAD_DIR"; touch /data/uploads/.ghi-thu && rm /data/uploads/.ghi-thu && echo GHI-DUOC'
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Sau đó thử trên giao diện:

1. Mở một task ở `/van-hanh/cong-viec`, tải lên một PDF nhỏ và một tệp khoảng 15MB (PDF, ảnh, Office hoặc zip, tối đa 25MB).
2. Tải về cả hai tệp, rồi mở thử.
3. Kiểm tệp có trên host: `Get-ChildItem -Recurse D:\docker-data\ngoquyyen-erp\uploads\task-attachments`.
4. Tạo lại container một lần nữa (`docker compose -f docker/docker-compose.erp-3001.yml up -d --force-recreate`), rồi tải về lại hai tệp. Cả hai vẫn phải còn.
5. Xoá hai tệp thử trên giao diện nếu không cần giữ.
6. `docker logs --since 10m ngoquyen-erp-3001` không được có dòng `Request body exceeded 10MB` hay `EACCES`.

## 6. Sao lưu

Từ giờ đính kèm task là dữ liệu cần sao lưu. Đưa `D:\docker-data\ngoquyyen-erp\uploads` vào cùng lịch sao lưu với DB. Khi khôi phục, lấy DB và thư mục này ở **cùng một thời điểm**. Nếu không, có dòng trỏ tới tệp không còn (route tải về trả 404), hoặc có tệp mồ côi.

## 7. Quay lại

Quay lại không làm mất tệp, vì tệp nằm trên host.

```powershell
docker tag "${img}:truoc-dinh-kem-task" "${img}:latest"
docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build
```

Image cũ vẫn dùng được `UPLOAD_DIR` và thư mục mount (phần lưu trữ chỉ là cấu hình compose). Nó chỉ thiếu giới hạn body 26MB, nên tệp trên 10MB lại lỗi. Nó cũng thiếu bước kiểm tệp trước khi tải về.
