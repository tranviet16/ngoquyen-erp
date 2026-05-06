import { getTienDoXdReport, getAvailableMonths } from "@/lib/sl-dt/report-service";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

const STATUS_COLS = [
  { key: "khungBtct" as const, label: "Khung BTCT" },
  { key: "xayTuong" as const, label: "Xây tường" },
  { key: "tratNgoai" as const, label: "Trát ngoài" },
  { key: "xayTho" as const, label: "Xây thô" },
  { key: "tratHoanThien" as const, label: "Trát HT" },
  { key: "hoSoQuyetToan" as const, label: "Hồ sơ QT" },
];

export default async function TienDoXdPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const [rows, availableMonths] = await Promise.all([
    getTienDoXdReport(year, month),
    getAvailableMonths(),
  ]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  let stt = 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tiến độ Xây dựng</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — Read-only, nguồn từ bảng Chỉ tiêu</p>
      </div>

      <form className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Năm</label>
          <select name="year" defaultValue={year} className="border rounded px-2 py-1.5 text-sm">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tháng</label>
          <select name="month" defaultValue={month} className="border rounded px-2 py-1.5 text-sm">
            {monthOptions.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">Xem</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th className="p-2 text-center w-10">STT</th>
              <th className="p-2 text-left min-w-[180px]">Lô</th>
              <th className="p-2 text-left min-w-[100px]">Giai đoạn</th>
              <th className="p-2 text-left min-w-[180px]">Tiến độ hiện tại</th>
              <th className="p-2 text-left min-w-[120px]">Trạng thái QT</th>
              {STATUS_COLS.map((c) => (
                <th key={c.key} className="p-2 text-left min-w-[120px]">{c.label}</th>
              ))}
              <th className="p-2 text-left min-w-[150px]">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              stt++;
              return (
                <tr key={r.lotId} className="border-b hover:bg-muted/10">
                  <td className="p-2 text-center">{stt}</td>
                  <td className="p-2 font-medium">{r.lotName}</td>
                  <td className="p-2 text-muted-foreground">{r.phaseCode}</td>
                  <td className="p-2">{r.milestoneText ?? "—"}</td>
                  <td className="p-2">{r.settlementStatus ?? "—"}</td>
                  {STATUS_COLS.map((c) => (
                    <td key={c.key} className="p-2">{r[c.key] ?? "—"}</td>
                  ))}
                  <td className="p-2 text-muted-foreground">{r.ghiChu ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu cho tháng {month}/{year}.</div>
        )}
      </div>
    </div>
  );
}
