/**
 * Bảng HĐ-TT của màn hình (phần của hd-tt-screen.tsx). Một hộp cuộn có giới hạn giữ cả ba trục dính:
 *   - đầu bảng hai dòng (nhóm cột, rồi cột) dính trên cùng;
 *   - cột NCC dính trái, tên tối đa 2 dòng (`line-clamp-2`), tên đủ trong `title`;
 *   - dòng tổng ở `tfoot` dính dưới cùng, có nền và z-index riêng (luật chung của app chỉ phủ thead / tbody).
 * Đủ 13 cột tiền theo 4 nhóm; dòng xếp theo đầu mối; dấu "(H)", "(tạm = HĐ)", "(tách)" thành huy hiệu; E và G là
 * link tới sổ Hóa đơn / Chi thực tế lọc theo NCC. Chế độ nhập (chỉ người có quyền `edit`) thêm cột ô nhập H trước I
 * và S trước T, X và Z thành ô nhập — chỉ ở dòng có dòng NCC (`linkId`). Dòng tổng luôn là tổng CẢ BẢNG.
 * Hook đo: `data-hd-tt-box`, `data-hd-tt-head`, `data-money-col`, `data-edit-col`, `data-ncc-cell`, `data-ncc-name`,
 * `data-hd-tt-group`, `data-hd-tt-row`, `data-hd-tt-total`.
 */

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { HdTtReport } from "@/lib/du-an/dt-hd-tt/hd-tt-report";
import {
  draftKey, EDIT_COLUMN_BEFORE, EDIT_FIELD_LABELS, HD_TT_COLUMN_GROUPS, HD_TT_SCREEN_LABELS, SPLIT_BLOCK_TITLES, splitBlock, storedText,
  type Drafts, type HdTtEditField, type HdTtMoneyKey, type HdTtScreenGroup, type HdTtScreenRow,
} from "@/lib/du-an/dt-hd-tt/hd-tt-screen-model";
import { chiThucTeQuery, DAU_MOI_ANCHORS, dauMoiQuery, hoaDonQuery, screenHref, UNSETTLED_ACTUAL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { cn } from "@/lib/utils";
import { HdTtEditCell, type CommitMove } from "./hd-tt-edit-cell";
import { money, moneyOrZero, pct } from "./report-bits";

/** Nháp và thao tác của chế độ nhập, do màn cha giữ. */
export interface HdTtEditController {
  drafts: Drafts;
  saving: ReadonlySet<string>;
  change: (key: string, text: string) => void;
  commit: (row: HdTtScreenRow, field: HdTtEditField, text: string, move: CommitMove) => void;
  revert: (key: string) => void;
  register: (key: string, el: HTMLInputElement | null) => void;
}

export interface HdTtScreenTableProps {
  projectId: number;
  groups: readonly HdTtScreenGroup[];
  totals: HdTtReport["totals"];
  /** Đang lọc: dòng tổng ghi "Tổng cộng (cả bảng)". */
  filtering: boolean;
  /** Có = chế độ nhập H / S / X / Z. */
  edit?: HdTtEditController | null;
}

const CELL = "border-b border-r px-2 py-1 align-top";
const NUM = `${CELL} text-right tabular-nums whitespace-nowrap`;
const HEAD = "border-b border-r bg-muted px-2 py-1 font-medium align-bottom";
const BADGE = "ml-1 gap-1 px-1.5 py-0 text-[10px] leading-4";
const LINK = "text-primary underline-offset-2 hover:underline";
const EDIT_HEAD: Record<"H" | "S", { label: string; tip: string }> = {
  H: { label: "Nhập H", tip: "H thực nộp rà soát — để trống thì I theo sổ chi (G)" },
  S: { label: "Nhập S", tip: "S thực tế riêng NCC — chỉ nhập ở NCC sau của đầu mối nhiều NCC đã chốt thực tế" },
};

function Badge({ label, tone, title }: { label: string; tone: StatusTone; title: string }) {
  return (
    <span title={title}>
      <StatusBadge label={label} tone={tone} className={BADGE} />
    </span>
  );
}

function MoneyValue({ projectId, row, k }: { projectId: number; row: HdTtScreenRow; k: HdTtMoneyKey }): ReactNode {
  const linked = (text: string, href: string, title: string) => (text === "" ? "" : <Link href={href} className={LINK} title={title}>{text}</Link>);
  switch (k) {
    case "invoiceTotal":
      return linked(money(row.invoiceTotal), screenHref(projectId, "hoa-don", { query: hoaDonQuery({ supplierId: row.supplierId }) }), "Xem các hóa đơn của NCC");
    case "paidBook":
      return linked(money(row.paidBook), screenHref(projectId, "chi-thuc-te", { query: chiThucTeQuery({ supplierId: row.supplierId }) }), "Xem sổ chi của NCC");
    case "paid":
      return <>{money(row.paid)}{row.paidOverride !== null && <Badge label="H" tone="info" title="I theo thực nộp rà soát (H) nhập tay" />}</>;
    case "actual":
      return (
        <>
          {moneyOrZero(row.actual)}
          {row.actualIsTemporary
            ? <Badge label="tạm = HĐ" tone="warning" title="Đầu mối chưa chốt thực tế — T tạm lấy bằng E" />
            : row.split !== null && <Badge label="tách" tone="neutral" title="T theo S (thực tế riêng NCC) nhập tay" />}
        </>
      );
    case "actualMinusInvoice":
    case "debt":
      return moneyOrZero(row[k]);
    case "recovered":
      return money(row.recovered);
    default:
      return money(row[k]);
  }
}

function EditInput({ edit, row, field }: { edit: HdTtEditController; row: HdTtScreenRow; field: HdTtEditField }) {
  if (row.linkId === null) return null;
  const key = draftKey(row.linkId, field);
  const draft = edit.drafts[key];
  const block = field === "S" ? splitBlock(row) : null;
  return (
    <HdTtEditCell
      cellKey={key}
      kind={field === "Z" ? "text" : "money"}
      value={draft?.text ?? storedText(row, field)}
      label={`${EDIT_FIELD_LABELS[field]} — ${row.supplierName}`}
      error={draft?.error ?? null}
      saving={edit.saving.has(key)}
      disabledReason={block ? SPLIT_BLOCK_TITLES[block] : null}
      onChange={(text) => edit.change(key, text)}
      onCommit={(text, move) => edit.commit(row, field, text, move)}
      onRevert={() => edit.revert(key)}
      inputRef={(el) => edit.register(key, el)}
    />
  );
}

function GroupRow({ projectId, g, span }: { projectId: number; g: HdTtScreenGroup; span: number }) {
  const first = g.rows[0];
  const unsettled = g.key !== "none" && first !== undefined && !first.counterpartySettled;
  return (
    <tr className="bg-muted/30" data-hd-tt-group={String(g.key)}>
      <td className={cn(CELL, "sticky left-0 z-10 bg-card font-semibold")}>{g.name}</td>
      <td className={cn(CELL, "text-muted-foreground")} colSpan={span}>
        {g.key === "none" ? "NCC chưa gắn đầu mối — T = 0" : `${first?.siblingCount ?? 0} NCC`}
        {unsettled && (
          <>
            {" · "}
            <Link href={screenHref(projectId, "dau-moi", { query: dauMoiQuery({ actual: UNSETTLED_ACTUAL }) })} className="text-amber-700 hover:underline dark:text-amber-300">
              chưa chốt thực tế
            </Link>
          </>
        )}
      </td>
    </tr>
  );
}

function SupplierRow({ projectId, row, edit }: { projectId: number; row: HdTtScreenRow; edit: HdTtEditController | null }) {
  const addLink = <Link href={screenHref(projectId, "dau-moi", { hash: DAU_MOI_ANCHORS.ncc })} className="text-amber-700 hover:underline dark:text-amber-300">Thêm dòng NCC ở Đầu mối</Link>;
  const input = (field: HdTtEditField) => (edit ? <EditInput edit={edit} row={row} field={field} /> : null);
  const linked = edit !== null && row.linkId !== null;
  return (
    <tr data-hd-tt-row={row.supplierId} data-link-id={row.linkId ?? ""} className="hover:bg-muted/20">
      <td className={cn(CELL, "sticky left-0 z-10 bg-card")} data-ncc-cell="">
        <div className="line-clamp-2 w-48 whitespace-normal break-words" title={row.supplierName} data-ncc-name="">{row.supplierName}</div>
      </td>
      {HD_TT_COLUMN_GROUPS.flatMap((g) => g.keys).map((k) => {
        const before = EDIT_COLUMN_BEFORE[k];
        return (
          <Fragment key={k}>
            {edit && before && <td className={NUM}>{row.linkId === null ? (before === "H" ? addLink : null) : input(before)}</td>}
            <td className={NUM}>{k === "recovered" && linked ? input("X") : <MoneyValue projectId={projectId} row={row} k={k} />}</td>
          </Fragment>
        );
      })}
      <td className={NUM}>{pct(row.paidRatio)}</td>
      <td className={cn(CELL, "min-w-48 whitespace-normal")}>{linked ? input("Z") : (row.todo ?? "")}</td>
    </tr>
  );
}

export function HdTtScreenTable({ projectId, groups, totals, filtering, edit = null }: HdTtScreenTableProps) {
  const editCols = edit ? Object.keys(EDIT_COLUMN_BEFORE).length : 0;
  const columns = 1 + HD_TT_COLUMN_GROUPS.reduce((n, g) => n + g.keys.length, 0) + editCols + 2;
  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border-l border-t" data-hd-tt-box="">
      <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-20" data-hd-tt-head="">
          <tr>
            <th rowSpan={2} className={cn(HEAD, "sticky left-0 z-40 text-left")}>Nhà cung cấp</th>
            {HD_TT_COLUMN_GROUPS.map((g) => (
              <th key={g.id} colSpan={g.keys.length + (edit ? g.keys.filter((k) => EDIT_COLUMN_BEFORE[k]).length : 0)} className={cn(HEAD, "text-center")} data-col-group={g.id}>
                {g.label}
              </th>
            ))}
            <th rowSpan={2} className={cn(HEAD, "text-right")} title="L = I / E">Đã trả / HĐ <span className="font-normal text-muted-foreground">· L</span></th>
            <th rowSpan={2} className={cn(HEAD, "text-left")} title="Z nhập tay">Việc cần làm <span className="font-normal text-muted-foreground">· Z</span></th>
          </tr>
          <tr>
            {HD_TT_COLUMN_GROUPS.flatMap((g) => g.keys).map((k) => {
              const before = EDIT_COLUMN_BEFORE[k];
              const { label, code, tip } = HD_TT_SCREEN_LABELS[k];
              return (
                <Fragment key={k}>
                  {edit && before && <th className={cn(HEAD, "min-w-28 text-right")} title={EDIT_HEAD[before].tip} data-edit-col={before}>{EDIT_HEAD[before].label}</th>}
                  <th className={cn(HEAD, "min-w-24 text-right")} title={tip} data-money-col={k}>
                    {label}
                    {code && <span className="font-normal text-muted-foreground"> · {code}</span>}
                  </th>
                </Fragment>
              );
            })}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={String(g.key)}>
            <GroupRow projectId={projectId} g={g} span={columns - 1} />
            {g.rows.map((r) => <SupplierRow key={r.supplierId} projectId={projectId} row={r} edit={edit} />)}
          </tbody>
        ))}
        {groups.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={columns} className={cn(CELL, "py-6 text-center text-muted-foreground")}>Không có NCC nào khớp bộ lọc.</td>
            </tr>
          </tbody>
        )}
        <tfoot className="sticky bottom-0 z-20 bg-muted font-semibold" data-hd-tt-total="">
          <tr>
            <td className={cn(CELL, "sticky left-0 z-30 border-t bg-muted")}>{filtering ? "Tổng cộng (cả bảng)" : "TỔNG CỘNG"}</td>
            {HD_TT_COLUMN_GROUPS.flatMap((g) => g.keys).map((k) => (
              <Fragment key={k}>
                {edit && EDIT_COLUMN_BEFORE[k] && <td className={cn(NUM, "border-t bg-muted")} />}
                <td className={cn(NUM, "border-t bg-muted")}>{moneyOrZero(totals[k])}</td>
              </Fragment>
            ))}
            <td className={cn(NUM, "border-t bg-muted")}>{totals.invoiceTotal === 0 ? "" : pct(totals.paid / totals.invoiceTotal)}</td>
            <td className={cn(CELL, "border-t bg-muted")} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
