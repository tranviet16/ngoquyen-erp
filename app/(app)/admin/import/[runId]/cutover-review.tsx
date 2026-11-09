"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ImportMapping, MappingValue } from "@/lib/import/adapters/adapter-types";
import type { CutoverReviewPayload } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { refreshPreviewAction } from "../import-actions";
import type { AdapterReviewProps } from "./adapter-review-types";
import { DatesSection, VerificationSection } from "./cutover-review-dates-verification";
import { MappingSection } from "./cutover-review-mapping";
import { CdcSection, PairsSection } from "./cutover-review-pairs";
import { DeliveriesSection, DiagnosticSection, NewMasterSection, PostCutoverSection } from "./cutover-review-post-cutover";
import { fmt, Section, type DraftProps } from "./cutover-review-ui";

function isPayload(p: unknown): p is CutoverReviewPayload {
  return typeof p === "object" && p !== null && (p as { version?: unknown }).version === 1 && Array.isArray((p as { mapping?: unknown }).mapping);
}

/** Bản nháp = mapping đã lưu + giá trị tự điền (để lần lưu sau ghi rõ thành ánh xạ đã chọn). */
function initialDraft(mapping: ImportMapping, payload: CutoverReviewPayload | null): ImportMapping {
  const auto: ImportMapping = {};
  for (const e of payload?.mapping ?? []) if (e.auto && e.effective !== undefined) auto[e.key] = e.effective;
  return { ...auto, ...mapping };
}

