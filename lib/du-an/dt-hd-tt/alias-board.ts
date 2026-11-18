/**
 * Bảng của màn Ánh xạ: mỗi khóa tên|ĐVT khác nhau của một nguồn (dòng dự toán / hóa đơn / thực tế
 * nhập) là một dòng, LEFT JOIN alias của nguồn đó, kèm số dòng, Σ tiền và NCC / đầu mối. Khóa chưa có
 * alias = "chưa gán" và xếp đầu; alias không còn dòng nguồn nào = alias mồ côi (liệt kê riêng).
 * Module thuần — service đọc DB rồi gọi `buildAliasBoard`.
 */

import type { CostKind } from "./keys";
import type { AliasStatus } from "./report-inputs";
import type { AliasSource } from "./register-ui";

/** Alias đang có của một khóa (dữ liệu cho client). */
export interface AliasView {
  id: number;
  /** Ở bảng Ánh xạ: Mã nhóm hiệu lực (alias hd / tt gán vào Dòng DT → nhóm hiện tại của dòng DT). */
  groupCodeId: number | null;
  dtKey: string | null;
  factor: number | null;
  kind: CostKind | null;
  status: AliasStatus;
  note: string | null;
}

export interface AliasKeyRow {
  source: AliasSource;
  itemKey: string;
  itemName: string;
  unit: string;
  /** Số dòng nguồn mang khóa này (dòng dự toán ERP / dòng hóa đơn / dòng thực tế nhập). */
  lineCount: number;
  /** DT: giá trị dự toán; HĐ: thành tiền chưa VAT; TT: thành tiền gồm VAT. */
  amount: number;
  /** HĐ: NCC; TT: đầu mối; DT: NCC phụ trách của Mã nhóm. */
  parties: string;
  /** Loại của dòng dự toán theo hạng mục (chỉ DT). */
  lineKind: CostKind | null;
  alias: AliasView | null;
}

export interface OrphanAlias extends AliasView {
  source: AliasSource;
  itemKey: string;
  itemName: string;
  unit: string;
}

export interface DtLineOption {
  key: string;
  label: string;
  kind: CostKind;
  /** Mã nhóm của dòng DT (từ alias dt) — để lọc Dòng DT theo nhóm. */
  groupCodeId: number | null;
}

export interface GroupOption {
  id: number;
  code: string;
  name: string;
}

export interface AliasBoard {
  tabs: Record<AliasSource, AliasKeyRow[]>;
  orphans: OrphanAlias[];
  dtLines: DtLineOption[];
  groups: GroupOption[];
}

export interface BoardAlias extends AliasView {
  source: AliasSource;
  itemKey: string;
  itemName: string;
  unit: string;
}

export interface BoardSourceLine {
  itemKey: string;
  itemName: string;
  unit: string;
  amount: number;
  party: string | null;
}

export interface BoardInput {
  dtLines: { key: string; kind: CostKind; itemName: string; unit: string; value: number; lineCount: number }[];
  invoiceLines: BoardSourceLine[];
  receipts: BoardSourceLine[];
  aliases: BoardAlias[];
  groups: (GroupOption & { counterpartyName: string | null })[];
}

const MAX_PARTIES = 3;

function partiesText(names: Iterable<string>): string {
  const list = [...new Set(names)].sort((a, b) => a.localeCompare(b, "vi"));
  if (list.length <= MAX_PARTIES) return list.join(", ");
  return `${list.slice(0, MAX_PARTIES).join(", ")} +${list.length - MAX_PARTIES}`;
}

/** Chưa gán → đề xuất → đã xác nhận / ngoài DT. */
const rank = (row: AliasKeyRow) => (row.alias === null ? 0 : row.alias.status === "de_xuat" ? 1 : 2);

const toView = (a: BoardAlias, groupCodeId: number | null = a.groupCodeId): AliasView => ({
  id: a.id, groupCodeId, dtKey: a.dtKey, factor: a.factor, kind: a.kind, status: a.status, note: a.note,
});

export interface GroupedAlias {
  source: string;
  itemKey: string;
  dtKey: string | null;
  groupCodeId: number | null;
}

/**
 * Mã nhóm HIỆU LỰC của alias, như báo cáo xếp dòng (`buildBookIndex`): alias hd / tt gán vào một Dòng
 * DT còn trong dự toán → nhóm hiện tại của dòng DT (alias dt của nó); còn lại → nhóm đang lưu. Dùng cho
 * bảng Ánh xạ và cho số ánh xạ của Mã nhóm, để bản sao nhóm cũ trên alias hd / tt không làm sai lệch.
 */
