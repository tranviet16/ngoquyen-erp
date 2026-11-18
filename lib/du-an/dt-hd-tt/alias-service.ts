"use server";

/**
 * Màn Ánh xạ của "Đối chiếu DT-HĐ-TT": gán tên|ĐVT của dự toán / hóa đơn / thực tế nhập vào Mã nhóm,
 * Dòng DT, hệ số. Quyền theo công trình: xem `read`, gán khóa chưa gán `create`, sửa / bỏ gán / xác
 * nhận hàng loạt `edit`. Mỗi lần ghi khóa công trình, tra lại Mã nhóm / Dòng DT theo công trình (chỉ
 * khi id đổi so với bản đang lưu), tìm alias bằng findFirst rồi create / update có audit (không upsert).
 * Gán vào Dòng DT → Mã nhóm lưu = nhóm hiện tại của dòng DT.
 *
 * Giao dịch HĐ sinh tự động chỉ được sinh lại khi vị trí dòng hóa đơn có thể đổi (Dòng DT, hệ số, Mã
 * nhóm, vào / ra Ngoài DT của alias hd; loại của alias dt) — sửa ghi chú / trạng thái không đụng tới.
 * Transaction được nới thời gian (khóa công trình có thể đang bận, dòng hóa đơn của một khóa có thể nhiều).
 *
 * Action ghi TRẢ `ActionResult` (không ném): bản production ẩn thông điệp lỗi ném từ server action.
 */

import type { ProjectItemAlias } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bypassAudit } from "@/lib/async-context";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { buildAliasBoard, type AliasBoard, type AliasView } from "./alias-board";
import { loadDtLines } from "./alias-groups";
import {
  aliasConfirmSchema, aliasCreateSchema, aliasMappingSchema, groupForDtLine, isBulkConfirmable, kindOfDtKey, placementSignature,
  resolveAliasMapping, type AliasCreateInput, type AliasMapping, type AliasMappingInput, type AliasPatch, type AliasSource,
} from "./alias-rules";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import { decOrNull, entryIdSchema } from "./entry-schemas";
import { assertProjectActive, refChanged, revalidateMappingChange, withUniqueMessage } from "./entry-write-guards";
import { syncDerivedTransactions, type InvoiceSyncClient } from "./invoice-transaction-sync";
import type { CostKind } from "./keys";
import { lockProjectDtHdTt } from "./project-lock";
import { assertPatchKeys, mergePatch } from "./register-schemas";
import type { AliasStatus } from "./report-inputs";

type AliasTx = InvoiceSyncClient & Pick<typeof prisma, "projectGroupCode" | "projectActualReceipt">;

const LOG_TAG = "du-an.dt-hd-tt.alias";
const GONE = rowGone("Ánh xạ");
const DUPLICATE_ALIAS = "Tên|ĐVT này đã có ánh xạ — tải lại trang rồi sửa ánh xạ đang có";
/** Như các transaction ghi nhiều dòng khác của repo: chờ khóa tối đa 10 s, chạy tối đa 60 s. */
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

function toView(a: ProjectItemAlias): AliasView {
  return {
    id: a.id, groupCodeId: a.groupCodeId, dtKey: a.dtKey, factor: decOrNull(a.factor), kind: a.kind as CostKind | null,
    status: a.status as AliasStatus, note: a.note,
  };
}

/** Phần ánh xạ đang lưu của alias, dạng đầu vào của schema (để trộn bản vá). */
const storedMapping = (a: ProjectItemAlias): AliasMappingInput => ({
  groupCodeId: a.groupCodeId, dtKey: a.dtKey, factor: decOrNull(a.factor), kind: a.kind as CostKind | null, status: a.status as AliasStatus, note: a.note,
});

/** Tên + ĐVT hiển thị của khóa, lấy từ sổ nguồn; null = không còn dòng nào mang khóa này. */
async function sourceSample(tx: AliasTx, projectId: number, source: AliasSource, itemKey: string) {
  const where = { projectId, itemKey, deletedAt: null };
  const select = { itemName: true, unit: true } as const;
  if (source === "hd") return tx.projectInvoiceLine.findFirst({ where, select, orderBy: { id: "asc" } });
  if (source === "tt") return tx.projectActualReceipt.findFirst({ where, select, orderBy: { id: "asc" } });
  const line = (await loadDtLines(tx, projectId)).get(itemKey);
  return line ? { itemName: line.itemName, unit: line.unit } : null;
}

