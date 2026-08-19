/**
 * Chuẩn hóa tên/ĐVT vật tư để đối chiếu giữa các nguồn (dự toán, hóa đơn, file Excel):
 * bỏ dấu, thường hóa, giữ ngữ nghĩa so sánh (D<=10 ≠ D>10), gộp biến thể số-đơn-vị
 * ("200T" = "200 T"). Dùng bởi import adapters và các service đối chiếu du-an.
 */
export function normVtName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/<=/g, " nho hon bang ")
    .replace(/>=/g, " lon hon bang ")
    .replace(/</g, " nho hon ")
    .replace(/>/g, " lon hon ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
