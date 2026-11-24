"use client";

import type { DtHdTtReviewPayload } from "@/lib/import/adapters/du-an-dt-hd-tt/review-payload";
import { AckBox, DataTable, fmt, moneyColumn, Section, type DraftProps } from "./cutover-review-ui";

type Payload = DtHdTtReviewPayload;
type Op = NonNullable<Payload["dtSync"]>["ops"][number];
type Gate = Payload["gates"][number];

const OP_LABEL = { replace: "Thay số", add: "Thêm", rename: "Đổi tên", remove: "Bỏ (file không có)" } as const;
const HOW_LABEL = { chon: "đã chọn", mst: "theo MST", ten: "theo tên" } as const;

export function ProjectSection({ payload, draft, setValue, editable }: { payload: Payload } & DraftProps) {
  const value = draft[payload.projectKey];
  return (
    <Section title="1. Công trình nhận dữ liệu">
      <select
        className="border rounded px-2 py-1 bg-background min-w-80"
        value={typeof value === "number" ? String(value) : ""}
        disabled={!editable}
        onChange={(e) => setValue(payload.projectKey, e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">— Chọn công trình —</option>
        {payload.projects.map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </select>
      <p className="text-muted-foreground">
        File: {payload.counts.dtLines} dòng dự toán · {payload.counts.invoices} dòng hóa đơn · {payload.counts.receipts} dòng thực tế nhập ·{" "}
        {payload.counts.payments} khoản chi · {payload.counts.counterparties} đầu mối · {payload.counts.aliases} dòng ánh xạ.
      </p>
    </Section>
  );
}

export function SupplierSection({ payload, draft, setValue, editable }: { payload: Payload } & DraftProps) {
  const open = payload.suppliers.filter((s) => s.supplierId === null).length;
  return (
    <Section title="2. NCC trong file ↔ NCC trong ERP" count={payload.suppliers.length}>
      {open > 0 && <p className="text-red-700 dark:text-red-300">Còn {open} NCC chưa gắn. NCC chưa có trong ERP: tạo ở Dữ liệu nền tảng rồi Lưu &amp; tính lại.</p>}
      <DataTable
        rows={payload.suppliers}
        rowKey={(r) => r.key}
        columns={[
          { key: "name", label: "NCC trong file", accessor: (r) => r.name },
          { key: "mst", label: "MST", accessor: (r) => r.mst },
          {
            key: "erp", label: "NCC trong ERP", accessor: (r) => r.supplierId ?? 0,
            render: (r) => (
              <select
                className="border rounded px-1 py-0.5 bg-background max-w-72"
                disabled={!editable}
                value={typeof draft[r.key] === "number" ? String(draft[r.key]) : r.supplierId ? String(r.supplierId) : ""}
                onChange={(e) => setValue(r.key, e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">— Chọn NCC —</option>
                {[...r.suggestions, ...payload.supplierOptions.filter((o) => !r.suggestions.some((s) => s.id === o.id))].map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ),
          },
          { key: "how", label: "Cách gắn", accessor: (r) => (r.how ? HOW_LABEL[r.how] : "chưa gắn") },
          { key: "mstFill", label: "Điền MST", accessor: (r) => (r.fillTaxCode ? "có" : "") },
        ]}
      />
    </Section>
  );
}

export function AckSection({ payload, ...draftProps }: { payload: Payload } & DraftProps) {
  if (payload.acks.length === 0) return null;
  return (
    <Section title="3. Cần xác nhận" count={payload.acks.length}>
      <ul className="space-y-1">
        {payload.acks.map((a) => (
          <li key={a.code} className="flex flex-wrap items-center gap-2">
            <AckBox code={a.code} {...draftProps} />
            <span>{a.label}</span>
          </li>
        ))}
      </ul>
      {payload.replacement && payload.replacement.otherRows > 0 && (
        <p className="text-muted-foreground">Giữ nguyên {payload.replacement.otherRows} giao dịch khác của công trình (không do import bảng cân đối ghi).</p>
      )}
    </Section>
  );
}

export function DtSyncSection({ payload }: { payload: Payload }) {
  const s = payload.dtSync;
  if (!s) return null;
  return (
    <Section title="4. Đồng bộ dự toán theo file" count={s.ops.length} open={s.ops.length > 0}>
      <p>
        Dự toán ERP {fmt(s.erpTotal)} → theo file {fmt(s.fileTotal)} (chênh {fmt(s.fileTotal - s.erpTotal)}); giữ nguyên {s.kept} dòng.
      </p>
      <DataTable
        rows={s.ops}
        rowKey={(r, i) => `${r.key}-${i}`}
        columns={[
          { key: "op", label: "Thay đổi", accessor: (r) => OP_LABEL[r.op] },
          { key: "name", label: "Dòng dự toán", accessor: (r) => r.name },
          { key: "unit", label: "ĐVT", accessor: (r) => r.unit },
          { key: "kind", label: "Loại", accessor: (r) => r.kind },
          { key: "erpQty", label: "KL ERP", kind: "number", align: "right", accessor: (r) => r.erpQty },
          { key: "fileQty", label: "KL file", kind: "number", align: "right", accessor: (r) => r.fileQty },
          moneyColumn<Op>("erpValue", "Giá trị ERP", (r) => r.erpValue),
          moneyColumn<Op>("fileValue", "Giá trị file", (r) => r.fileValue),
        ]}
      />
    </Section>
  );
}

export function GateSection({ payload }: { payload: Payload }) {
  const failed = payload.gates.filter((g) => !g.ok).length;
  return (
    <Section title="5. Kiểm: tính lại 3 báo cáo so với số trong file" count={payload.gates.length}>
      {payload.gates.length === 0 && <p className="text-muted-foreground">Chưa kiểm được — chọn công trình và gắn đủ NCC trước.</p>}
      {payload.gates.length > 0 && (failed === 0 ? <p className="text-green-700 dark:text-green-300">Tất cả khớp.</p> : <p className="text-red-700 dark:text-red-300">{failed} mục lệch.</p>)}
      <DataTable
        rows={payload.gates}
        rowKey={(r, i) => `${r.label}-${i}`}
        columns={[
          { key: "label", label: "Mục kiểm", accessor: (r) => r.label },
          moneyColumn<Gate>("expected", "Số trong file", (r) => r.expected),
          moneyColumn<Gate>("actual", "Tính lại", (r) => r.actual),
          { key: "ok", label: "", accessor: (r) => (r.ok ? "✓" : "✗"), render: (r) => <span className={r.ok ? "text-green-700" : "text-red-700"}>{r.ok ? "✓" : "✗"}</span> },
        ]}
      />
    </Section>
  );
}

export function IssueSection({ payload }: { payload: Payload }) {
  if (payload.issues.length === 0) return null;
  return (
    <Section title="6. Ô ngày / tiền không đọc được (nhập với ngày trống, giữ chữ gốc)" count={payload.issues.length} open={false}>
      <ul className="list-disc pl-5 space-y-0.5 max-h-60 overflow-auto">
        {payload.issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Section>
  );
}
