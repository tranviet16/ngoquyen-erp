import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess, type ModuleKey } from "@/lib/acl";
import { listTasksForBoard } from "@/lib/task/task-service";
import { listForms } from "@/lib/coordination-form/coordination-form-service";
import { countMyUnread } from "@/lib/notification/notification-service";
import { KpiCard } from "./_components/kpi-card";
import { TaskListCard } from "./_components/task-list-card";
import { FormListCard } from "./_components/form-list-card";
import { EmptyFallback, type Shortcut } from "./_components/empty-fallback";

export const dynamic = "force-dynamic";

const MODULE_SHORTCUTS: ReadonlyArray<Shortcut & { key: ModuleKey }> = [
  { key: "du-an", label: "Dự án", href: "/du-an", icon: "Building2" },
  { key: "vat-tu-ncc", label: "Vật tư", href: "/vat-tu-ncc", icon: "Package" },
  { key: "sl-dt", label: "Sản lượng", href: "/sl-dt", icon: "TrendingUp" },
  { key: "van-hanh.cong-viec", label: "Công việc", href: "/van-hanh/cong-viec", icon: "KanbanSquare" },
  { key: "van-hanh.phieu-phoi-hop", label: "Phiếu phối hợp", href: "/van-hanh/phieu-phoi-hop", icon: "ClipboardList" },
  { key: "thong-bao", label: "Thông báo", href: "/thong-bao", icon: "Bell" },
];

function formatToday(): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 86400000);

  const [tasksResult, formsResult, unreadCount, shortcutAccess] = await Promise.all([
    listTasksForBoard({ assigneeId: userId, includeUndated: true }),
    listForms({ status: "pending_leader" }),
    countMyUnread(),
    Promise.all(
      MODULE_SHORTCUTS.map((s) =>
        canAccess(userId, s.key, { minLevel: "read", scope: "module" }),
      ),
    ),
  ]);

  const tasksOpen = [
    ...tasksResult.byStatus.todo,
    ...tasksResult.byStatus.doing,
    ...tasksResult.byStatus.review,
  ];

  const overdueTasks = tasksOpen
    .filter((t) => t.deadline && t.deadline < now)
    .sort((a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0))
    .slice(0, 5);

  const upcomingTasks = tasksOpen
    .filter((t) => t.deadline && t.deadline >= now && t.deadline <= sevenDaysLater)
    .sort((a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0))
    .slice(0, 5);

  const pendingForms = formsResult.items.slice(0, 5);

  const accessibleShortcuts: Shortcut[] = MODULE_SHORTCUTS.filter(
    (_, i) => shortcutAccess[i],
  ).map(({ label, href, icon }) => ({ label, href, icon }));

  const allEmpty =
    overdueTasks.length === 0 && upcomingTasks.length === 0 && pendingForms.length === 0;

  return (
    <div className="space-y-5 p-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Xin chào, {session.user.name}</h1>
        <p className="text-sm text-muted-foreground capitalize">{formatToday()}</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard label="Task đang chờ" value={tasksOpen.length} />
        <KpiCard label="Task quá hạn" value={overdueTasks.length} accent="danger" />
        <KpiCard label="Phiếu chờ duyệt" value={formsResult.total} />
        <KpiCard label="Thông báo chưa đọc" value={unreadCount} />
      </div>

      {allEmpty ? (
        <EmptyFallback shortcuts={accessibleShortcuts} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <TaskListCard
              title="Task quá hạn"
              tasks={overdueTasks}
              mode="overdue"
              emptyText="Không có task quá hạn."
              viewAllHref="/van-hanh/cong-viec"
              now={now}
            />
            <FormListCard forms={pendingForms} viewAllHref="/van-hanh/phieu-phoi-hop" />
          </div>
          <TaskListCard
            title="Task sắp đến hạn (7 ngày)"
            tasks={upcomingTasks}
            mode="upcoming"
            emptyText="Không có task sắp đến hạn."
            viewAllHref="/van-hanh/cong-viec"
            now={now}
          />
        </>
      )}
    </div>
  );
}
