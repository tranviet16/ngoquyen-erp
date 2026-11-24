/**
 * Chốt an toàn cho các script baseline / đo của tab "Đối chiếu DT-HĐ-TT".
 *
 * - Chỉ nói chuyện với server chạy trên máy này (127.0.0.1 / localhost). Cổng 3001 bị từ chối vì đó là
 *   container bản sao chạy một bản build không ghim commit — so với nó không chứng minh được gì.
 * - Chỉ đọc CSDL bản sao trên loopback cổng 5433. Không bao giờ in DATABASE_URL ra màn hình.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const UNPINNED_COPY_PORT = "3001";
const COPY_DB_PORT = "5433";

export class GuardError extends Error {}

/** Base URL bắt buộc, phải là loopback và không phải container 3001. Trả về URL đã chuẩn hóa (không có "/" cuối). */
export function requireLoopbackBaseUrl(raw: string | undefined): string {
  if (!raw) throw new GuardError("Thiếu --base-url (bắt buộc, không có mặc định).");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError(`--base-url không phải URL hợp lệ: ${raw}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new GuardError(`--base-url phải trỏ về máy này (127.0.0.1), không phải ${url.hostname}.`);
  if (url.port === UNPINNED_COPY_PORT) throw new GuardError("Không dùng cổng 3001: đó là bản build không ghim commit của container bản sao.");
  return url.origin;
}

/** DATABASE_URL phải là CSDL bản sao trên loopback cổng 5433. Chỉ báo lỗi chung, không lộ giá trị. */
export function requireCopyDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new GuardError("Thiếu DATABASE_URL — chạy bằng `npx tsx --env-file=.env.local ...`.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError("DATABASE_URL không đọc được.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new GuardError("DATABASE_URL không trỏ về máy này — từ chối đọc.");
  if (url.port !== COPY_DB_PORT) throw new GuardError(`DATABASE_URL không ở cổng ${COPY_DB_PORT} của CSDL bản sao — từ chối đọc.`);
  return raw;
}