export function effectiveGroupResolver(aliases: readonly GroupedAlias[], dtLineKeys: ReadonlySet<string>): (a: GroupedAlias) => number | null {
  const dtGroup = new Map(aliases.filter((a) => a.source === "dt").map((a) => [a.itemKey, a.groupCodeId]));
  return (a) => (a.source !== "dt" && a.dtKey !== null && dtLineKeys.has(a.dtKey) ? dtGroup.get(a.dtKey) ?? null : a.groupCodeId);
}

function sourceRows(
  source: "hd" | "tt",
  lines: BoardSourceLine[],
  aliasOf: (key: string) => BoardAlias | undefined,
  groupOf: (a: GroupedAlias) => number | null,
): AliasKeyRow[] {
  const byKey = new Map<string, { first: BoardSourceLine; count: number; amount: number; parties: string[] }>();
  for (const line of lines) {
    const cur = byKey.get(line.itemKey);
    if (!cur) {
      byKey.set(line.itemKey, { first: line, count: 1, amount: line.amount, parties: line.party ? [line.party] : [] });
      continue;
    }
    cur.count++;
    cur.amount += line.amount;
    if (line.party) cur.parties.push(line.party);
  }
  const rows = [...byKey.entries()].map(([itemKey, g]): AliasKeyRow => {
    const alias = aliasOf(itemKey);
    return {
      source, itemKey, itemName: g.first.itemName, unit: g.first.unit, lineCount: g.count, amount: g.amount,
      parties: partiesText(g.parties), lineKind: null, alias: alias ? toView(alias, groupOf(alias)) : null,
    };
  });
  // Trong cùng nhóm trạng thái: khóa nhiều tiền trước (gán trước khoản lớn).
  return rows.sort((a, b) => rank(a) - rank(b) || b.amount - a.amount);
}

export function buildAliasBoard(input: BoardInput): AliasBoard {
  const aliasByKey = new Map(input.aliases.map((a) => [`${a.source}|${a.itemKey}`, a]));
  const aliasOf = (source: AliasSource) => (key: string) => aliasByKey.get(`${source}|${key}`);
  const ownerOf = new Map(input.groups.map((g) => [g.id, g.counterpartyName]));

  const dtAlias = aliasOf("dt");
  const dtRows = input.dtLines
    .map((line): AliasKeyRow => {
      const alias = dtAlias(line.key);
      const owner = alias?.groupCodeId != null ? ownerOf.get(alias.groupCodeId) ?? null : null;
      return {
        source: "dt", itemKey: line.key, itemName: line.itemName, unit: line.unit, lineCount: line.lineCount, amount: line.value,
        parties: owner ?? "", lineKind: line.kind, alias: alias ? toView(alias) : null,
      };
    })
    .sort((a, b) => rank(a) - rank(b)); // sort ổn định: giữ thứ tự dự toán trong cùng nhóm

  const liveKeys: Record<AliasSource, Set<string>> = {
    dt: new Set(input.dtLines.map((l) => l.key)),
    hd: new Set(input.invoiceLines.map((l) => l.itemKey)),
    tt: new Set(input.receipts.map((l) => l.itemKey)),
  };
  const groupOf = effectiveGroupResolver(input.aliases, liveKeys.dt);

  const tabs: Record<AliasSource, AliasKeyRow[]> = {
    dt: dtRows,
    hd: sourceRows("hd", input.invoiceLines, aliasOf("hd"), groupOf),
    tt: sourceRows("tt", input.receipts, aliasOf("tt"), groupOf),
  };
  const orphans: OrphanAlias[] = input.aliases
    .filter((a) => !liveKeys[a.source].has(a.itemKey))
    .map((a) => ({ ...toView(a), source: a.source, itemKey: a.itemKey, itemName: a.itemName, unit: a.unit }));

  const dtLines: DtLineOption[] = input.dtLines.map((line) => ({
    key: line.key,
    label: `${line.itemName}${line.unit ? ` (${line.unit})` : ""} · ${dtAlias(line.key)?.kind ?? line.kind}`,
    kind: dtAlias(line.key)?.kind ?? line.kind,
    groupCodeId: dtAlias(line.key)?.groupCodeId ?? null,
  }));

  return { tabs, orphans, dtLines, groups: input.groups.map(({ id, code, name }) => ({ id, code, name })) };
}
