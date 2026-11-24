/**
 * Trang Tổng quan của Đối chiếu DT-HĐ-TT (Server Component, chỉ trình bày mô hình của `buildOverview`):
 *   1. Số chính — thẻ `StatCard` (dùng chung với Dashboard), mỗi số là một ô báo cáo có nhãn cơ sở VAT,
 *      định dạng bằng `moneyOrZero` như bản in, bấm vào mở nơi số đó nằm;
 *   2. Đầu mối vượt dự toán (Phần II A + B, chênh < 0) — 5 dòng, "xem thêm" tới 10;
 *   3. Việc cần làm và 4. Kiểm tổng (tong-quan-todos.tsx);
 *   5. Lối tắt Mở / Xuất Excel ba báo cáo (không tự in).
 * Hook cho lệnh đo `todos`: `data-tong-quan`, `data-figure` + `data-value` (số đã làm tròn đồng),
 * `data-over-budget`, `data-todo` + `data-todo-count`.
 */

import Link from "next/link";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { StatCard, type StatCardTone } from "@/components/du-an/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { OVER_BUDGET_SHOWN, type FigureId, type OverBudget, type OverBudgetRow, type Overview, type OverviewFigure } from "@/lib/du-an/dt-hd-tt/overview";
import { linkHref } from "@/lib/du-an/dt-hd-tt/overview-todos";
import { COUNTERPARTY_KIND_LABEL } from "@/lib/du-an/dt-hd-tt/register-ui";
import { screenHref } from "@/lib/du-an/dt-hd-tt/screen-links";
import { CollapsibleSection, money, moneyOrZero, reportExportHref, TD, TD_NUM, TH, type ReportKey } from "./report-bits";
import { TongQuanChecks, TongQuanTodos } from "./tong-quan-todos";

const FIGURE_GROUPS: { title: string; note: string; ids: FigureId[] }[] = [
  { title: "Dự toán – thực tế", note: "DT-TT Phần III, dòng Gxd (sau thuế)", ids: ["gxd-estimate", "gxd-actual", "gxd-diff"] },
  { title: "Hóa đơn – thực tế", note: "HĐ-TT tổng cộng (gồm VAT)", ids: ["sigma-e", "sigma-t", "sigma-u"] },
  { title: "Thanh toán", note: "HĐ-TT tổng cộng (gồm VAT)", ids: ["sigma-i", "sigma-v", "sigma-y"] },
];

const REPORTS: { key: ReportKey; label: string; title: string }[] = [
  { key: "dt-hd", label: "DT-HĐ", title: "Dự toán – hóa đơn" },
  { key: "dt-tt", label: "DT-TT", title: "Dự toán – thực tế" },
  { key: "hd-tt", label: "HĐ-TT", title: "Hóa đơn – thực tế" },
];

const LINK = "inline-flex items-center gap-0.5 text-primary hover:underline";

/** Giá trị của hook `data-value`: số đã làm tròn đồng, trống khi ô báo cáo trống. */
export const figureDataValue = (value: number | null): string => (value === null ? "" : String(Math.round(value)));

/** Sắc thái thẻ: chênh âm = vượt; còn phải lấy HĐ / lấy về dương = cần theo dõi. */
function figureTone(f: OverviewFigure): StatCardTone {
  if (f.value === null) return "default";
  const v = Math.round(f.value);
  if (f.id === "gxd-diff") return v < 0 ? "danger" : "success";
  if ((f.id === "sigma-u" || f.id === "sigma-y") && v > 0) return "warning";
  return "default";
}

function FigureCard({ projectId, figure }: { projectId: number; figure: OverviewFigure }) {
  return (
    <Link
      href={linkHref(projectId, figure.link)}
      data-figure={figure.id}
      data-value={figureDataValue(figure.value)}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:[&>div]:border-primary/60"
    >
      <StatCard label={figure.label} value={figure.value === null ? "—" : moneyOrZero(figure.value)} sub={figure.basis} tone={figureTone(figure)} />
    </Link>
  );
}

