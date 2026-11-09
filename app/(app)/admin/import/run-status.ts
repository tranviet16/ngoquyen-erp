/** Nhãn và màu trạng thái run import, dùng chung trang danh sách và trang chi tiết. */

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  preview: "Xem trước",
  committed: "Đã ghi",
  failed: "Lỗi",
  rolled_back: "Đã hoàn tác",
};

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  preview: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  committed: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  rolled_back: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300",
};

export function importRunStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function importRunStatusBadge(status: string): string {
  return STATUS_BADGES[status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-300";
}
