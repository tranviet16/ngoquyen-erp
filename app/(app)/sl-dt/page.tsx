import { prisma } from "@/lib/prisma";
import { getSlDtSummary } from "@/lib/sl-dt/report-service";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function SlDtPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();

  const [summaryRows, projects] = await Promise.all([
    getSlDtSummary(year),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  const fmtVnd = (v: { toString(): string }) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(
      parseFloat(v.toString())
    );
  const fmtPct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sản lượng – Doanh thu</h1>
          <p className="text-sm text-muted-foreground">Tổng hợp chỉ tiêu & thực hiện năm {year}</p>
        </div>
        <div className="flex gap-2 text-sm">
          {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
            <Link
              key={y}
              href={`/sl-dt?year=${y}`}
              className={`px-3 py-1 rounded border ${y === year ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        {[
          { href: "/sl-dt/chi-tieu", label: "Chỉ tiêu" },
          { href: "/sl-dt/bao-cao-sl", label: "Báo cáo SL" },
          { href: "/sl-dt/bao-cao-dt", label: "Báo cáo DT" },
          { href: "/sl-dt/tien-do-nop-tien", label: "Tiến độ nộp tiền" },
          { href: "/sl-dt/tien-do-xd", label: "Tiến độ XD" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-1.5 rounded border hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
      </div>

      {summaryRows.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Chưa có chỉ tiêu cho năm {year}. Vào <Link href="/sl-dt/chi-tieu" className="underline">Chỉ tiêu</Link> để nhập.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Dự án</th>
                <th className="text-right p-2">SL Kế hoạch</th>
                <th className="text-right p-2">SL Thực hiện</th>
                <th className="text-right p-2">% SL</th>
                <th className="text-right p-2">DT Kế hoạch</th>
                <th className="text-right p-2">DT Thực hiện</th>
                <th className="text-right p-2">% DT</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r) => {
                const proj = projectMap[r.projectId];
                return (
                  <tr key={r.projectId} className="border-b hover:bg-muted/20">
                    <td className="p-2">{proj ? `[${proj.code}] ${proj.name}` : `#${r.projectId}`}</td>
                    <td className="p-2 text-right">{fmtVnd(r.slTarget)}</td>
                    <td className="p-2 text-right">{fmtVnd(r.slActual)}</td>
                    <td className={`p-2 text-right font-medium ${r.slPct != null && r.slPct >= 1 ? "text-green-600" : r.slPct != null && r.slPct < 0.8 ? "text-red-500" : ""}`}>
                      {fmtPct(r.slPct)}
                    </td>
                    <td className="p-2 text-right">{fmtVnd(r.dtTarget)}</td>
                    <td className="p-2 text-right">{fmtVnd(r.dtActual)}</td>
                    <td className={`p-2 text-right font-medium ${r.dtPct != null && r.dtPct >= 1 ? "text-green-600" : r.dtPct != null && r.dtPct < 0.8 ? "text-red-500" : ""}`}>
                      {fmtPct(r.dtPct)}
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