const stableJson = (m: ImportMapping) => JSON.stringify(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

function SummarySection({ payload }: { payload: CutoverReviewPayload }) {
  const s = payload.summary;
  return (
    <Section title="1. Tóm tắt">
      <div className="grid gap-1 md:grid-cols-2">
        <div>File tổng: {s.files.main ?? <b className="text-red-700">thiếu</b>}</div>
        <div>CSV lũy kế: {s.files.csv ?? "không có"}</div>
        <div>File theo dõi: {s.files.tracking}</div>
        <div>File bỏ qua: {s.files.skipped.length}</div>
        <div>
          Nhập Liệu: {s.nhapLieu.read} dòng — lấy hàng {s.nhapLieu.layHang}, thuế HĐ {s.nhapLieu.thueHd}, trả nợ {s.nhapLieu.thanhToan}; sau mốc{" "}
          {s.nhapLieu.afterCutover}; bỏ {s.nhapLieu.skipped.length}
        </div>
        <div>Số Dư: {s.openingRows} dòng · CSV: {s.csvRows} dòng hợp đồng (bỏ {s.csvSkipped.length})</div>
        <div>
          Phiếu: {s.deliveries.kept} sau khử trùng (gộp {s.deliveries.duplicatesMerged}, từ Vật tư ngày {s.deliveries.fromDailySheet}, chờ chọn ngày{" "}
          {s.deliveries.pendingDate})
        </div>
        <div>Ngày đã sửa năm: {s.dateFixes} · Marker sẽ tạo: {payload.markers}</div>
      </div>
      <details>
        <summary className="cursor-pointer">Dòng bỏ qua và cảnh báo ({s.nhapLieu.skipped.length + s.csvSkipped.length + s.files.skipped.length + s.warnings.length})</summary>
        <ul className="list-disc pl-5 mt-2 space-y-0.5 max-h-80 overflow-auto">
          {s.files.skipped.map((f) => (
            <li key={`f-${f.path}`}>{f.path}: {f.reason}</li>
          ))}
          {[...s.nhapLieu.skipped, ...s.csvSkipped].map((r) => (
            <li key={`r-${r.sourceKey}`}>{r.sourceKey}: {r.reason}</li>
          ))}
          {s.warnings.map((w, i) => (
            <li key={`w-${i}`} className={w.level === "warning" ? "" : "text-muted-foreground"}>
              [{w.code}] {w.where}: {w.message}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

function BlockingSection({ payload }: { payload: CutoverReviewPayload }) {
  const total = payload.blockingGroups.reduce((n, g) => n + g.messages.length, 0);
  return (
    <Section title="2. Lỗi chặn" count={total}>
      {total === 0 ? (
        <p className="text-green-700 dark:text-green-300">Không còn lỗi chặn.</p>
      ) : (
        payload.blockingGroups.map((g) => (
          <div key={g.group}>
            <h3 className="font-medium text-red-700 dark:text-red-300">{g.group} ({g.messages.length})</h3>
            <ul className="list-disc pl-5 space-y-0.5 max-h-60 overflow-auto">
              {g.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Section>
  );
}

function CommittedSummary({ expected }: { expected: Record<string, unknown> }) {
  const counts = (expected.counts ?? {}) as Record<string, number>;
  const created = (expected.created ?? {}) as Record<string, unknown[]>;
  return (
    <div className="border rounded-lg p-4 text-sm space-y-1 bg-green-50 dark:bg-green-500/10">
      <h2 className="font-semibold">Đã ghi — mốc chuyển đổi {String(expected.cutoverDate ?? "?")}</h2>
      <p>
        Số dư {fmt(counts.openings)} · lũy kế {fmt(counts.lifetimeRows)} · Nhập Liệu {fmt(counts.nhapLieuRows)} · Trả Nợ sau mốc{" "}
        {fmt(counts.postCutoverPayments)} · phiếu tới mốc {fmt(counts.deliveriesBefore)} / sau mốc {fmt(counts.deliveriesAfter)} · marker{" "}
        {fmt(counts.markers)}
      </p>
      <p>
        Danh mục đã tạo: Chủ thể {created.entities?.length ?? 0}, NCC {created.suppliers?.length ?? 0}, công trình {created.projects?.length ?? 0}, vật
        tư {created.items?.length ?? 0}.
      </p>
    </div>
  );
}

export function CutoverReview(props: AdapterReviewProps) {
  const { runId, editable, reviewVersion, review } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const payload = isPayload(review.payload) ? review.payload : null;
  const initial = useMemo(() => initialDraft(props.mapping, payload), [props.mapping, payload]);
  const [state, setState] = useState({ version: reviewVersion, draft: initial });
  // Phiên bản review mới (sau "Lưu & tính lại") → bỏ bản nháp cũ.
  if (state.version !== reviewVersion) setState({ version: reviewVersion, draft: initial });
  const draft = state.draft;

  const setValue = (key: string, value: MappingValue | undefined) =>
    setState((prev) => {
      const next = { ...prev.draft };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...prev, draft: next };
    });
  const dirty = stableJson(draft) !== stableJson(initial);

  function save() {
    startTransition(async () => {
      const result = await refreshPreviewAction(runId, draft);
      if (result.ok) {
        toast.success(`Đã tính lại (v${result.reviewVersion}): ${result.blockingCount} lỗi chặn, ${result.missingAckCount} mục chưa xác nhận`);
      } else {
        toast.error(`Không lưu được: ${result.message}`);
      }
      router.refresh();
    });
  }

  if (!payload) {
    return (
      <div className="border rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">
        Chưa có kết quả duyệt của lần chuyển đổi (bước duyệt lỗi — xem danh sách lỗi chặn ở trên).
        {editable && (
          <button type="button" className="ml-3 px-3 py-1 border rounded" disabled={pending} onClick={save}>
            Lưu &amp; tính lại
          </button>
        )}
      </div>
    );
  }

  const draftProps: DraftProps = { draft, setValue, editable, acks: review.acks };
  return (
    <div className="space-y-4">
      {review.expected && <CommittedSummary expected={review.expected} />}
      {editable && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border rounded-lg bg-background p-3 shadow-sm">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="px-4 py-2 bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Đang tính lại…" : "Lưu & tính lại"}
          </button>
          <span className="text-sm text-muted-foreground">
            {dirty ? "Có thay đổi chưa lưu — số liệu bên dưới là của bản đã lưu." : `Bản xem trước v${reviewVersion}.`}
          </span>
        </div>
      )}
      <SummarySection payload={payload} />
      <BlockingSection payload={payload} />
      <MappingSection entries={payload.mapping} catalog={payload.catalog} {...draftProps} />
      <CdcSection rows={payload.cdc} catalog={payload.catalog} {...draftProps} />
      <PairsSection pairs={payload.pairs} csvUnused={payload.csvUnused} {...draftProps} />
      <DatesSection dates={payload.dates} {...draftProps} />
      <VerificationSection verification={payload.verification} note={payload.dryRunNote} {...draftProps} />
      <PostCutoverSection post={payload.postCutover} {...draftProps} />
      <DiagnosticSection rows={payload.diagnostic} />
      <DeliveriesSection rows={payload.deliveries} {...draftProps} />
      <NewMasterSection data={payload.newMaster} />
    </div>
  );
}
