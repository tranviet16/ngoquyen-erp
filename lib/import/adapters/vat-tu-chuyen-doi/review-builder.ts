/**
 * Duyệt run chuyển đổi: đọc danh mục → giải ánh xạ → khóa mọi NCC đã giải → đọc dữ kiện ERP → lập
 * kế hoạch → (xem trước) chạy thử đúng đường ghi + đối soát V1–V4 rồi bỏ → payload, lỗi chặn, mục cần
 * xác nhận. Pha "commit" không ghi gì: chỉ kiểm lại lỗi chặn / xác nhận dưới khóa.
 *
 * Engine đã mở transaction (pha xem trước luôn rollback). Adapter không khai báo `lockScope`: ở đây
 * khóa dòng run rồi MỌI NCC đã giải (đã lưu + tự điền) một lần, tăng dần, trước mọi đọc được guard
 * bảo vệ. Chạy thử nằm trong SAVEPOINT để lỗi ghi vẫn trả về được payload (không làm hỏng transaction).
 */

import { lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import type { AdapterReview, ImportMapping, ImportTx, ParsedData, ReviewContext } from "../adapter-types";
import { errorMessage } from "../../import-errors";
import { applyCutoverPlan } from "./apply-cutover";
import { CUTOVER_DATE, CUTOVER_MARKER_FROM, LIFETIME_DATE, OPENING_AS_OF } from "./cutover-constants";
import { BLOCKING_GROUP, buildCutoverPlan, flattenBlocking, type CutoverPlan } from "./cutover-plan";
import { isoDay } from "./day-utils";
import { collectSourceNames } from "./name-collect";
import { resolveNames, type NameResolution } from "./name-resolution";
import { parseMemoKey, parseWithMapping } from "./parse-with-mapping";
import { loadCatalog, loadDbFacts } from "./review-db-facts";
import type { BlockingGroupView, CutoverReviewPayload } from "./review-payload-types";
import type { BundleFile, CutoverBundleParseResult } from "./types";
import { runVerification, type VerificationOutcome } from "./verification-queries";

/** Dữ liệu parse của adapter: gói gốc (để parse lại theo lựa chọn ngày) + bản parse gốc. */
export interface CutoverParsedData extends ParsedData {
  files: BundleFile[];
  base: CutoverBundleParseResult;
}

/** Khóa advisory theo adapter: hai commit chuyển đổi không chạy song song (guard độc quyền đúng). */
const ADAPTER_LOCK_KEY = "import-adapter:vat-tu-chuyen-doi";

const parseMemo = new WeakMap<CutoverParsedData, Map<string, CutoverBundleParseResult>>();

function parseFor(data: CutoverParsedData, names: NameResolution, mapping: ImportMapping): CutoverBundleParseResult {
  let byKey = parseMemo.get(data);
  if (!byKey) parseMemo.set(data, (byKey = new Map()));
  const key = parseMemoKey(names, mapping);
  let parsed = byKey.get(key);
  if (!parsed) byKey.set(key, (parsed = parseWithMapping(data.files, names, mapping)));
  return parsed;
}

export async function prepareCutoverPlan(
  data: CutoverParsedData,
  mapping: ImportMapping,
  db: ImportTx,
  runId: number,
  opts: { lockAdapter: boolean },
): Promise<CutoverPlan> {
  // Thứ tự khóa giống commit / hoàn tác của engine: dòng run → NCC (tăng dần) → khóa adapter. Dòng run
  // phải khóa trước NCC vì chạy thử ghi dòng mang importRunId (kiểm FK cần FOR KEY SHARE dòng run).
  await db.$executeRaw`SELECT 1 FROM import_runs WHERE id = ${runId} FOR KEY SHARE`;
  const catalog = await loadCatalog(db);
  const names = resolveNames(collectSourceNames(data.base), data.base, mapping, catalog);
  const supplierIds = names.entries
    .filter((e) => e.kind === "supplier" && typeof e.effective === "number")
    .map((e) => e.effective as number);
  await lockSuppliers(db, supplierIds);
  if (opts.lockAdapter) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADAPTER_LOCK_KEY}))`;
  const parse = parseFor(data, names, mapping);
  const facts = await loadDbFacts(db, supplierIds, runId);
  return buildCutoverPlan({ parse, mapping, names, facts });
}

function buildPayload(
  plan: CutoverPlan,
  groups: BlockingGroupView[],
  outcome: VerificationOutcome | null,
  dryRunNote: string | null,
): CutoverReviewPayload {
  return {
    version: 1,
    constants: {
      cutoverDate: isoDay(CUTOVER_DATE),
      lifetimeDate: isoDay(LIFETIME_DATE),
      openingAsOf: isoDay(OPENING_AS_OF),
      cutoverMarkerFrom: isoDay(CUTOVER_MARKER_FROM),
    },
    summary: plan.views.summary,
    blockingGroups: groups,
    mapping: plan.names.entries,
    catalog: plan.names.catalogView,
    cdc: plan.views.cdc,
    pairs: plan.views.pairs,
    csvUnused: plan.views.csvUnused,
    dates: plan.views.dates,
    verification: outcome?.view ?? null,
    dryRunNote,
    postCutover: {
      pickups: plan.views.pickups,
      payments: plan.views.payments,
      openRounds: plan.views.openRounds,
      crossCutover: plan.views.crossCutover,
    },
    diagnostic: outcome?.diagnostic ?? null,
    deliveries: plan.views.deliveries,
    newMaster: plan.views.newMaster,
    markers: plan.markers.length,
  };
}

export async function reviewCutover(
  data: CutoverParsedData,
  mapping: ImportMapping,
  db: ImportTx,
  ctx: ReviewContext,
): Promise<AdapterReview> {
  const plan = await prepareCutoverPlan(data, mapping, db, ctx.runId, { lockAdapter: ctx.phase === "commit" });
  if (ctx.phase === "commit") {
    // Không ghi gì; V1 cần chạy ghi nên được kiểm trong apply (mã xác nhận chứa đúng số đã xem).
    return { payload: { phase: "commit" }, blocking: flattenBlocking(plan.blockingGroups), requiredAcks: plan.requiredAcks };
  }

  const groups = [...plan.blockingGroups];
  let outcome: VerificationOutcome | null = null;
  let dryRunNote: string | null = null;
  if (!plan.dryRunAllowed) {
    dryRunNote = "Chưa chạy thử ghi: còn lỗi chặn về cấu trúc file, ánh xạ tên, Chủ thể, ngày hoặc guard độc quyền.";
  } else {
    await db.$executeRaw`SAVEPOINT cutover_dry_run`;
    try {
      const applied = await applyCutoverPlan(db, plan, ctx.runId, { dryRun: true });
      outcome = await runVerification(db, plan, applied.ids, ctx.runId, mapping);
    } catch (err) {
      console.error(`[import] chạy thử chuyển đổi run #${ctx.runId} lỗi`, err);
      dryRunNote = `Chạy thử ghi lỗi: ${errorMessage(err)}`;
      groups.push({ group: BLOCKING_GROUP.verification, messages: [dryRunNote] });
    } finally {
      await db.$executeRaw`ROLLBACK TO SAVEPOINT cutover_dry_run`;
    }
    if (outcome?.failures.length) groups.push({ group: BLOCKING_GROUP.verification, messages: outcome.failures });
  }
  const v1Acks = (outcome?.view.v1 ?? []).flatMap((r) => (r.ackCode ? [r.ackCode] : []));
  return {
    payload: buildPayload(plan, groups, outcome, dryRunNote),
    blocking: flattenBlocking(groups),
    requiredAcks: [...new Set([...plan.requiredAcks, ...v1Acks])],
  };
}
