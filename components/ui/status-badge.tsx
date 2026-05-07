import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary";

const TONE_CLASSES: Record<StatusTone, string> = {
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  warning:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  danger:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
  info:
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30",
  neutral:
    "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30",
  primary:
    "bg-primary/10 text-primary ring-primary/30",
};

const STATUS_PRESETS: Record<string, { label: string; tone: StatusTone }> = {
  // Generic project lifecycle
  active: { label: "Đang thực hiện", tone: "info" },
  in_progress: { label: "Đang thực hiện", tone: "info" },
  completed: { label: "Hoàn thành", tone: "success" },
  done: { label: "Hoàn thành", tone: "success" },
  paused: { label: "Tạm dừng", tone: "warning" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
  pending: { label: "Chờ xử lý", tone: "warning" },
  draft: { label: "Bản nháp", tone: "neutral" },
  // Approval
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  awaiting_approval: { label: "Chờ duyệt", tone: "warning" },
  // Debt / payment
  paid: { label: "Đã thanh toán", tone: "success" },
  partial: { label: "Thanh toán một phần", tone: "warning" },
  unpaid: { label: "Chưa thanh toán", tone: "danger" },
  overdue: { label: "Quá hạn", tone: "danger" },
  // Loan lifecycle
  paid_off: { label: "Đã trả xong", tone: "success" },
  terminated: { label: "Đã chấm dứt", tone: "neutral" },
  // Schedule
  delayed: { label: "Trễ hạn", tone: "danger" },
  // Contract
  expired: { label: "Hết hạn", tone: "danger" },
};

interface StatusBadgeProps {
  status?: string | null;
  label?: string;
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const preset = status ? STATUS_PRESETS[status] : undefined;
  const finalLabel = label ?? preset?.label ?? status ?? "—";
  const finalTone: StatusTone = tone ?? preset?.tone ?? "neutral";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE_CLASSES[finalTone],
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          finalTone === "neutral" && "opacity-60"
        )}
        aria-hidden="true"
      />
      {finalLabel}
    </span>
  );
}
