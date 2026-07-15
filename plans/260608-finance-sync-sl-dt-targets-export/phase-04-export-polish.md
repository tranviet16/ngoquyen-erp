# Phase 04 - Export Polish

## Overview

Priority: medium
Status: implemented

Improve report export quality. Excel first, PDF second.

## Recommendation

- Keep current browser print PDF for now, improve print CSS only where needed.
- Upgrade Excel formatting in the existing `xlsx` builder before adding a new dependency.
- Consider `exceljs` only if SheetJS styling is insufficient for target reports.

## Related Code Files

- `lib/export/excel-exporter.ts`
- `lib/export/templates/*.ts`
- `app/globals.css` print section
- `components/export-buttons.tsx`

## Success Criteria

- Excel exports have title, frozen header, widths, number formats, totals, and print setup.
- Export visual quality is close to on-site reports for key templates.

## Implementation Notes

- Enhanced the shared SheetJS exporter with merged title rows, frozen header, autofilter, row heights, margins, and number formats.
- Kept PDF as browser print path for now per plan decision.
