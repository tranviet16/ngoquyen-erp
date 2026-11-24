"use client";

/**
 * Màn DT-TT (client, chỉ trên màn hình — bản in vẫn là `DtTtView` nguyên vẹn, cùng `DtTtReport` / `PhanIIIReport`):
 *   - thanh nhảy dính "Phần I · II · III" (neo `#phan-i`, `#phan-ii`, `#phan-iii` — Tổng quan link tới đây);
 *   - Phần I: mỗi nhóm vật tư chính một dòng tổng, bấm để mở dòng dự toán; mở sẵn nhóm có dòng lệch đối soát;
 *   - Phần II: mỗi đầu mối mang neo `#dm-{id}` (dòng "đầu mối cần chú ý" của Tổng quan), "chưa chốt" link tới lọc
 *     chưa chốt của Đầu mối; thực tế nhập chưa gắn đầu mối link tới Thực tế nhập lọc "không đầu mối";
 *   - Phần III: chênh bằng `phanIIIDiff` (cùng phép tính bản in); dự toán chưa có loại link tới Dự toán `loai=thieu`.
 * Hook đo: `data-dt-tt-screen` (+ `data-phan-ii-rows`), `data-dt-tt-jump`, `data-dt-tt-group` (+ `data-open`),
 * `data-dt-tt-counterparty`.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DtTtReport, PhanIGroup, PhanIIRow } from "@/lib/du-an/dt-hd-tt/dt-tt-report";
import { phanIIIDiff } from "@/lib/du-an/dt-hd-tt/overview";
import type { PhanIIIReport } from "@/lib/du-an/dt-hd-tt/phan-iii";
import {
  dauMoiQuery, DT_TT_ANCHORS, dtTtCounterpartyAnchor, DU_TOAN_KINDLESS, duToanQuery, NONE_FILTER_VALUE, screenHref, thucTeNhapQuery, UNSETTLED_ACTUAL,
} from "@/lib/du-an/dt-hd-tt/screen-links";
import { cn } from "@/lib/utils";
import { BrokenTieOut } from "./dt-hd-screen-block";
import { money, moneyOrZero, pct, qty, ReportTable, TD, TD_NUM, TH } from "./report-bits";

const JUMPS = [
  { anchor: DT_TT_ANCHORS.phanI, label: "Phần I", title: "Vật tư chính" },
  { anchor: DT_TT_ANCHORS.phanII, label: "Phần II", title: "Theo đầu mối" },
  { anchor: DT_TT_ANCHORS.phanIII, label: "Phần III", title: "Tổng hợp theo cấp chi phí" },
] as const;
/** Chừa chỗ cho thanh nhảy dính khi nhảy tới neo. */
const SECTION = "scroll-mt-14 space-y-1";
const LINK = "underline underline-offset-2 hover:text-foreground";
const PHAN_I_HEAD = ["Vật tư", "ĐVT", "KL dự toán", "KL thực nhận", "Đơn giá DT", "Đơn giá TT (chưa VAT)", "Giá trị DT", "Giá trị TT (chưa VAT)", "Chênh DT − TT", "Do KL", "Do đơn giá"];
const checkLabelOf = (rowLabel: string) => `Phần I ${rowLabel}: do KL + do đơn giá = chênh`;
const negative = (v: number | null) => v !== null && Math.round(v) < 0;

function PhanIGroupRows({ g, open, onToggle }: { g: PhanIGroup; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="bg-muted/30 font-medium" data-dt-tt-group={g.groupCodeId} data-open={open ? "true" : "false"}>
        <td className={TD} colSpan={6}>
          <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex items-center gap-1 text-left hover:underline">
            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden="true" />
            {`${g.code} — ${g.name}`}
            <span className="font-normal text-muted-foreground">({g.rows.length} dòng)</span>
          </button>
        </td>
        <td className={TD_NUM}>{moneyOrZero(g.valueDt)}</td>
        <td className={TD_NUM}>{moneyOrZero(g.valueTtExVat)}</td>
        <td className={cn(TD_NUM, negative(g.diff) && "text-red-700 dark:text-red-300")}>{moneyOrZero(g.diff)}</td>
        <td className={TD} colSpan={2} />
      </tr>
      {open && g.rows.map((r, i) => (
        <tr key={`${g.groupCodeId}-${i}`} className={r.groupOnly ? "text-muted-foreground" : undefined}>
          <td className={`${TD} ${r.groupOnly ? "pl-8" : "pl-6"}`}>{r.label}</td>
          <td className={TD}>{r.unit}</td>
          <td className={TD_NUM}>{qty(r.qtyDt)}</td>
          <td className={TD_NUM}>{r.qtyTt === null && !r.groupOnly ? <span className="text-amber-700 dark:text-amber-300">thiếu hệ số</span> : qty(r.qtyTt)}</td>
          <td className={TD_NUM}>{money(r.priceDt)}</td>
          <td className={TD_NUM}>{money(r.priceTt)}</td>
          <td className={TD_NUM}>{money(r.valueDt)}</td>
          <td className={TD_NUM}>{money(r.valueTtExVat)}</td>
          <td className={cn(TD_NUM, negative(r.diff) && "text-red-700 dark:text-red-300")}>{moneyOrZero(r.diff)}</td>
          <td className={TD_NUM}>{money(r.diffByQty)}</td>
          <td className={TD_NUM}>{money(r.diffByPrice)}</td>
        </tr>
      ))}
    </>
  );
}

