/**
 * Thẻ số của công trình: nhãn chữ hoa nhỏ, số lớn, dòng phụ và viền theo sắc thái. Dùng chung cho
 * Dashboard công trình và trang Tổng quan của Đối chiếu DT-HĐ-TT. Markup giữ đúng như bản trước khi tách
 * khỏi trang Dashboard (bản chụp phase 1 so chữ của các thẻ này).
 */

export type StatCardTone = "default" | "success" | "warning" | "danger" | "info";

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatCardTone;
}) {
  const accent =
    tone === "success"
      ? "border-emerald-300 dark:border-emerald-500/40"
      : tone === "warning"
      ? "border-amber-300 dark:border-amber-500/40"
      : tone === "danger"
      ? "border-red-300 dark:border-red-500/40"
      : tone === "info"
      ? "border-sky-300 dark:border-sky-500/40"
      : "border-border";
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm space-y-1 ${accent}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
