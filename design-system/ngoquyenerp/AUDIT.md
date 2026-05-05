# UI Audit — NgoQuyenERP vs MASTER.md

**Date:** 2026-05-04
**Source:** design-system/ngoquyenerp/MASTER.md

## Findings (priority order)

### P1 — Color tokens (globals.css)
- **Issue:** Theme is pure grayscale `oklch(... 0 0)`. No brand identity.
- **Required:** Primary `#2563EB`, Secondary `#3B82F6`, CTA `#F97316`, BG `#F8FAFC`, Text `#1E293B`.
- **Action:** Replace `:root` block in app/globals.css with brand tokens.

### P1 — Vietnamese typography (layout.tsx)
- **Issue:** Loads only `Geist` (Latin subset). Vietnamese diacritics fall back to system font → inconsistent rendering.
- **Required:** Be Vietnam Pro (heading) + Noto Sans (body).
- **Action:** Swap font import in app/layout.tsx; wire `--font-sans` in globals.css.

### P4 — Icon anti-pattern (app-sidebar.tsx)
- **Issue:** Text-based fake icons (`DB`, `DA`, `VT`, `CV`, `CN`, `SL`, `TC`, `IM`) inside `<span>` boxes.
- **Required:** SVG icons (Lucide already in package.json).
- **Action:** Map each route to a Lucide icon component.

### P1 — Token chain broken
- **Issue:** `globals.css` references `var(--font-sans)` but layout only sets `--font-geist-sans`.
- **Action:** Set `--font-sans` to the Be Vietnam Pro CSS var in body.

## Already compliant
- `lang="vi"` on `<html>` ✓
- `<Toaster richColors>` provides aria-live feedback ✓
- Print stylesheet hides nav, expands tables ✓
- `font-display: swap` (Next/font default) ✓
- shadcn/ui base provides focus-visible rings, ≥44px touch targets ✓

## Out-of-scope deferrals
- Bottom-nav for mobile — system is desktop-first internal tool, sidebar is fine
- Reduced-motion CSS — shadcn/ui v4 already respects `prefers-reduced-motion`
- Chart accessibility audit — Phase 8 dashboard uses native SVG; titles/legends already present
- Dark-mode tuning — Phase 1 is light-mode only per scope
