/**
 * Lớp lập kế hoạch chuyển đổi (thuần, không DB): từ kết quả parse + ánh xạ đã giải + dữ kiện ERP
 * đã đọc, dựng mọi dòng sẽ ghi (theo thứ tự ghi), marker, neo V1, mục tiêu V2–V4, lỗi chặn và mục
 * cần xác nhận. `review-builder.ts` gọi cho cả xem trước lẫn commit; `apply-cutover.ts` ghi kế hoạch.
 *
 * Mỗi khoảng thời gian một nguồn tiền:
 * - tới mốc: chỉ Nhập Liệu + số dư ròng (asOf 31/12/2025) hoặc 2 dòng lũy kế (26/12/2025); phiếu lịch
 *   sử chỉ là bản ghi khối lượng;
 * - sau mốc: "Lấy Hàng" không bao giờ ghi (phải ghép phiếu), "Trả Nợ" chỉ ghi khi không khớp
 *   thanh toán ERP.
 */

import type { ImportMapping } from "../adapter-types";
import type { PairRef, Ref } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import { planDeliveries } from "./plan-deliveries";
import { exclusivityGuard, planAnchors, planMarkers } from "./plan-markers-guard";
import { nlLedgerRow, resolveNlRows } from "./plan-nl-rows";
import { planPairs, type ResolvedNlRow } from "./plan-pairs";
import { planPostCutover } from "./plan-post-cutover";
import type {
  AnchorPlan,
  DbFacts,
  NewMasterData,
  PlannedDelivery,
  PlannedLedgerRow,
  PlannedOpening,
  V2Target,
  V3Target,
} from "./plan-types";
import { buildDateViews, buildSummary, dateBlocking, isDateBlockingCode } from "./plan-views";
import type {
  BlockingGroupView,
  CdcView,
  CrossCutoverView,
  CsvUnusedView,
  DateDecisionView,
  DeliverySummaryView,
  NewMasterView,
  OpenRoundView,
  PairView,
  PaymentMatchView,
  PickupView,
  SummaryView,
} from "./review-payload-types";
import type { CutoverBundleParseResult } from "./types";

export const BLOCKING_GROUP = {
  structure: "Cấu trúc file",
  mapping: "Ánh xạ tên",
  entity: "Chủ thể công trình",
  dates: "Ngày",
  guard: "Guard độc quyền",
  cdc: "Tách CDC",
  pairs: "Duyệt từng cặp",
  pickups: "\"Lấy Hàng\" sau mốc chưa ghép phiếu",
  rounds: "Đợt thanh toán vật tư còn mở trùng \"Trả Nợ\"",
  crossCutover: "Khớp chéo mốc",
  verification: "Đối soát",
} as const;

/** Nhóm lỗi chặn mà khi còn thì không chạy thử ghi (số không có nghĩa / ghi sẽ hỏng). */
const DRY_RUN_BLOCKERS: readonly string[] = [
  BLOCKING_GROUP.structure,
  BLOCKING_GROUP.mapping,
  BLOCKING_GROUP.entity,
  BLOCKING_GROUP.dates,
  BLOCKING_GROUP.guard,
];

export interface CutoverPlanInput {
  parse: CutoverBundleParseResult;
  mapping: ImportMapping;
  names: NameResolution;
  facts: DbFacts;
}

export interface CutoverPlan {
  names: NameResolution;
  blockingGroups: BlockingGroupView[];
  requiredAcks: string[];
  dryRunAllowed: boolean;
  newMaster: NewMasterData;
  openings: PlannedOpening[];
  /** Thứ tự ghi: lũy kế → Nhập Liệu ≤ mốc → "Trả Nợ" sau mốc không khớp. */
  ledgerRows: PlannedLedgerRow[];
  deliveries: PlannedDelivery[];
  markers: PairRef[];
  touchedPairs: PairRef[];
  anchors: AnchorPlan[];
  v2: V2Target[];
  v3: V3Target[];
  v4: { total: number; matched: number; matchedErpDeliveryIds: number[]; expectedAfterCutover: number };
  views: {
    summary: SummaryView;
    pairs: PairView[];
    cdc: CdcView[];
    csvUnused: CsvUnusedView[];
    dates: DateDecisionView[];
    pickups: PickupView[];
    payments: PaymentMatchView[];
    openRounds: OpenRoundView[];
    crossCutover: CrossCutoverView[];
    deliveries: DeliverySummaryView[];
    newMaster: NewMasterView;
  };
}

