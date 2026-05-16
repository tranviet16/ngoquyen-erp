# Flaky-test quarantine

A spec lands here ONLY as a temporary measure while its flakiness is fixed.
Quarantine is never a silent skip — every entry must carry an owner and a
tracking issue. Empty list = healthy suite.

## How to quarantine

1. Tag the flaky spec so the blocking CI jobs skip it:
   - **Playwright**: add `@flaky` to the test title; the blocking `e2e` job
     excludes it with `--grep-invert @flaky`.
   - **Vitest**: rename the failing case to `it.skip(...)` **and** add the
     entry below — a skip without an entry is a process violation.
2. Add a row to the table with owner + issue link + date.
3. The blocking jobs (`unit`, `e2e`) must stay green; `perf` is already
   non-blocking so flakiness there needs no quarantine.
4. Remove the entry and the tag once the root cause is fixed — quarantine is
   not a parking lot.

## Quarantined specs

| Spec | Layer | Owner | Issue | Quarantined | Notes |
|------|-------|-------|-------|-------------|-------|
| _(none)_ | | | | | Suite is healthy. |
