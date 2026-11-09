/**
 * Lỗi nghiệp vụ của engine import. Thông điệp tiếng Việt, hiển thị nguyên văn cho admin
 * (server action trả về thay vì ném — xem `app/(app)/admin/import/import-actions.ts`).
 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * Commit bị từ chối vì điều kiện trước (run không còn ở `preview`, sai `reviewVersion`, còn lỗi
 * chặn, thiếu xác nhận, file đã được import ở run khác). Run giữ NGUYÊN trạng thái — người dùng
 * tải lại trang / sửa ánh xạ rồi ghi lại; chỉ lỗi khi thực thi mới đánh dấu `failed`.
 */
export class ImportPreconditionError extends ImportError {
  constructor(message: string) {
    super(message);
    this.name = "ImportPreconditionError";
  }
}

/** Hoàn tác bị guard chặn: ERP đã có dữ liệu phụ thuộc vào run. */
export class RollbackBlockedError extends ImportError {
  readonly reasons: string[];

  constructor(runId: number, reasons: string[]) {
    super(`Không thể hoàn tác run #${runId}: ${reasons.join(" ")}`);
    this.name = "RollbackBlockedError";
    this.reasons = reasons;
  }
}

/**
 * Mã lỗi DB tạm thời — thử lại là qua: Prisma P2028 (giao dịch hết giờ / đã đóng, hết giờ chờ kết
 * nối), P2034 (xung đột ghi / deadlock); Postgres 40P01 (deadlock), 55P03 (hết giờ chờ khoá),
 * 40001 (lỗi tuần tự hoá).
 */
const TRANSIENT_DB_CODES = new Set(["P2028", "P2034", "40P01", "55P03", "40001"]);
const TRANSIENT_CODE_KEYS = ["code", "originalCode"] as const;
const TRANSIENT_NESTED_KEYS = ["meta", "cause", "driverAdapterError"] as const;

/**
 * Lỗi có phải lỗi DB tạm thời không. Prisma với driver adapter lồng mã Postgres ở
 * `meta.driverAdapterError.cause.{code,originalCode}` (hoặc `cause`), nên duyệt các khoá lồng đó
 * (có giới hạn độ sâu, chống vòng lặp).
 */
export function isTransientDbError(err: unknown): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): boolean => {
    if (depth > 6 || value === null || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of TRANSIENT_CODE_KEYS) {
      const code = record[key];
      if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) return true;
    }
    return TRANSIENT_NESTED_KEYS.some((key) => visit(record[key], depth + 1));
  };
  return visit(err, 0);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