function PhanI({ report }: { report: DtTtReport }) {
  const broken = report.checks.filter((c) => !c.ok);
  const brokenLabels = new Set(broken.map((c) => c.label));
  // Mặc định: chỉ mở nhóm có dòng lệch đối soát; người dùng bấm để đổi.
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () => new Set(report.phanI.filter((g) => g.rows.some((r) => brokenLabels.has(checkLabelOf(r.label)))).map((g) => g.groupCodeId)),
  );
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOpen = report.phanI.length > 0 && report.phanI.every((g) => open.has(g.groupCodeId));
  return (
    <section id={DT_TT_ANCHORS.phanI} className={SECTION}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Phần I. Vật tư chính — dự toán và thực tế</h3>
        {report.phanI.length > 0 && (
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(report.phanI.map((g) => g.groupCodeId)))} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {allOpen ? "Thu gọn tất cả" : "Mở tất cả"}
          </button>
        )}
      </div>
      {report.phanI.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có mã nhóm nào đánh dấu là vật tư chính.</p>
      ) : (
        <ReportTable head={<tr>{PHAN_I_HEAD.map((h) => <th key={h} className={TH}>{h}</th>)}</tr>}>
          {report.phanI.map((g) => <PhanIGroupRows key={g.groupCodeId} g={g} open={open.has(g.groupCodeId)} onToggle={() => toggle(g.groupCodeId)} />)}
        </ReportTable>
      )}
      {report.checks.length > 0 && broken.length === 0 ? (
        <p className="text-xs text-muted-foreground">Kiểm tổng khớp — do KL + do đơn giá = chênh ở cả {report.checks.length} dòng</p>
      ) : (
        broken.map((c) => <BrokenTieOut key={c.label} t={c} />)
      )}
    </section>
  );
}

function PhanIIRows({ projectId, title, rows, total, note }: { projectId: number; title: string; rows: PhanIIRow[]; total: number; note?: string }) {
  const unsettledHref = screenHref(projectId, "dau-moi", { query: dauMoiQuery({ actual: UNSETTLED_ACTUAL }) });
  return (
    <>
      <tr className="bg-muted/30 font-medium">
        <td className={TD} colSpan={5}>{title}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.counterpartyId} id={dtTtCounterpartyAnchor(r.counterpartyId)} className="scroll-mt-16 target:bg-amber-50 dark:target:bg-amber-500/10" data-dt-tt-counterparty={r.counterpartyId}>
          <td className={`${TD} pl-4`}>{r.name}</td>
          <td className={TD_NUM}>{money(r.dtExVat)}</td>
          <td className={TD_NUM}>{money(r.dtInclVat)}</td>
          <td className={TD_NUM}>
            {r.actual === null ? <Link href={unsettledHref} className="text-amber-700 hover:underline dark:text-amber-300">chưa chốt</Link> : moneyOrZero(r.actual)}
          </td>
          <td className={cn(TD_NUM, negative(r.diff) && "text-red-700 dark:text-red-300")}>{r.diff === null ? "" : moneyOrZero(r.diff)}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className={TD}>{`Cộng ${title.split(".")[0]}${note ? ` (${note})` : ""}`}</td>
        <td className={TD_NUM} colSpan={2} />
        <td className={TD_NUM}>{moneyOrZero(total)}</td>
        <td className={TD_NUM} />
      </tr>
    </>
  );
}

