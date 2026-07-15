---
phase: 7
title: "Nhịp vận hành, KPI và cải tiến liên tục"
status: pending
priority: P1
effort: "8h"
dependencies: [2, 3, 4, 5, 6, 8]
---

# Phase 7: Nhịp vận hành, KPI và cải tiến liên tục

## Context links

- [Plan](plan.md), [monitoring](../../docs/operations/monitoring.md), [flaky policy](../260516-comprehensive-test-suite/FLAKY-TESTS.md)

## Overview

Chuẩn hóa nhịp daily/weekly/release/monthly để loop luôn biến tín hiệu thành quyết định và regression coverage.

## Requirements

- Daily: triage P0/P1 alerts, audit failure, backup miss, denial spike, import/payment error.
- Weekly: top incident, flaky/quarantine expiry, query delta, unresolved security finding; tối đa 1–3 improvement theo dữ liệu. Cảnh báo performance mở luôn được ưu tiên đến khi `cleared`.
- Release: checklist phase 5; Monthly: threat model P0, endpoint/action/manifest drift, kill-switch cleanup.
- KPI: P0 path coverage, escaped defect, MTTD/MTTR, CI runtime/pass/flaky, audit-bypass owner, performance errors/saturation, change failure rate.

## Architecture

Signals/CI artifacts → triage board → severity/SLA → owner → fix/PR → regression test → KPI review. `Done` cho incident chỉ khi verification metric bình thường hóa.

## Related code files

- Create: `docs/operations/quality-loop.md`, `docs/operations/incident-template.md`, `docs/operations/kpi-definition.md`.
- Modify: `docs/development-roadmap.md`, `docs/project-changelog.md` khi các phase thực sự hoàn thành.

## Implementation steps

1. Publish RACI: release owner, security triager, DB recovery owner, business approver for payment/data repair.
2. Define severity by consequence: P0 unauthorized access/data exposure/wrong money; P1 broken mutation/missing audit/widespread API 5xx; P2 UX/edge case.
3. Automate report links from CI/error tracker/monitoring into issue template; require reproduction + regression reference for closure.
4. Set KPI formula, source, cadence, target direction; do not fabricate target values before 2–4 weeks of baseline.
5. Duy trì performance-warning register: link evidence, owner, RCA, fix PR, re-measurement và closure. Không đóng plan khi register còn item mở.
6. Review first two weekly cycles; remove unused alerts, tighten only stable gates, update risk manifest after every incident.

## Todo list

- [ ] RACI và SLA được owner xác nhận.
- [ ] Incident closure requires regression + verification metric.
- [ ] KPI dashboard/report có baseline period.

## Success criteria

- Mọi P0/P1 signal có assigned owner/SLA và audited closure.
- Tối thiểu hai review cycle tạo thay đổi cụ thể từ dữ liệu.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Process thành ceremony | Chỉ theo KPI/action có owner, remove no-value meeting |
| Quá nhiều KPI | Start 6 core metrics, expand only when decision changes |

## Security considerations

Incident notes and KPI exports must redact user identifiers, financial values and tokens; limit access to triage board.

## Next steps

Kế hoạch kết thúc bằng vòng lặp thường trực; phase mới chỉ tạo khi register/KPI cho thấy rủi ro có bằng chứng.
