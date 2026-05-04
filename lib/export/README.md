# Export

## Excel Export (SheetJS)

Generic builder in `excel-exporter.ts`. 4 priority templates:
- `cong-no-monthly.ts` — báo cáo tháng công nợ (material + labor)
- `doi-chieu.ts` — đối chiếu công nợ (debt reconciliation)
- `du-toan.ts` — dự toán (project estimate)
- `sl-dt.ts` — báo cáo SL-DT (production/revenue report)

API: `POST /api/export/excel` with `{ template, params }`.

## PDF Export Decision

**Phase 1: browser print only.** No Puppeteer/Chromium dependency.
Rationale: saves ~200MB Docker image; "in ra để ký" use case works fine
with `window.print()` + `@media print` CSS in `app/globals.css`.

If server-side PDF generation is required in future phases, add
`puppeteer` as an optional dependency and create `pdf-exporter.ts`.
