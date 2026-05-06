import { getAvailableMonths } from "@/lib/sl-dt/report-service";
import Link from "next/link";

export default async function SlDtPage() {
  const months = await getAvailableMonths();
  const latest = months[0];

  const navItems = [
    { href: "/sl-dt/bao-cao-sl", label: "Báo cáo Sản lượng", desc: "11 cột SL theo lô" },
    { href: "/sl-dt/bao-cao-dt", label: "Báo cáo Doanh thu", desc: "13 cột DT theo lô" },
    { href: "/sl-dt/chi-tieu", label: "Chỉ tiêu", desc: "Tiến độ + phải nộp tiền" },
    { href: "/sl-dt/tien-do-xd", label: "Tiến độ XD", desc: "Ma trận trạng thái xây dựng" },
    { href: "/sl-dt/tien-do-nop-tien", label: "Tiến độ Nộp tiền", desc: "Kế hoạch 4 đợt per lô" },
    { href: "/sl-dt/cau-hinh", label: "Cấu hình mốc", desc: "Quản lý bảng điểm mốc" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sản lượng — Doanh thu</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý báo cáo SL/DT theo lô xây dựng
          {latest ? ` — Dữ liệu mới nhất: T${latest.month}/${latest.year}` : " — Chưa có dữ liệu"}
        </p>
      </div>

      {latest && (
        <div className="flex gap-2 text-sm">
          <Link
            href={`/sl-dt/bao-cao-sl?year=${latest.year}&month=${latest.month}`}
            className="px-3 py-1.5 rounded border bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Xem SL T{latest.month}/{latest.year}
          </Link>
          <Link
            href={`/sl-dt/bao-cao-dt?year=${latest.year}&month=${latest.month}`}
            className="px-3 py-1.5 rounded border hover:bg-muted"
          >
            Xem DT T{latest.month}/{latest.year}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="font-semibold">{item.label}</div>
            <div className="text-sm text-muted-foreground mt-1">{item.desc}</div>
          </Link>
        ))}
      </div>

      {months.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Tháng có dữ liệu</div>
          <div className="flex flex-wrap gap-2">
            {months.slice(0, 24).map((m) => (
              <Link
                key={`${m.year}-${m.month}`}
                href={`/sl-dt/bao-cao-sl?year=${m.year}&month=${m.month}`}
                className="px-2 py-1 text-xs border rounded hover:bg-muted"
              >
                T{m.month}/{m.year}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
