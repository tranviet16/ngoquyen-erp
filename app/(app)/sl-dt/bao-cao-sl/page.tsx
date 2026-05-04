import { prisma } from "@/lib/prisma";
import { getSlDtReport } from "@/lib/sl-dt/report-service";

interface Props {
  searchParams: Promise<{ year?: string; month?: string; projectId?: string }>;
}

function fmtVnd(v: { toString(): string } | null | undefined): string {
  if (v == null) return "—";
  const n = parseFloat(v.toString());
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export default async function BaoCaoSlPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const month = params.month ? parseInt(params.month, 10) : undefined;
  const projectId = params.projectId ? parseInt(params.projectId, 10) : undefined;

  const [rows, projects] = await Promise.all([
    getSlDtReport({ year, month, projectId }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo Sản lượng</h1>
        <p className="text-sm text-muted-foreground">So sánh SL kế hoạch vs thực hiện — SL = giá trị nghiệm thu nội bộ</p>
      </div>

      <form className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Năm</label>
          <select name="year" defaultValue={year} className="border rounded px-2 py-1.5 text-sm">
            {[-1, 0, 1].map((off) => { const y = new Date().getFullYear() + off; return <option key={y} value={y}>{y}</option>; })}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tháng</label>
          <select name="month" defaultValue={month ?? ""} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Tất cả</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Dự án</label>
          <select name="projectId" defaultValue={projectId ?? ""} className="border rounded px-2 py-1.5 text-sm min-w-[180px]">
            <option value="">Tất cả</option>
            {projects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">Lọc</button>
      </form>

      {rows.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Không có dữ liệu cho bộ lọc đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Dự án</th>
                <th className="text-center p-2">Năm</th>
                <th className="text-center p-2">Tháng</th>
                <th className="text-right p-2">SL Kế hoạch</th>
                <th className="text-right p-2">SL Thực hiện</th>
                <th className="text-right p-2">Chênh lệch</th>
                <th className="text-right p-2">% Hoàn thành</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const proj = projectMap[r.projectId];
                const diffPos = r.slDiff.gte(0);
                return (
                  <tr key={`${r.projectId}-${r.year}-${r.month}`} className="border-b hover:bg-muted/20">
                    <td className="p-2">{proj ? `[${proj.code}] ${proj.name}` : `#${r.projectId}`}</td>
                    <td className="p-2 text-center">{r.year}</td>
                    <td className="p-2 text-center">{r.month}</td>
                    <td className="p-2 text-right">{fmtVnd(r.slTarget)}</td>
                    <td className="p-2 text-right">{fmtVnd(r.slActual)}</td>
                    <td className={`p-2 text-right ${diffPos ? "text-green-600" : "text-red-500"}`}>
                      {fmtVnd(r.slDiff)}
                    </td>
                    <td className={`p-2 text-right font-medium ${r.slPct != null && r.slPct >= 1 ? "text-green-600" : r.slPct != null && r.slPct < 0.8 ? "text-red-500" : ""}`}>
                      {fmtPct(r.slPct)}
                    </td>
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
