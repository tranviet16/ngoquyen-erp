import { prisma } from "@/lib/prisma";
import { getPaymentScheduleSummary } from "@/lib/sl-dt/report-service";
import { PaymentScheduleClient } from "./payment-schedule-client";

interface Props {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function TienDoNopTienPage({ searchParams }: Props) {
  const params = await searchParams;
  const projectId = params.projectId ? parseInt(params.projectId, 10) : undefined;

  const [rows, projects] = await Promise.all([
    getPaymentScheduleSummary(projectId),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const overdueCount = rows.filter((r) => r.isOverdue).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tiến độ nộp tiền</h1>
          <p className="text-sm text-muted-foreground">
            Kế hoạch nộp tiền theo đợt của chủ đầu tư
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                {overdueCount} đợt quá hạn
              </span>
            )}
          </p>
        </div>
      </div>

      <form className="flex gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Dự án</label>
          <select
            name="projectId"
            defaultValue={projectId ?? ""}
            className="border rounded px-2 py-1.5 text-sm min-w-[200px]"
          >
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.code}] {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
          Lọc
        </button>
      </form>

      <PaymentScheduleClient
        rows={rows}
        projectId={projectId}
        projects={projects}
      />
    </div>
  );
}