/**
 * Áp quy tắc + tra Mã nhóm / Dòng DT theo đúng công trình (id của công trình khác bị từ chối).
 *   - `stored` = alias đang lưu (null khi tạo): id không đổi so với bản đang lưu thì không tra lại — Dòng
 *     DT đã biến mất khỏi dự toán không chặn việc sửa ghi chú / hệ số / bỏ chọn, nhưng không được
 *     XÁC NHẬN lại trên dòng đã mất.
 *   - `explicitGroup` = nhóm người dùng chọn trong lần ghi này; Dòng DT còn trong dự toán → lưu nhóm
 *     hiện tại của dòng DT, chỉ từ chối khi `explicitGroup` khác nhóm đó.
 */
async function checkedMapping(
  tx: AliasTx,
  projectId: number,
  source: AliasSource,
  itemKey: string,
  input: AliasMappingInput,
  explicitGroup: number | null | undefined,
  stored: ProjectItemAlias | null,
): Promise<AliasMapping> {
  const mapping = resolveAliasMapping(source, itemKey, aliasMappingSchema.parse(input));
  if (mapping.groupCodeId !== null && (stored === null || refChanged(stored.groupCodeId, mapping.groupCodeId))) {
    const group = await tx.projectGroupCode.findFirst({ where: { id: mapping.groupCodeId, projectId, deletedAt: null }, select: { id: true } });
    if (!group) throw new Error("Mã nhóm không thuộc công trình này");
  }
  if (mapping.dtKey === null) return mapping;
  const dtKeyChanged = stored === null || stored.dtKey !== mapping.dtKey;
  if (!(await loadDtLines(tx, projectId)).has(mapping.dtKey)) {
    if (dtKeyChanged) throw new Error("Dòng DT không thuộc dự toán của công trình này");
    if (mapping.status === "xac_nhan" && stored?.status !== "xac_nhan") {
      throw new Error("Dòng DT đã chọn không còn trong dự toán — chọn lại Dòng DT trước khi xác nhận");
    }
    return mapping;
  }
  const dtAlias = await tx.projectItemAlias.findFirst({
    where: { projectId, source: "dt", itemKey: mapping.dtKey, deletedAt: null },
    select: { groupCodeId: true },
  });
  mapping.groupCodeId = groupForDtLine(explicitGroup, dtAlias?.groupCodeId ?? null);
  return mapping;
}

/**
 * Sinh lại giao dịch HĐ của các dòng hóa đơn mà alias này quyết định vị trí, CHỈ khi vị trí có thể
 * đổi: alias hd đổi chữ ký vị trí → các dòng cùng khóa; alias dt đổi loại → các dòng hóa đơn gán vào
 * dòng DT đó (loại quyết định loại giao dịch).
 */
async function resyncAffectedInvoices(
  tx: AliasTx,
  projectId: number,
  source: AliasSource,
  itemKey: string,
  change: { hdPlacementChanged: boolean; dtKindChanged: boolean },
): Promise<void> {
  let keys: string[] = [];
  if (source === "hd" && change.hdPlacementChanged) keys = [itemKey];
  else if (source === "dt" && change.dtKindChanged) {
    const linked = await tx.projectItemAlias.findMany({ where: { projectId, source: "hd", dtKey: itemKey, deletedAt: null }, select: { itemKey: true } });
    keys = linked.map((a) => a.itemKey);
  }
  if (keys.length === 0) return;
  const lines = await tx.projectInvoiceLine.findMany({ where: { projectId, itemKey: { in: keys }, deletedAt: null }, select: { id: true } });
  await syncDerivedTransactions(tx, projectId, lines.map((l) => l.id));
}

/** Loại hiệu lực của dòng DT: loại trên alias dt, không có thì loại theo hạng mục (hậu tố khóa). */
const effectiveKind = (itemKey: string, aliasKind: string | null) => aliasKind ?? kindOfDtKey(itemKey);

