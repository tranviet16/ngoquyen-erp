# Branch protection evidence

## Active policy

The `main` branch requires the PR branch to be up to date and these exact checks:

- `baseline`
- `security-contract`
- `e2e-security`

Performance and coverage remain informational. The protection policy was updated on 2026-07-15 by a repository administrator.

## Verification procedure

1. Push the workflow revision and open a pull request touching an ACL/API file.
2. Confirm all three checks appear and a deliberately failing security fixture blocks merge.
3. Revert the fixture, confirm the green PR can merge, and link that PR in this document.
4. Any break-glass change requires repository-admin approval and an incident record.

GitHub PR [#1](https://github.com/tranviet16/ngoquyen-erp/pull/1) merged on 2026-07-15 after `baseline`, `security-contract` and `e2e-security` completed successfully. The `main` protection API was rechecked the same day and returned those exact three required contexts.
