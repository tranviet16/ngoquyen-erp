/**
 * Phạm vi cặp NCC × công trình cho mọi ghi vật tư — guard dùng chung, không "use server"
 * (các hàm nhận client transaction, không được lộ ra làm server action).
 *
 *  - `MaterialScopeError`: lỗi nghiệp vụ có mã để UI/caller phân biệt (thiếu công trình,
 *    công trình chưa có Chủ thể, ngày thuộc giai đoạn đã chuyển đổi từ Excel).
 *  - `resolveMaterialEntityId`: Chủ thể của mọi ghi vật tư = `Project.entityId` (bất biến I2).
 *  - Guard mốc chuyển đổi toàn cục: khi đã có run import `vat-tu-chuyen-doi` ở trạng thái
 *    `committed`, mọi ghi vật tư có ngày ≤ mốc của run đó bị từ chối với MỌI cặp (kể cả cặp
 *    tạo sau go-live). Không có run → không ảnh hưởng (dev/test).
 */

import { prisma } from "@/lib/prisma";
import { parseIsoDateUtc, toBusinessDateUtc } from "@/lib/ledger/business-date";
import { formatDmy } from "./period-bounds";

export type MaterialScopeErrorCode =
  | "missing_project"
  | "missing_entity"
  | "cutover_locked"
  | "cutover_invalid"
  | "signed_period";

export class MaterialScopeError extends Error {
  constructor(
    public readonly code: MaterialScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialScopeError";
  }
}

export const MISSING_ENTITY_MESSAGE = "Công trình chưa gán Chủ thể — gán ở Master data > Công trình";
export const MISSING_PROJECT_MESSAGE = "Thiếu công trình — công nợ vật tư bắt buộc theo NCC × công trình";

/** Ép `projectId` (đọc từ DB/kiểu nullable) thành số nguyên dương; thiếu thì ném `missing_project`. */
export function requireProjectId(projectId: number | null | undefined, context?: string): number {
  if (typeof projectId === "number" && Number.isInteger(projectId) && projectId > 0) return projectId;
  throw new MaterialScopeError("missing_project", context ? `${context}: ${MISSING_PROJECT_MESSAGE}` : MISSING_PROJECT_MESSAGE);
}

/**
 * Chủ thể của ghi vật tư suy từ công trình. Công trình không tồn tại / chưa có Chủ thể → lỗi có mã.
 *
 * Gọi với client transaction (khác `prisma` gốc) → đọc dòng công trình `FOR SHARE`: khoá giữ tới hết
 * transaction ghi, nên admin đổi Chủ thể (`SELECT … FOR UPDATE` ở project-service) phải chờ ghi
 * xong rồi mới đếm "đã có dữ liệu vật tư" — không có khe đổi Chủ thể chen giữa đọc và ghi.
 * Gọi với `prisma` gốc (không transaction) → đọc thường; khoá theo câu lệnh không có tác dụng.
 */
export async function resolveMaterialEntityId(
  db: Pick<typeof prisma, "project" | "$queryRaw">,
  projectId: number,
): Promise<number> {
  const id = requireProjectId(projectId);
  const project =
    db === prisma
      ? await db.project.findUnique({ where: { id }, select: { entityId: true } })
      : ((await db.$queryRaw<{ entityId: number | null }[]>`
          SELECT "entityId" FROM projects WHERE id = ${id} FOR SHARE`)[0] ?? null);
  if (!project) throw new MaterialScopeError("missing_project", `Công trình #${id} không tồn tại`);
  if (project.entityId == null) throw new MaterialScopeError("missing_entity", MISSING_ENTITY_MESSAGE);
  return project.entityId;
}

// ── Guard mốc chuyển đổi ──────────────────────────────────────────────────────

/** Adapter import chuyển đổi Excel → ERP. Run `committed` của adapter này mang mốc. */
export const MATERIAL_CUTOVER_ADAPTER = "vat-tu-chuyen-doi";

/**
 * Hợp đồng dữ liệu giữa adapter chuyển đổi (ghi) và guard mốc (đọc): khi commit, adapter ghi
 * `ImportRun.reviewJson.expected.cutoverDate` = ngày nghiệp vụ cuối cùng do Excel quản lý,
 * dạng `"YYYY-MM-DD"` (vd. `"2026-10-26"`). Ghi một lần cùng transaction commit, không sửa lại.
 * Các khoá khác của `expected` (kết quả đối soát, danh mục đã tạo…) do adapter tự định nghĩa.
 */
export interface MaterialCutoverExpected {
  cutoverDate: string;
}

