import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess, type ModuleKey } from "@/lib/acl";
import { listForms } from "@/lib/coordination-form/coordination-form-service";
import { countMyUnread } from "@/lib/notification/notification-service";
import { getDashboardData } from "@/lib/tai-chinh/dashboard-service";
import { listTasksForBoard } from "@/lib/task/task-service";
import { EmptyFallback, type Shortcut } from "./_components/empty-fallback";
import { FinanceSnapshotCard } from "./_components/finance-snapshot-card";
import { FormListCard } from "./_components/form-list-card";
import { KpiCard } from "./_components/kpi-card";
import { OperationsHero } from "./_components/operations-hero";
import { PriorityQueueCard } from "./_components/priority-queue-card";
import { TaskListCard } from "./_components/task-list-card";
import { WorkflowOverviewCard } from "./_components/workflow-overview-card";

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
  const isAdmin = session.user.role === "admin";
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const taskQuery = isAdmin
    ? { includeUndated: true }
    : { assigneeId: userId, includeUndated: true };

  const financeDataPromise = canAccess(userId, "tai-chinh", {
    minLevel: "read",
    scope: "module",
  }).then((ok) => (ok ? getDashboardData() : null));

  const [tasksResult, formsResult, unreadCount, shortcutAccess, financeData] = await Promise.all([
    listTasksForBoard(taskQuery),
    listForms({ status: "pending_leader" }),
    countMyUnread(),
    Promise.all(
      MODULE_SHORTCUTS.map((s) =>
        canAccess(userId, s.key, { minLevel: "read", scope: "module" }),
      ),
    ),
    financeDataPromise,
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
  const doneThisWindow = tasksResult.byStatus.done.filter(
    (t) => t.completedAt && t.completedAt >= sevenDaysAgo,
  );

  const accessibleShortcuts: Shortcut[] = MODULE_SHORTCUTS.filter(
    (_, i) => shortcutAccess[i],
  ).map(({ label, href, icon }) => ({ label, href, icon }));

  const allEmpty =
    overdueTasks.length === 0 && upcomingTasks.length === 0 && pendingForms.length === 0;

  return (
    <div className="space-y-5">
      <OperationsHero
        userName={session.user.name}
        today={formatToday()}
        pendingForms={formsResult.total}
        shortcuts={accessibleShortcuts}
        scopeLabel={isAdmin ? "Admin đang xem toàn hệ thống" : "Đang xem phạm vi cá nhân"}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Task mở"
          value={tasksOpen.length}
          sub={isAdmin ? "Tổng task chưa đóng" : "Todo + đang làm + review"}
        />
        <KpiCard label="Quá hạn" value={overdueTasks.length} accent="danger" sub="Cần xử lý trước" />
        <KpiCard label="Chờ duyệt" value={formsResult.total} accent="warning" sub="Phiếu phối hợp" />
        <KpiCard label="Chưa đọc" value={unreadCount} accent="success" sub="Thông báo mới" />
      </div>

      {allEmpty ? (
        <EmptyFallback shortcuts={accessibleShortcuts} />
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
            <WorkflowOverviewCard
              href="/van-hanh/cong-viec"
              metrics={[
                { label: "Quá hạn", value: overdueTasks.length, tone: "danger" },
                { label: "Sắp đến hạn", value: upcomingTasks.length, tone: "warning" },
                { label: "Chờ duyệt", value: pendingForms.length, tone: "primary" },
                { label: "Đã xử lý", value: doneThisWindow.length, tone: "success" },
              ]}
            />
            <PriorityQueueCard
              overdueTasks={overdueTasks}
              upcomingTasks={upcomingTasks}
              pendingForms={pendingForms}
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <FinanceSnapshotCard data={financeData} />
            <FormListCard forms={pendingForms} viewAllHref="/van-hanh/phieu-phoi-hop" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <TaskListCard
              title="Task quá hạn"
              tasks={overdueTasks}
              mode="overdue"
              emptyText="Không có task quá hạn."
              viewAllHref="/van-hanh/cong-viec"
              now={now}
            />
            <TaskListCard
              title="Task sắp đến hạn"
              tasks={upcomingTasks}
              mode="upcoming"
              emptyText="Không có task sắp đến hạn."
              viewAllHref="/van-hanh/cong-viec"
              now={now}
            />
          </div>
        </>
      )}
    </div>
  );
}
