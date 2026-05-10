import type { UserMetrics } from "@/lib/van-hanh/performance-types";

function pct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}
function days(v: number | null) {
  return v === null ? "—" : `${v.toFixed(1)}d`;
}

export function MemberTable({ rows }: { rows: UserMetrics[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Không có thành viên trong phòng ban.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Thành viên</th>
            <th className="text-right px-3 py-2 font-medium">Hoàn thành</th>
            <th className="text-right px-3 py-2 font-medium">Đúng hạn</th>
            <th className="text-right px-3 py-2 font-medium">TB ngày</th>
            <th className="text-right px-3 py-2 font-medium">Quá hạn</th>
            <th className="text-right px-3 py-2 font-medium">Đang xử lý</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.userId} className="border-t hover:bg-muted/20">
              <td className="px-3 py-2">
                <a
                  href={`/van-hanh/hieu-suat/user/${u.userId}`}
                  className="hover:underline"
                >
                  {u.name}
                </a>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{u.completed}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(u.onTimePct)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{days(u.avgCloseDays)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {u.overdue > 0 ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">{u.overdue}</span>
                ) : (
                  u.overdue
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{u.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