export function buildCutoverPlan({ parse, mapping, names, facts }: CutoverPlanInput): CutoverPlan {
  const groups = new Map<string, string[]>();
  const block = (group: string, messages: Iterable<string>) => {
    const list = groups.get(group) ?? [];
    for (const m of messages) if (!list.includes(m)) list.push(m);
    if (list.length) groups.set(group, list);
  };
  block(
    BLOCKING_GROUP.structure,
    parse.blockingErrors.filter((e) => !isDateBlockingCode(e.code)).map((e) => `${e.ref.file} ${e.ref.sheet}!${e.ref.cell}: ${e.message}`),
  );
  block(BLOCKING_GROUP.dates, dateBlocking(parse));
  block(BLOCKING_GROUP.mapping, names.mappingBlocking);
  block(BLOCKING_GROUP.entity, names.entityBlocking);

  const nlBlocking = new Set<string>();
  const nlRows = resolveNlRows(parse, names, nlBlocking);
  block(BLOCKING_GROUP.mapping, nlBlocking);

  const pairPlan = planPairs(nlRows, parse.mainFile?.openingBalances ?? [], parse.csv?.rows ?? [], names, mapping);
  block(BLOCKING_GROUP.cdc, pairPlan.cdcBlocking);
  block(BLOCKING_GROUP.pairs, pairPlan.pairBlocking);

  const deliveryPlan = planDeliveries(parse.deliveries, names, facts);
  block(BLOCKING_GROUP.mapping, deliveryPlan.blocking);

  const post = planPostCutover(nlRows, deliveryPlan.afterCandidates, facts, names, mapping);
  block(BLOCKING_GROUP.pickups, post.pickupBlocking);
  block(BLOCKING_GROUP.rounds, post.roundBlocking);
  block(BLOCKING_GROUP.crossCutover, post.xmatchBlocking);

  const nlLedger = nlRows
    .filter((r): r is ResolvedNlRow & { pair: PairRef } => r.pair !== null && !r.row.afterCutover && !post.droppedSourceKeys.has(r.row.sourceKey))
    .map((r) => nlLedgerRow(r.row, r.pair, r.itemRef));
  const postPayments = post.writtenPayments.map((r) => nlLedgerRow(r.row, r.pair as PairRef, r.itemRef));
  const ledgerRows = [...pairPlan.lifetimeRows, ...nlLedger, ...postPayments];

  const markerPlan = planMarkers(pairPlan.openings, ledgerRows, deliveryPlan, names, mapping);
  block(BLOCKING_GROUP.guard, exclusivityGuard(facts, markerPlan.touchedPairs, names));

  const v3 = pairPlan.v3.map((t) => {
    const s = post.skipped.get(t.pair.key);
    return s ? { ...t, skippedLhTt: s.lhTt, skippedLhHd: s.lhHd, skippedPaidTt: s.paidTt, skippedPaidHd: s.paidHd } : t;
  });
  const blockingGroups = [...groups.entries()].map(([group, messages]) => ({ group, messages }));
  const projectEntityName = (ref: Ref) => {
    const e = names.projectEntity(ref);
    return e ? names.label("entity", e) : null;
  };

  return {
    names,
    blockingGroups,
    requiredAcks: [...new Set([...pairPlan.requiredAcks, ...post.requiredAcks, ...markerPlan.requiredAcks])],
    dryRunAllowed: !blockingGroups.some((g) => DRY_RUN_BLOCKERS.includes(g.group)),
    newMaster: names.newMaster,
    openings: pairPlan.openings,
    ledgerRows,
    deliveries: deliveryPlan.toInsert,
    markers: markerPlan.markers,
    touchedPairs: markerPlan.touchedPairs,
    anchors: planAnchors(parse, names),
    v2: pairPlan.v2,
    v3,
    v4: {
      total: post.pickupTotal,
      matched: post.pickupMatched,
      matchedErpDeliveryIds: post.matchedErpDeliveryIds,
      expectedAfterCutover: deliveryPlan.toInsert.filter((d) => d.afterCutover).length,
    },
    views: {
      summary: buildSummary(parse),
      pairs: pairPlan.views,
      cdc: pairPlan.cdc,
      csvUnused: pairPlan.csvUnused,
      dates: buildDateViews(parse, mapping),
      pickups: post.pickups,
      payments: post.payments,
      openRounds: post.openRounds,
      crossCutover: post.crossCutover,
      deliveries: markerPlan.deliveryViews,
      newMaster: {
        entities: names.newMaster.entities.map((e) => e.name),
        suppliers: names.newMaster.suppliers.map((s) => s.name),
        projects: names.newMaster.projects.map((p) => ({ name: p.name, entityName: projectEntityName(p.ref) })),
        items: names.newMaster.items.map((i) => ({ name: i.name, unit: i.unit, type: i.type })),
      },
    },
  };
}

/** Mọi lỗi chặn dạng phẳng (cho `AdapterReview.blocking`). */
export function flattenBlocking(groups: readonly BlockingGroupView[]): string[] {
  return groups.flatMap((g) => g.messages.map((m) => `[${g.group}] ${m}`));
}
