/**
 * Khóa và giá trị ánh xạ của adapter `vat-tu-chuyen-doi` (lưu ở `ImportRun.mapping`).
 *
 * Khóa tên dùng tên chuẩn hóa (NFC, gộp khoảng trắng, chữ thường, giữ dấu) để "Dải cây xanh" và
 * "Dải Cây Xanh" là một khóa:
 *   entity:<tên>  supplier:<tên>  item:<tên>
 *   project:<tên>@<Chủ thể>  project-csv:<tên>  project-folder:<thư mục>  project-label:<tên>
 * Khóa quyết định: pair:<s>:<p> (1 lũy kế / 0 ròng), cdc:<s>@<Chủ thể> (công trình nhận phần chênh),
 * date:<file>:<sheet>!<ô> ("yyyy-mm-dd"), xmatch:<NL#dòng>:<id sổ> ("drop" / "keep"),
 * round:<id đợt> ("drop-nl" / "keep" — đợt còn mở trùng "Trả Nợ"), ack:<mã> (1).
 *
 * Giá trị tên: số (id có sẵn), "new" (tạo mới theo tên nguồn), "new:<tên>" (tạo mới với tên khác),
 * "split" (chỉ công trình "CDC" của Số Dư: tách theo CSV), null (bỏ qua — chỉ vật tư, công trình
 * CSV và nhãn công trình; NCC / công trình / Chủ thể không có "bỏ qua" vì bỏ qua là mất nợ).
 * Module thuần.
 */

import { z } from "zod";
import type { ImportMapping, MappingValue } from "../adapter-types";
import { normalizeSourceName } from "../../import-review";

export const NAME_KINDS = [
  "entity",
  "supplier",
  "project",
  "project-csv",
  "project-folder",
  "project-label",
  "item",
] as const;
export type NameKind = (typeof NAME_KINDS)[number];

/** Tên chuẩn hóa dùng trong khóa và để so trùng khít. */
export function normName(name: string): string {
  return normalizeSourceName(name);
}

export function nameKey(kind: NameKind, name: string): string {
  return `${kind}:${normName(name)}`;
}

export function projectKey(projectName: string, entityName: string): string {
  return `project:${normName(projectName)}@${normName(entityName)}`;
}

/** Đích của một tên: bản ghi có sẵn hoặc bản ghi sẽ tạo trong lần chạy (khóa theo tên chuẩn hóa). */
export type NewRef = { kind: "new"; norm: string; name: string };
export type Ref = { kind: "id"; id: number } | NewRef;

export function idRef(id: number): Ref {
  return { kind: "id", id };
}

export function newRef(name: string): NewRef {
  const clean = name.normalize("NFC").trim().replace(/\s+/g, " ");
  return { kind: "new", norm: normName(clean), name: clean };
}

/** Chuỗi khóa ổn định của ref (dùng trong khóa cặp / mã xác nhận). */
export function refKey(ref: Ref): string {
  return ref.kind === "id" ? String(ref.id) : `n:${ref.norm.replace(/[:|@]/g, "_")}`;
}

export function sameRef(a: Ref | null, b: Ref | null): boolean {
  if (!a || !b) return false;
  return refKey(a) === refKey(b);
}

export interface PairRef {
  sRef: Ref;
  pRef: Ref;
  /** `refKey(s)|refKey(p)` */
  key: string;
}

export function pairRef(sRef: Ref, pRef: Ref): PairRef {
  return { sRef, pRef, key: `${refKey(sRef)}|${refKey(pRef)}` };
}

export function pairDecisionKey(pair: PairRef): string {
  return `pair:${refKey(pair.sRef)}:${refKey(pair.pRef)}`;
}

export function cdcDecisionKey(sRef: Ref, entityName: string): string {
  return `cdc:${refKey(sRef)}@${normName(entityName)}`;
}

export function xmatchKey(sourceKey: string, ledgerId: number): string {
  return `xmatch:${sourceKey}:${ledgerId}`;
}

/** Đợt `vat_tu` còn mở trùng số tiền "Trả Nợ": "drop-nl" (bỏ dòng Nhập Liệu) / "keep" (khoản khác nhau). */
export function roundDecisionKey(roundId: number): string {
  return `round:${roundId}`;
}

export const ACK_PREFIX = "ack:";

/** Số tiền trong mã xác nhận: làm tròn đồng, để đổi số thì phải xác nhận lại. */
function ackAmount(value: number): string {
  return String(Math.round(value));
}

