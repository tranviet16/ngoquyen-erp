/**
 * Kiểm tra dùng chung cho các đường ghi của sổ nhập liệu "Đối chiếu DT-HĐ-TT" (hóa đơn, thực tế
 * nhập, chi thực tế). Gọi bên trong transaction, SAU `lockProjectDtHdTt`, để import / hoàn tác không
 * xen giữa lúc kiểm và lúc ghi.
 *
 * Mọi id ngoại lai do client gửi (đầu mối, NCC) được tra lại với điều kiện phạm vi: đầu mối phải
 * thuộc đúng công trình của URL, NCC phải còn hoạt động. Id của công trình khác bị từ chối như id
 * không tồn tại. Không phải server action — chỉ import từ các service "use server".
 */

import { revalidatePath } from "next/cache";
import type { prisma } from "@/lib/prisma";

export type EntryRefClient = Pick<typeof prisma, "project" | "projectCounterparty" | "supplier">;

export async function assertProjectActive(client: Pick<typeof prisma, "project">, projectId: number): Promise<void> {
  const project = await client.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
  if (!project) throw new Error(`Công trình #${projectId} không tồn tại`);
}

/** Đầu mối phải thuộc công trình và chưa xóa; null = không gắn đầu mối. */
export async function assertCounterpartyInProject(
  client: Pick<typeof prisma, "projectCounterparty">,
  projectId: number,
  counterpartyId: number | null,
): Promise<void> {
  if (counterpartyId === null) return;
  const found = await client.projectCounterparty.findFirst({
    where: { id: counterpartyId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw new Error("Đầu mối không thuộc công trình này");
}

/** NCC phải còn hoạt động (chưa xóa / gộp); null = không gắn NCC. NCC mới do quản trị tạo. */
export async function assertActiveSupplier(client: Pick<typeof prisma, "supplier">, supplierId: number | null): Promise<void> {
  if (supplierId === null) return;
  const found = await client.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true } });
  if (!found) throw new Error("Nhà cung cấp không tồn tại hoặc đã ngừng dùng — chọn NCC trong danh sách");
}

/**
 * Id ngoại lai chỉ cần tra lại khi khác giá trị đang lưu: giá trị đang lưu đã được kiểm lúc ghi
 * (hoặc do import đã duyệt), và NCC đã gộp / ngừng dùng không được chặn việc sửa các ô khác.
 */
export const refChanged = (current: number | null, next: number | null): boolean => current !== next;

export type EntryBook = "hoa-don" | "thuc-te-nhap" | "chi-thuc-te";

/**
 * Các tab cũ của dự án được nuôi bởi giao dịch HĐ sinh từ sổ Hóa đơn. Công Nợ NCC không nằm đây: tab đọc sổ
 * Công nợ vật tư, không đọc giao dịch dự án.
 */
const OLD_TABS = ["giao-dich", "can-doi-vat-tu", "dinh-muc"] as const;

/** Làm mới ba báo cáo + sổ vừa ghi; sổ Hóa đơn còn nuôi các tab cũ qua giao dịch HĐ sinh tự động. */
export function revalidateEntryBook(projectId: number, book: EntryBook): void {
  for (const page of ["dt-hd", "dt-tt", "hd-tt", book]) revalidatePath(`/du-an/${projectId}/dt-hd-tt/${page}`);
  if (book !== "hoa-don") return;
  for (const tab of OLD_TABS) revalidatePath(`/du-an/${projectId}/${tab}`);
}

/**
 * Ánh xạ, đầu mối và mã nhóm đổi vị trí / thực tế của dòng ở cả ba báo cáo, nhãn "chưa gán" ở ba sổ,
 * các màn đăng ký, và (qua giao dịch HĐ sinh lại) các tab cũ — làm mới tất cả.
 */
export function revalidateMappingChange(projectId: number): void {
  const pages = ["dt-hd", "dt-tt", "hd-tt", "hoa-don", "thuc-te-nhap", "chi-thuc-te", "anh-xa", "dau-moi", "ma-nhom"];
  for (const page of pages) revalidatePath(`/du-an/${projectId}/dt-hd-tt/${page}`);
  for (const tab of OLD_TABS) revalidatePath(`/du-an/${projectId}/${tab}`);
}

/** Vi phạm chỉ mục unique: Prisma P2002, hoặc mã Postgres 23505 khi lỗi đi thẳng từ driver adapter. */
export function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { code, cause } = e as { code?: unknown; cause?: unknown };
  if (code === "P2002" || code === "23505") return true;
  const causeCode = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  return causeCode === "P2002" || causeCode === "23505";
}

/**
 * Chạy một lần ghi; trùng chỉ mục unique (partial unique WHERE "deletedAt" IS NULL của các bảng
 * đăng ký) → lỗi tiếng Việt dễ hiểu. Đã kiểm trùng trước khi ghi; nhánh này chỉ bắt hai người ghi
 * cùng lúc.
 */
export async function withUniqueMessage<T>(run: () => Promise<T>, message: string | (() => string)): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error(typeof message === "function" ? message() : message);
    throw e;
  }
}
