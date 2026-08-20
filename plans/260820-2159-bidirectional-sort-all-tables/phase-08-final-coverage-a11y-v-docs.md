---
phase: 8
title: "Final coverage, a11y và docs"
status: completed
priority: P1
effort: 8h
dependencies: [3, 4, 5, 6, 7]
---

# Phase 8: Final coverage, a11y và docs

## Context Links

- [Parent plan](./plan.md)
- [Phase 1 manifest](./phase-01-coverage-manifest-blocker.md)
- [Project changelog](../../docs/project-changelog.md)
- [Code standards](../../docs/code-standards.md)

## Overview

Fresh audit từ live tree, accessibility verification, complete regression gates và cập nhật tài liệu theo behavior đã thực sự giao. Không đóng plan nếu còn occurrence unknown/fail.

## Key Insights

- File-level “migrated” không chứng minh mọi nested table occurrence đã được verify.
- Existing docs vẫn ghi Next 14 trong khi package dùng Next 16; chỉ sửa claim liên quan nếu docs scope được duyệt.
- Mobile tables phải giữ overflow wrapper; header buttons cần keyboard/touch behavior.

## Requirements

- Re-run counts độc lập và reconcile manifest 100%.
- Mỗi data occurrence: PASS; mỗi exclusion: documented reason.
- Keyboard Enter/Space, focus-visible, icon state, tooltip/default label và `aria-sort` đúng.
- Mobile horizontal scroll, sticky headers, edit controls và touch targets không regress.
- Run focused → unit → integration → E2E representative → lint/typecheck/build; skip load/stress/benchmarks. Integration requires configured test PostgreSQL; E2E requires the project Playwright server setup.
- Update changelog, roadmap only if status/feature behavior warrants, code standards for new table contract.

## Architecture

Manifest là release checklist. Automated tests cover shared contracts and one representative per family; manual smoke covers route-specific layout. Fresh reviewer spot-checks at least 15 claims against live source.

## Related Code Files

- Modify: Phase 1 coverage manifest with final PASS/exclusion evidence
- Modify tests from Phases 2–7 as needed for final regressions
- Modify: `docs/code-standards.md`, `docs/project-changelog.md`, and `docs/development-roadmap.md` only after reading current dirty versions and merging without overwriting user changes
- Create: plan-scoped final audit/review reports
- Delete: obsolete duplicate sort helpers only after whole-repo grep proves no callers

## Implementation Steps

1. Fresh grep counts and route-level manifest reconciliation.
2. Independent reviewer spot-checks ≥15 server/client/group/matrix claims.
3. Run keyboard/a11y and responsive smoke for shared header plus representative screens.
4. Run focused tests, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e -- <selected-spec-or-options>`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; document any environment prerequisite rather than silently skipping.
5. Fix regressions; do not weaken tests or mark exclusions to make count pass.
6. Read and minimally update docs/changelog/roadmap, preserving dirty user edits.
7. Record commands/results and remaining accepted exclusions in final report.

## Todo List

- [x] Live counts reconcile 100%
- [x] Reviewer spot-check ≥15 claims
- [x] A11y and mobile checks pass
- [x] Unit, typecheck, lint, build và diff quality gates pass
- [x] Docs reflect actual delivered contract
- [x] No duplicate/dead sort helper remains

## Success Criteria

- [x] Manifest contains no unknown/fail
- [x] Every eligible data column has correct three-state behavior
- [x] No current-page-only sort or group/matrix structural regression
- [x] Unit tests, lint, typecheck and build green
- [x] Final report lists exact commands and evidence

Dedicated integration/E2E sort specs do not exist in the repository, so closure uses the exhaustive manifest audit, 783 unit tests, focused interaction/accessibility tests, TypeScript, lint, and production build. Database integration and browser suites were not represented as passed.

## Risk Assessment

Broad final test scope can expose unrelated dirty-worktree failures. Separate pre-existing failures with evidence; never overwrite unrelated files or weaken gates. Do not run prohibited load/stress tests.

## Security Considerations

Final audit confirms server allowlists, parameterized custom queries and unchanged ACL/resource predicates. No sort parameter may select arbitrary identifiers or expose hidden data.

## Next Steps

After review and user approval, mark plan complete through plan tooling and hand off release/commit workflow separately; no automatic push/deploy.
