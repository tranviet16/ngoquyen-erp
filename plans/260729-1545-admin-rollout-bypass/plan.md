# Admin bypass rollout gate

## Status

Complete

## Scope

Ensure an active admin can use every module even while its rollout status is `development`. Non-admin rollout behavior must remain fail-closed.

## Steps

1. Completed: updated each central ACL entry point that applies rollout state after determining an active admin.
2. Completed: added focused regressions for request, layout, role-write, generic ACL, and project-list paths.
3. Completed: ran focused and full unit tests plus TypeScript validation.

## Acceptance criteria

- Unauthenticated and inactive users remain denied.
- Active admin bypasses only the rollout gate in every central ACL entry point.
- Non-admin users remain blocked with `development` when a module is unreleased.