function OverBudgetTable({ projectId, rows }: { projectId: number; rows: OverBudgetRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {["Đầu mối", "Loại", "Dự toán gồm VAT", "Thực tế gồm VAT", "Chênh DT − TT"].map((h) => (
              <th key={h} className={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.counterpartyId} data-over-budget={r.counterpartyId} className="bg-red-50/40 dark:bg-red-500/5">
              <td className={TD}>
                <Link href={linkHref(projectId, r.link)} className={LINK}>{r.name}</Link>
              </td>
              <td className={TD}>{COUNTERPARTY_KIND_LABEL[r.kind]}</td>
              {/* Cùng hàm định dạng với ô tương ứng của Phần II trên bản in. */}
              <td className={TD_NUM} data-cell="dtInclVat">{money(r.dtInclVat)}</td>
              <td className={TD_NUM} data-cell="actual">{moneyOrZero(r.actual)}</td>
              <td className={TD_NUM}>
                <span className="inline-flex items-center gap-2">
                  <StatusBadge label="Vượt" tone="danger" />
                  <span data-cell="diff">{moneyOrZero(r.diff)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverBudgetSection({ projectId, overBudget }: { projectId: number; overBudget: OverBudget }) {
  const { rows, count, unsettled } = overBudget;
  return (
    <section className="space-y-2" data-section="dau-moi-vuot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Đầu mối vượt dự toán <span className="font-normal text-muted-foreground">· DT-TT Phần II, A và B (gồm VAT)</span>
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <StatusBadge tone={count > 0 ? "danger" : "success"} label={count > 0 ? `${count} đầu mối vượt` : "Không đầu mối nào vượt"} />
          {unsettled > 0 && (
            <Link href={linkHref(projectId, overBudget.unsettledLink)} className={LINK} data-unsettled={unsettled}>
              {unsettled} đầu mối chưa chốt thực tế
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
          <Link href={linkHref(projectId, overBudget.allLink)} className={LINK}>
            Xem đủ Phần II
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
      {rows.length > 0 && <OverBudgetTable projectId={projectId} rows={rows.slice(0, OVER_BUDGET_SHOWN)} />}
      {rows.length > OVER_BUDGET_SHOWN && (
        <CollapsibleSection title={`Xem thêm ${rows.length - OVER_BUDGET_SHOWN} đầu mối`}>
          <OverBudgetTable projectId={projectId} rows={rows.slice(OVER_BUDGET_SHOWN)} />
        </CollapsibleSection>
      )}
    </section>
  );
}

function ReportShortcuts({ projectId }: { projectId: number }) {
  return (
    <section className="space-y-2" data-section="bao-cao">
      <h3 className="text-sm font-semibold">Báo cáo đầy đủ</h3>
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{r.label}</span> <span className="text-muted-foreground">{r.title}</span>
            </span>
            <Link href={screenHref(projectId, r.key)} className={LINK}>
              Mở
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
            <a href={reportExportHref(projectId, r.key)} className={LINK}>
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              Xuất Excel
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TongQuanView({ projectId, projectLabel, overview }: { projectId: number; projectLabel: string; overview: Overview }) {
  return (
    <div className="space-y-6" data-tong-quan={projectId}>
      <div>
        <h2 className="text-lg font-semibold">Tổng quan đối chiếu DT-HĐ-TT</h2>
        <p className="text-sm text-muted-foreground">{projectLabel}</p>
      </div>

      <section className="space-y-4" data-section="so-chinh">
        {FIGURE_GROUPS.map((g) => (
          <div key={g.title} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {g.title} <span className="font-normal text-muted-foreground">· {g.note}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {g.ids.map((id) => (
                <FigureCard key={id} projectId={projectId} figure={overview.figures[id]} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <OverBudgetSection projectId={projectId} overBudget={overview.overBudget} />
      <TongQuanTodos projectId={projectId} todos={overview.todos} />
      <TongQuanChecks projectId={projectId} checks={overview.checks} />
      <ReportShortcuts projectId={projectId} />
    </div>
  );
}
