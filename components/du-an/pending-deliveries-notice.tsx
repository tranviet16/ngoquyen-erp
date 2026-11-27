/**
 * Thông báo phiếu vật tư ngày chưa chốt vào sổ Công nợ vật tư của công trình — dùng chung cho tab Công Nợ NCC
 * và Giao Dịch (nguồn "Sổ công nợ vật tư"). Chỉ nhận số phiếu, không nhận số tiền (dữ liệu của Vật tư NCC).
 * Không dùng hook: render được ở cả server lẫn client component.
 */

const AMBER =
  "rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";

export function PendingDeliveriesNotice({ count, unpricedCount }: { count: number; unpricedCount: number }) {
  if (count <= 0) return null;
  return (
    <div className={AMBER} role="status">
      Có {count} phiếu vật tư ngày chưa chốt vào sổ công nợ
      {unpricedCount > 0 ? ` (${unpricedCount} phiếu chưa có giá)` : ""} nên chưa nằm trong số liệu bên dưới.
    </div>
  );
}
