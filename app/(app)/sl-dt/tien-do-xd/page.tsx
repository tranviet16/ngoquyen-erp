import { prisma } from "@/lib/prisma";
import { getTienDoXd } from "@/lib/sl-dt/report-service";

interface Props {
  searchParams: Promise<{ year?: string; projectId?: string }>;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export default async function TienDoXdPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const projectId = params.projectId ? parseInt(params.projectId, 10) : undefined;

  const [rows, projects] = await Promise.all([
    getTienDoXd({ year, projectId }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  // Build matrix: project × month
  const projectIds = [...new Set(rows.map((r) => r.projectId))].sort((a, b) => a - b);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  type MatrixKey = `${number}-${number}`;
  const matrix = new Map<MatrixKey, number>();
  for (const r of rows) {
    matrix.set(`${r.projectId}-${r.month}`, r.avgPctComplete);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tiến độ XD</h1>
        <p className="text-sm text-muted-foreground">
          % hoàn thành trung bình theo dự án và tháng (dựa trên lịch thi công)
        </p>
      </div>

      <form className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Năm</label>
          <select name="year" defaultValue={year} className="border rounded px-2 py-1.5 text-sm">
            {[-1, 0, 1].map((off) => {
              const y = new Date().getFullYear() + off;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Dự án</label>
          <select name="projectId" defaultValue={projectId ?? ""} className="border rounded px-2 py-1.5 text-sm min-w-[180px]">
            <option value="">Tất cả</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">Lọc</button>
      </form>

      {projectIds.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Chưa có lịch thi công cho năm {year}. Vào Dự án → Tiến độ để nhập.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 sticky left-0 bg-muted/50">Dự án</th>
                {months.map((m) => (
                  <th key={m} className="text-center p-2 min-w-[70px]">T{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectIds.map((pid) => {
                const proj = projectMap[pid];
                return (
                  <tr key={pid} className="border-b hover:bg-muted/20">
                    <td className="p-2 sticky left-0 bg-background font-medium">
                      {proj ? `[${proj.code}] ${proj.name}` : `#${pid}`}
                    </td>
                    {months.map((m) => {
                      const pct = matrix.get(`${pid}-${m}`);
                      return (
                        <td key={m} className="p-2 text-center">
                          {pct != null ? (
                            <span
                              className={`text-xs font-medium ${
                                pct >= 1
                                  ? "text-green-600"
                                  : pct >= 0.7
                                  ? "text-blue-600"
                                  : "text-orange-500"
                              }`}
                            >
                              {fmtPct(pct)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