export interface MaterialCutoverReviewJson {
  expected: MaterialCutoverExpected;
}

/** Đọc chuỗi mốc `"YYYY-MM-DD"`; trả `null` khi không phải chuỗi hoặc sai định dạng. */
export function parseCutoverDateValue(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  try {
    return parseIsoDateUtc(raw);
  } catch {
    return null;
  }
}

/** Đọc mốc từ `reviewJson`; trả `null` khi thiếu hoặc sai định dạng. */
export function parseCutoverDate(reviewJson: unknown): Date | null {
  if (typeof reviewJson !== "object" || reviewJson === null) return null;
  const expected = (reviewJson as { expected?: unknown }).expected;
  if (typeof expected !== "object" || expected === null) return null;
  return parseCutoverDateValue((expected as { cutoverDate?: unknown }).cutoverDate);
}

export type CutoverClient = Pick<typeof prisma, "$queryRaw">;

/**
 * Mốc chuyển đổi toàn cục (ngày nghiệp vụ UTC 00:00, bao gồm) hoặc `null` khi chưa có run
 * chuyển đổi nào được commit. Run `rolled_back` không tính. Run đã commit mà thiếu mốc là
 * lỗi dữ liệu — fail closed (chặn ghi) thay vì lặng lẽ bỏ guard.
 *
 * Guard chạy cho mỗi dòng ghi (nhiều lần trong một transaction) nên chỉ đọc đúng một trường
 * bằng SQL — không kéo cả `reviewJson` (payload review của run chuyển đổi có thể nhiều MB).
 */
export async function getMaterialCutoverDate(db: CutoverClient): Promise<Date | null> {
  const rows = await db.$queryRaw<{ id: number; cutoverDate: string | null }[]>`
    SELECT id, ("reviewJson" -> 'expected' ->> 'cutoverDate') AS "cutoverDate"
      FROM import_runs
     WHERE adapter = ${MATERIAL_CUTOVER_ADAPTER} AND status = 'committed'
     ORDER BY "committedAt" DESC NULLS LAST, id DESC
     LIMIT 1`;
  const run = rows[0];
  if (!run) return null;
  const date = parseCutoverDateValue(run.cutoverDate);
  if (!date) {
    throw new MaterialScopeError(
      "cutover_invalid",
      `Run chuyển đổi #${run.id} đã ghi nhưng thiếu mốc (reviewJson.expected.cutoverDate) — liên hệ admin.`,
    );
  }
  return date;
}

export interface MaterialWriteGuardOptions {
  /**
   * Chỉ adapter `vat-tu-chuyen-doi` truyền, bằng id của chính run đang commit: ghi của run
   * import không đi qua guard mốc (tiền tới mốc chỉ đến từ run này — bất biến I3).
   */
  cutoverImportRunId?: number;
  /**
   * Admin đã xác nhận sửa phiếu ngày nằm trong giai đoạn bị khoá (kỳ NCC đã ký hoặc trước mốc chuyển
   * đổi): bỏ qua guard mốc và khoá kỳ đã ký. Chỉ `delivery-service` truyền, SAU `requireActiveAdmin`,
   * và tự đông cứng lại các kỳ đã ký bị ảnh hưởng (`refreezeSignedPeriodsFrom`).
   */
  adminOverride?: true;
}

/** Ném `cutover_locked` khi `date` ≤ mốc chuyển đổi. Áp dụng cho mọi loại giao dịch, kể cả dieu_chinh. */
export async function assertAfterMaterialCutover(
  date: Date,
  db: CutoverClient,
  opts?: MaterialWriteGuardOptions,
): Promise<void> {
  if (opts?.adminOverride) return;
  if (opts?.cutoverImportRunId !== undefined) {
    if (!Number.isInteger(opts.cutoverImportRunId) || opts.cutoverImportRunId <= 0) {
      throw new Error(`Mã run import không hợp lệ: ${opts.cutoverImportRunId}`);
    }
    return;
  }
  const cutover = await getMaterialCutoverDate(db);
  if (!cutover) return;
  const businessDate = toBusinessDateUtc(date);
  if (businessDate.getTime() <= cutover.getTime()) {
    throw new MaterialScopeError(
      "cutover_locked",
      `Ngày ${formatDmy(businessDate)} thuộc giai đoạn đã chuyển đổi từ Excel (tới hết ${formatDmy(cutover)}) — ` +
        `không thể ghi/sửa. Chênh lệch ghi bút toán điều chỉnh sau ngày ${formatDmy(cutover)}.`,
    );
  }
}