export const ackCode = {
  pairLifetime: (pair: PairRef, diffTt: number, diffHd: number) =>
    `pair:${refKey(pair.sRef)}:${refKey(pair.pRef)}:${ackAmount(diffTt)}:${ackAmount(diffHd)}`,
  cdc: (sRef: Ref, entityName: string, diffTt: number, diffHd: number) =>
    `cdc:${refKey(sRef)}@${normName(entityName)}:${ackAmount(diffTt)}:${ackAmount(diffHd)}`,
  crossCutover: (sourceKey: string, ledgerId: number) => `xmatch:${sourceKey}:${ledgerId}`,
  /** "Đợt #… chưa chi và chưa có trong Nhập Liệu" — kèm tổng tiền để đợt đổi số thì phải xác nhận lại. */
  openRound: (roundId: number, total: number) => `open-round:${roundId}:${ackAmount(total)}`,
  noMoneyDeliveries: (pair: PairRef, count: number) => `no-money:${refKey(pair.sRef)}:${refKey(pair.pRef)}:${count}`,
  v1: (file: string, diff: number) => `v1:${file}:${ackAmount(diff)}`,
} as const;

export function isAcked(mapping: ImportMapping, code: string): boolean {
  return mapping[`${ACK_PREFIX}${code}`] === 1;
}

/** Giá trị đã đọc của một khóa tên. */
export type NameValue =
  | { kind: "id"; id: number }
  | { kind: "new"; name: string | null }
  | { kind: "split" }
  | { kind: "skip" }
  | { kind: "unset" };

const NEW_RE = /^new(?::([\s\S]{1,200}))?$/;

export function readNameValue(value: MappingValue | undefined): NameValue {
  if (value === undefined) return { kind: "unset" };
  if (value === null) return { kind: "skip" };
  if (typeof value === "number") return { kind: "id", id: value };
  if (value === "split") return { kind: "split" };
  const m = NEW_RE.exec(value);
  if (m) {
    const name = m[1]?.trim();
    return { kind: "new", name: name ? name : null };
  }
  return { kind: "unset" };
}

/** Giá trị ánh xạ (để UI gửi lại) của một ref. */
export function refToValue(ref: Ref, sourceDisplay: string): MappingValue {
  if (ref.kind === "id") return ref.id;
  return normName(ref.name) === normName(sourceDisplay) ? "new" : `new:${ref.name}`;
}

// ─── Schema zod của mapping (kiểm phía server khi "Lưu & tính lại") ─────────────

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPositiveInt(v: MappingValue): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNew(v: MappingValue): boolean {
  return typeof v === "string" && NEW_RE.test(v);
}

type Rule = (v: MappingValue) => boolean;

const NAME_RULES: Record<NameKind, { rule: Rule; hint: string }> = {
  entity: { rule: (v) => isPositiveInt(v) || isNew(v), hint: "id hoặc \"new\"" },
  supplier: { rule: (v) => isPositiveInt(v) || isNew(v), hint: "id hoặc \"new\"" },
  item: { rule: (v) => v === null || isPositiveInt(v) || isNew(v), hint: "id, \"new\" hoặc null" },
  project: { rule: (v) => isPositiveInt(v) || isNew(v) || v === "split", hint: "id, \"new\" hoặc \"split\"" },
  "project-csv": { rule: (v) => v === null || isPositiveInt(v) || isNew(v), hint: "id, \"new\" hoặc null" },
  "project-folder": { rule: (v) => isPositiveInt(v) || isNew(v), hint: "id hoặc \"new\"" },
  "project-label": { rule: (v) => v === null || isPositiveInt(v) || isNew(v), hint: "id, \"new\" hoặc null" },
};

const DECISION_RULES: Record<string, { rule: Rule; hint: string }> = {
  pair: { rule: (v) => v === 0 || v === 1, hint: "0 hoặc 1" },
  cdc: { rule: (v) => isPositiveInt(v) || isNew(v), hint: "id công trình hoặc \"new:<tên>\"" },
  date: { rule: (v) => typeof v === "string" && ISO_DAY_RE.test(v), hint: "yyyy-mm-dd" },
  xmatch: { rule: (v) => v === "drop" || v === "keep", hint: "\"drop\" hoặc \"keep\"" },
  round: { rule: (v) => v === "drop-nl" || v === "keep", hint: "\"drop-nl\" hoặc \"keep\"" },
  ack: { rule: (v) => v === 1 || v === null, hint: "1 hoặc null" },
};

function ruleFor(key: string): { rule: Rule; hint: string } | null {
  const prefix = key.slice(0, key.indexOf(":"));
  if (!prefix || key.length <= prefix.length + 1) return null;
  if ((NAME_KINDS as readonly string[]).includes(prefix)) return NAME_RULES[prefix as NameKind];
  return Object.hasOwn(DECISION_RULES, prefix) ? DECISION_RULES[prefix] : null;
}

export const cutoverMappingSchema: z.ZodType<ImportMapping> = z
  .record(z.string(), z.union([z.number(), z.string(), z.null()]))
  .superRefine((mapping, ctx) => {
    for (const [key, value] of Object.entries(mapping)) {
      const rule = ruleFor(key);
      if (!rule) {
        ctx.addIssue({ code: "custom", path: [key], message: "Khóa ánh xạ không thuộc adapter chuyển đổi" });
      } else if (!rule.rule(value)) {
        ctx.addIssue({ code: "custom", path: [key], message: `Giá trị phải là ${rule.hint}` });
      }
    }
  });
