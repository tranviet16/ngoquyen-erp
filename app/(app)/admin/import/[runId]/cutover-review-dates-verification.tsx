"use client";

import type { DateDecisionView, VerificationView, V1RowView } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { AckBox, DataTable, fmt, moneyColumn, Section, type Column, type DraftProps } from "./cutover-review-ui";

const vn = (iso: string) => iso.split("-").reverse().join("/");

export function DatesSection({ dates, draft, setValue, editable }: DraftProps & { dates: DateDecisionView[] }) {
  if (dates.length === 0) return null;
  return (
    <Section title="6. Quyết định ngày mơ hồ" count={dates.length}>
      <p className="text-muted-foreground">
        Ô ngày đọc được hai cách (ngày / tháng đảo) hoặc không đọc được. Chọn ngày đúng; ô trống / không đọc được thì nhập ngày (áp cho cả nhóm
        dòng tiếp nối phía dưới).
      </p>
      <div className="space-y-2">
        {dates.map((d) => {
          const chosen = typeof draft[d.key] === "string" ? (draft[d.key] as string) : "";
          return (
            <div key={d.key} className="border rounded p-2 space-y-1">
              <div>
                <span className="font-mono">{d.file} · {d.sheet}!{d.cell}</span> — chữ gốc <b>&quot;{d.raw ?? ""}&quot;</b>
              </div>
              <div className="text-muted-foreground">{d.context}</div>
              <div className="flex flex-wrap items-center gap-3">
                {d.candidates.map((c) => (
                  <label key={c} className="inline-flex items-center gap-1">
                    <input type="radio" name={d.key} checked={chosen === c} disabled={!editable} onChange={() => setValue(d.key, c)} />
                    {vn(c)}
                  </label>
                ))}
                {d.kind !== "decision" && (
                  <input
                    type="date"
                    className="border rounded px-1 py-0.5 bg-background"
                    value={chosen}
                    disabled={!editable}
                    onChange={(e) => setValue(d.key, e.target.value || undefined)}
                  />
                )}
                {!chosen && <span className="text-amber-700 dark:text-amber-300">chưa chọn</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function VerificationSection({ verification, note, ...draftProps }: DraftProps & { verification: VerificationView | null; note: string | null }) {
  const v1Columns: Column<V1RowView>[] = [
    { key: "file", label: "File / NCC", accessor: (r) => r.file, render: (r) => <>{r.file.split("/").slice(-2).join("/")}<div className="text-muted-foreground">{r.supplierName}</div></> },
    { key: "members", label: "Công trình", accessor: (r) => r.members.join(", ") },
    { key: "y", label: "Biên Y", kind: "date", accessor: (r) => r.y, render: (r) => vn(r.y) },
    moneyColumn("erp", "Nợ ERP tại Y", (r) => r.erpDebt),
    moneyColumn("after", "Dòng > Y", (r) => r.linesAfter),
    moneyColumn("total", "Tổng nợ Excel", (r) => r.totalDebt),
    moneyColumn("diff", "Chênh", (r) => r.diff),
    {
      key: "ok",
      label: "Kết quả",
      accessor: (r) => (r.ok ? 1 : 0),
      render: (r) =>
        r.ok ? (
          <span className="text-green-700 dark:text-green-300">khớp</span>
        ) : (
          <div className="space-y-1">
            <span className="text-red-700 dark:text-red-300">lệch{r.unpricedAfter > 0 ? ` (${r.unpricedAfter} dòng > Y chưa giá)` : ""}</span>
            {r.ackCode && <AckBox code={r.ackCode} {...draftProps} label="Xác nhận lệch" />}
          </div>
        ),
    },
  ];
  return (
    <Section title="7. Đối soát (chạy thử ghi trong transaction rồi bỏ)">
      {note && <p className="text-amber-700 dark:text-amber-300">{note}</p>}
      {verification && (
        <>
          <h3 className="font-medium">V1 — Neo Excel: Σ nợ TT ERP tại Y + Σ dòng của khối có ngày &gt; Y = Tổng nợ</h3>
          <DataTable rows={verification.v1} columns={v1Columns} rowKey={(r) => r.file} />
          <h3 className="font-medium">
            V2 — Đầu kỳ 2026 = Số Dư: {verification.v2.checked - verification.v2.failures.length - verification.v2.excluded.length}/{verification.v2.checked} cặp khớp
          </h3>
          {[...verification.v2.failures, ...verification.v2.excluded].map((r) => (
            <div key={r.pairKey} className={r.note ? "text-muted-foreground" : "text-red-700 dark:text-red-300"}>
              {r.supplierName} × {r.projectName}: cần TT {fmt(r.expected.tt)} / HĐ {fmt(r.expected.hd)}, sổ có TT {fmt(r.actual.tt)} / HĐ {fmt(r.actual.hd)}
              {r.note ? ` — loại trừ: ${r.note}` : ""}
            </div>
          ))}
          <h3 className="font-medium">
            V3 — Lũy kế khớp CSV: {verification.v3.checked - verification.v3.failures.length}/{verification.v3.checked} cặp
          </h3>
          {verification.v3.failures.map((r) => (
            <div key={r.pairKey} className="text-red-700 dark:text-red-300">
              {r.supplierName} × {r.projectName}: PS tăng {fmt(r.actualLh.tt)} / CSV {fmt(r.expectedLh.tt)}; Đã trả {fmt(r.actualPaid.tt)} / CSV {fmt(r.expectedPaid.tt)}
            </div>
          ))}
          <h3 className="font-medium">
            V4 — &quot;Lấy Hàng&quot; sau mốc đã ghép phiếu: {verification.v4.matched}/{verification.v4.total}
            {verification.v4.ok ? " — đạt" : " — chưa đạt"}
          </h3>
          {!verification.v4.ok && (
            <p className="text-red-700 dark:text-red-300">
              Dòng lay_hang sau mốc trong sổ: {verification.v4.ledgerPickupsAfterCutover}; phiếu ERP đã ghép không còn: {verification.v4.missingErpDeliveries};
              phiếu sau mốc {verification.v4.insertedAfterCutover}/{verification.v4.expectedAfterCutover}.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