function PhanII({ projectId, report }: { projectId: number; report: DtTtReport }) {
  const p = report.phanII;
  const head = <tr>{["Đầu mối", "Dự toán chưa VAT", "Dự toán gồm VAT", "Thực tế gồm VAT", "Chênh DT − TT"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>;
  return (
    <section id={DT_TT_ANCHORS.phanII} className={SECTION}>
      <h3 className="text-sm font-semibold">Phần II. Theo đầu mối</h3>
      <ReportTable head={head}>
        <PhanIIRows projectId={projectId} title="A. Nhà cung cấp" rows={p.a} total={p.totalA} />
        <PhanIIRows projectId={projectId} title="B. Tổ nhân công" rows={p.b} total={p.totalB} />
        <tr className="font-semibold">
          <td className={TD}>TỔNG A + B</td>
          <td className={TD_NUM} colSpan={2} />
          <td className={TD_NUM}>{moneyOrZero(p.totalAB)}</td>
          <td className={TD_NUM} />
        </tr>
        <PhanIIRows projectId={projectId} title="C. Khoản khác" rows={p.c} total={p.totalC} note="ngoài tổng A + B" />
      </ReportTable>
      {Math.round(report.untaggedReceipts) !== 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-300" data-dt-tt-warning="untagged">
          Thực tế nhập chưa gắn đầu mối: {moneyOrZero(report.untaggedReceipts)} (không cộng vào đầu mối nào).{" "}
          <Link href={screenHref(projectId, "thuc-te-nhap", { query: thucTeNhapQuery({ counterpartyId: NONE_FILTER_VALUE }) })} className={LINK}>Gắn đầu mối ở Thực tế nhập</Link>
        </p>
      )}
    </section>
  );
}

function PhanIII({ projectId, report }: { projectId: number; report: PhanIIIReport }) {
  const strong = new Set(["direct", "indirect", "beforeTax", "total"]);
  const head = <tr>{["Khoản mục chi phí", "Tỷ lệ", "Dự toán", "Thực tế", "Chênh DT − TT"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>;
  return (
    <section id={DT_TT_ANCHORS.phanIII} className={SECTION}>
      <h3 className="text-sm font-semibold">Phần III. Tổng hợp theo cấp chi phí</h3>
      <ReportTable head={head}>
        {report.rows.map((r) => {
          const diff = phanIIIDiff(r);
          return (
            <tr key={r.key} className={strong.has(r.key) ? "font-semibold" : undefined}>
              <td className={TD}>{r.label}</td>
              <td className={TD_NUM}>{pct(r.rate)}</td>
              <td className={TD_NUM}>{moneyOrZero(r.estimate)}</td>
              <td className={TD_NUM}>{r.actual === null ? "" : moneyOrZero(r.actual)}</td>
              <td className={cn(TD_NUM, negative(diff) && "text-red-700 dark:text-red-300")}>{diff === null ? "" : moneyOrZero(diff)}</td>
            </tr>
          );
        })}
      </ReportTable>
      {Math.round(report.dtWithoutKind) !== 0 && (
        <p className="text-xs font-medium text-red-700 dark:text-red-300" data-dt-tt-warning="kindless">
          Có {moneyOrZero(report.dtWithoutKind)} dự toán chưa xác định loại VL / NC / MTC — chi phí trực tiếp đang thiếu khoản này.{" "}
          <Link href={screenHref(projectId, "du-toan", { query: duToanQuery({ loai: DU_TOAN_KINDLESS }) })} className={LINK}>Xem ở Dự toán</Link>
        </p>
      )}
    </section>
  );
}

export function DtTtScreen({ projectId, report, phanIII }: { projectId: number; report: DtTtReport; phanIII: PhanIIIReport }) {
  const p = report.phanII;
  return (
    <div className="space-y-6" data-dt-tt-screen="" data-phan-ii-rows={p.a.length + p.b.length + p.c.length}>
      <nav aria-label="Các phần của DT-TT" className="sticky top-0 z-30 flex items-center gap-1 border-b bg-background/95 py-1.5 text-sm backdrop-blur" data-dt-tt-jump="">
        <span className="pr-1 text-xs text-muted-foreground">Đến</span>
        {JUMPS.map((j, i) => (
          <span key={j.anchor} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
            <a href={`#${j.anchor}`} title={j.title} className="rounded px-2 py-0.5 font-medium hover:bg-muted">{j.label}</a>
          </span>
        ))}
      </nav>
      <PhanI report={report} />
      <PhanII projectId={projectId} report={report} />
      <PhanIII projectId={projectId} report={phanIII} />
    </div>
  );
}