/** Chữ ký vị trí của alias đang lưu / vừa tính (hệ số dạng số). */
const signatureOf = (a: { status: string; dtKey: string | null; factor: number | null; groupCodeId: number | null } | null) => placementSignature(a);
const storedSignature = (a: ProjectItemAlias) => signatureOf({ ...a, factor: decOrNull(a.factor) });

export async function listAliasBoard(projectId: number): Promise<AliasBoard> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const live = { projectId, deletedAt: null };
  const [dtLines, invoiceLines, receipts, aliases, groups] = await Promise.all([
    loadDtLines(prisma, projectId),
    prisma.projectInvoiceLine.findMany({
      where: live, select: { itemKey: true, itemName: true, unit: true, amountVnd: true, supplier: { select: { name: true } } }, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
    }),
    prisma.projectActualReceipt.findMany({
      where: live, select: { itemKey: true, itemName: true, unit: true, amountVnd: true, counterparty: { select: { name: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.projectItemAlias.findMany({ where: live, orderBy: { id: "asc" } }),
    prisma.projectGroupCode.findMany({ where: live, select: { id: true, code: true, name: true, counterparty: { select: { name: true } } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
  ]);
  return buildAliasBoard({
    dtLines: [...dtLines.values()].map((l) => ({ key: l.key, kind: l.kind, itemName: l.itemName, unit: l.unit, value: l.value.toNumber(), lineCount: l.estimateIds.length })),
    invoiceLines: invoiceLines.map((l) => ({ itemKey: l.itemKey, itemName: l.itemName, unit: l.unit, amount: l.amountVnd.toNumber(), party: l.supplier.name })),
    receipts: receipts.map((r) => ({ itemKey: r.itemKey, itemName: r.itemName, unit: r.unit, amount: r.amountVnd.toNumber(), party: r.counterparty?.name ?? null })),
    aliases: aliases.map((a) => ({ ...toView(a), source: a.source as AliasSource, itemKey: a.itemKey, itemName: a.itemName, unit: a.unit })),
    groups: groups.map((g) => ({ id: g.id, code: g.code, name: g.name, counterpartyName: g.counterparty?.name ?? null })),
  });
}

/** Gán một khóa đang "chưa gán". */
export async function createAlias(input: AliasCreateInput): Promise<ActionResult<{ alias: AliasView }>> {
  return runEntryAction(LOG_TAG, async () => {
    const data = aliasCreateSchema.parse(input);
    const { projectId, source, itemKey } = data;
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const created = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [projectId]);
          await assertProjectActive(tx, projectId);
          const existing = await tx.projectItemAlias.findFirst({ where: { projectId, source, itemKey, deletedAt: null }, select: { id: true } });
          if (existing) throw new Error(DUPLICATE_ALIAS);
          const sample = await sourceSample(tx, projectId, source, itemKey);
          if (!sample) throw new Error("Không còn dòng nào mang tên|ĐVT này — tải lại trang");
          const mapping = await checkedMapping(tx, projectId, source, itemKey, data, data.groupCodeId, null);
          const alias = await tx.projectItemAlias.create({ data: { projectId, source, itemKey, itemName: sample.itemName, unit: sample.unit, ...mapping } });
          await resyncAffectedInvoices(tx, projectId, source, itemKey, {
            hdPlacementChanged: signatureOf(mapping) !== signatureOf(null),
            dtKindChanged: source === "dt" && mapping.kind !== kindOfDtKey(itemKey),
          });
          return alias;
        }, TX_OPTIONS),
      DUPLICATE_ALIAS,
    );
    revalidateMappingChange(projectId);
    return { alias: toView(created) };
  });
}

/** Sửa alias: chỉ các trường trong bản vá; phần còn lại lấy từ alias đọc lại dưới khóa. */
export async function updateAlias(id: number, projectId: number, patch: AliasPatch): Promise<ActionResult<{ alias: AliasView }>> {
  return runEntryAction(LOG_TAG, async () => {
    const aliasId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    assertPatchKeys(patch, Object.keys(aliasMappingSchema.shape));
    const existing = await prisma.projectItemAlias.findUnique({ where: { id: aliasId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const updated = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      // Đọc lại dưới khóa: import / hoàn tác / người khác có thể vừa bỏ gán hoặc sửa ô khác.
      const current = await tx.projectItemAlias.findFirst({ where: { id: aliasId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(GONE);
      const source = current.source as AliasSource;
      const merged = mergePatch(storedMapping(current), patch);
      const mapping = await checkedMapping(tx, scopeId, source, current.itemKey, merged, patch?.groupCodeId, current);
      const alias = await tx.projectItemAlias.update({ where: { id: aliasId, projectId: scopeId }, data: mapping });
      await resyncAffectedInvoices(tx, scopeId, source, current.itemKey, {
        hdPlacementChanged: storedSignature(current) !== signatureOf(mapping),
        dtKindChanged: source === "dt" && effectiveKind(current.itemKey, current.kind) !== mapping.kind,
      });
      return alias;
    }, TX_OPTIONS);
    revalidateMappingChange(scopeId);
    return { alias: toView(updated) };
  });
}

/** Bỏ gán (xóa mềm alias): dòng nguồn trở lại "chưa gán"; dùng cả cho alias mồ côi. */
export async function softDeleteAlias(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const aliasId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectItemAlias.findUnique({ where: { id: aliasId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectItemAlias.findFirst({ where: { id: aliasId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(GONE);
      await tx.projectItemAlias.update({ where: { id: aliasId, projectId: scopeId }, data: { deletedAt: new Date() } });
      const source = current.source as AliasSource;
      await resyncAffectedInvoices(tx, scopeId, source, current.itemKey, {
        hdPlacementChanged: storedSignature(current) !== signatureOf(null),
        dtKindChanged: source === "dt" && effectiveKind(current.itemKey, current.kind) !== kindOfDtKey(current.itemKey),
      });
    }, TX_OPTIONS);
    revalidateMappingChange(scopeId);
    return {};
  });
}

/**
 * Xác nhận hàng loạt các đề xuất đã chọn. Một lần updateMany (ngoài audit tự động) + MỘT dòng audit
 * ghi tay liệt kê đúng các id đã chuyển. Chỉ đổi trạng thái, không đổi vị trí dòng → không cần sinh
 * lại giao dịch HĐ. Bỏ qua (đếm ở `skipped`): đề xuất chưa có Dòng DT / Mã nhóm, và đề xuất trỏ tới Dòng
 * DT không còn trong dự toán (đếm riêng ở `staleDtLine`).
 */
export async function confirmAliases(
  projectId: number,
  aliasIds: number[],
): Promise<ActionResult<{ confirmed: number; skipped: number; staleDtLine: number }>> {
  return runEntryAction(LOG_TAG, async () => {
    const data = aliasConfirmSchema.parse({ projectId, aliasIds });
    const scopeId = data.projectId;
    const ids = [...new Set(data.aliasIds)];
    const { userId } = await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: scopeId } });
    const { confirmed, staleDtLine } = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const rows = await tx.projectItemAlias.findMany({
        where: { id: { in: ids }, projectId: scopeId, deletedAt: null },
        select: { id: true, source: true, status: true, dtKey: true, groupCodeId: true },
      });
      if (rows.length !== ids.length) throw new Error("Có ánh xạ không thuộc công trình này hoặc đã bị bỏ gán — tải lại trang");
      const dtKeys = new Set((await loadDtLines(tx, scopeId)).keys());
      const candidates = rows.filter(isBulkConfirmable);
      const stale = candidates.filter((r) => r.dtKey !== null && !dtKeys.has(r.dtKey));
      const targets = candidates.filter((r) => !stale.includes(r)).map((r) => r.id);
      if (targets.length === 0) return { confirmed: 0, staleDtLine: stale.length };
      await bypassAudit(() =>
        tx.projectItemAlias.updateMany({ where: { id: { in: targets }, projectId: scopeId, status: "de_xuat" }, data: { status: "xac_nhan" } }),
      );
      await tx.auditLog.create({
        data: {
          userId, tableName: "ProjectItemAlias", recordId: `project:${scopeId}`, action: "bulk_confirm",
          beforeJson: { status: "de_xuat", aliasIds: targets }, afterJson: { status: "xac_nhan", aliasIds: targets },
        },
      });
      return { confirmed: targets.length, staleDtLine: stale.length };
    }, TX_OPTIONS);
    revalidateMappingChange(scopeId);
    return { confirmed, skipped: ids.length - confirmed, staleDtLine };
  });
}
