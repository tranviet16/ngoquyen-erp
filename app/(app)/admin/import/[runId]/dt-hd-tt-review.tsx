"use client";

/**
 * Màn duyệt của adapter "du-an-dt-hd-tt": chọn công trình, gắn NCC, xác nhận (thay giao dịch cũ,
 * đồng bộ dự toán, ô không đọc được), xem đồng bộ dự toán và kết quả tính lại so với file.
 * Sửa bản nháp → "Lưu & tính lại" (engine chạy lại bước duyệt) → nút Ghi ở khung bên dưới.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ImportMapping, MappingValue } from "@/lib/import/adapters/adapter-types";
import { isDtHdTtPayload } from "@/lib/import/adapters/du-an-dt-hd-tt/review-payload";
import { refreshPreviewAction } from "../import-actions";
import type { AdapterReviewProps } from "./adapter-review-types";
import type { DraftProps } from "./cutover-review-ui";
import { AckSection, DtSyncSection, GateSection, IssueSection, ProjectSection, SupplierSection } from "./dt-hd-tt-review-sections";

const stableJson = (m: ImportMapping) => JSON.stringify(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

export function DtHdTtReview(props: AdapterReviewProps) {
  const { runId, editable, reviewVersion, review } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const payload = isDtHdTtPayload(review.payload) ? review.payload : null;
  const initial = useMemo(() => {
    // NCC tự gắn được ghi rõ vào bản nháp để lần lưu sau giữ đúng lựa chọn.
    const auto: ImportMapping = {};
    for (const s of payload?.suppliers ?? []) if (s.supplierId !== null && s.how !== "chon") auto[s.key] = s.supplierId;
    return { ...auto, ...props.mapping };
  }, [props.mapping, payload]);
  const [state, setState] = useState({ version: reviewVersion, draft: initial });
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
      if (result.ok) toast.success(`Đã tính lại (v${result.reviewVersion}): ${result.blockingCount} lỗi chặn, ${result.missingAckCount} mục chưa xác nhận`);
      else toast.error(`Không lưu được: ${result.message}`);
      router.refresh();
    });
  }

  if (!payload) {
    return <div className="border rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">Chưa có kết quả duyệt (xem lỗi chặn ở trên).</div>;
  }
  const draftProps: DraftProps = { draft, setValue, editable, acks: review.acks };
  return (
    <div className="space-y-4">
      {editable && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border rounded-lg bg-background p-3 shadow-sm">
          <button type="button" onClick={save} disabled={pending} className="px-4 py-2 bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50">
            {pending ? "Đang tính lại…" : "Lưu & tính lại"}
          </button>
          <span className="text-sm text-muted-foreground">
            {dirty ? "Có thay đổi chưa lưu — số liệu bên dưới là của bản đã lưu." : `Bản xem trước v${reviewVersion}.`}
          </span>
        </div>
      )}
      <ProjectSection payload={payload} {...draftProps} />
      <SupplierSection payload={payload} {...draftProps} />
      <AckSection payload={payload} {...draftProps} />
      <DtSyncSection payload={payload} />
      <GateSection payload={payload} />
      <IssueSection payload={payload} />
    </div>
  );
}
