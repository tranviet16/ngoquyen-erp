# Incident response

1. Record severity, sanitized correlation ID, reporter and first-seen time.
2. Establish blast radius and contain access or mutation safely; do not auto-rollback business data.
3. Preserve audit evidence and redact tokens, cookies, request bodies, full emails, money and audit JSON.
4. Assign a technical and domain owner. P0 is immediate; P1 is same business day; P2 has an owner and review date.
5. Fix the root cause, add a regression test, verify the recovery metric, then document closure.

GlitchTip is self-hosted. Platform owns deployment, DSN, backup and 30-day event retention; incident tickets are retained 12 months. DSNs stay only in the production secret store.
