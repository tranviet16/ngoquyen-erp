# Validation Interview Questions

## Must answer before Phase 1 starts

1. **No negative project grant** — `ProjectGrantAll(edit)` cannot express "all projects edit, EXCEPT P5 read-only". If real requirement, define precedence: per-project row overrides super-grant even when its level is lower. Without rule, super-grant is a hammer with no exceptions.

2. **Revoke semantics: delete vs `level="none"` row** — Phase 4 treats `"default"` = delete. Phase 2 says explicit `"none"` beats fallback. So how to distinguish "I revoked Bob's access" vs "never granted"? Both end as no-row. Pick one and apply across actions, UI, verify scripts.

3. **`level="admin"` outside admin modules** — Is `ModulePermission("du-an","admin")` distinct from `"edit"`? Does it bypass `ProjectPermission` (implicit super-grant)? Plan never defines. Dropdown option is meaningless until specified.

4. **AppRole=admin short-circuit vs explicit deny** — Phase 2 says admin short-circuits at top. Contradicts "explicit beats fallback". If admin gets `ModulePermission("admin.permissions","none")` (delegated), short-circuit ignores it. Which wins?

5. **`isLeader` / `isDirector` flags don't exist yet** — Referenced for role-axis but Phase 1 schema doesn't add them. Plan C will block. Add now or declare role-axis stubbed.

6. **`comment` level on non-dept modules** — du-an / dashboard / hieu-suat have no comment concept. Restrict per-axis or declare no-op. Otherwise dropdown shows dead option.

## Must answer before Phase 4 (admin UI)

1. **Module grid scale** — 16 cols × N users. What is N today, in 2 years? Past ~200, ~3200 dropdowns kill the browser. Virtualize, paginate, or pivot to per-module page?

2. **Bulk granularity** — Spec = same level for selected modules for selected users. Ops want "viewer1+viewer2: du-an=read AND cong-no=edit" atomically. Is single-level-across-all OK for v1?

3. **Self-lockout invariant** — Only blocks self-demote on `admin.permissions`. What about last-admin demoting second-to-last? Need "min 1 admin" check or accept foot-gun.

4. **AuditLog schema fit** — Actions write `table="module_permissions"` + `oldLevel`/`newLevel`. Does existing `AuditLog` accept this shape? Confirm before coding actions.

5. **Guard duplicates `(app)/layout.tsx` session check** — both call `auth.api.getSession`. Is session lookup actually memoized (headers object identity)? Else every guard adds a round-trip.

## Must answer before Phase 5 (cutover)

1. **Notification URL backfill** — Redirects cover click-through, but does any code parse stored URLs to extract IDs? Relative or absolute with old domain? Audit notification + bookmark rows before relying on 301s.

2. **Rolling-deploy gap** — Old pod serves `/cong-viec`, new pod 301s. Mid-deploy users hit 404 for ~30s. Acceptable, or stage rollout (add new route first → redirect later → remove old last)?

3. **Seed re-run skips existing users** — If `role-defaults.ts` later changes, existing users stuck on old defaults. Need `--force-role-default` reseed and a default-drift plan.

4. **`verify-acl-parity` ground truth** — Compares `canAccess` to "what user used to do". That truth is itself a hard-coded role-routes table — duplicate of fallback. What is the canonical source? Without one, script tests fallback against itself.

5. **Rollback plan** — `DELETE FROM module_permissions` removes seed but new code still expects new schema. Document code+schema+data rollback as one unit before cutover.

## Nice to clarify (low impact)

1. **Plan B integration contract** — Should call `lib/acl/effective.ts` (re-export `getViewableDeptIds`), not `lib/dept-access.ts` directly, so effective resolver isn't bypassed.

2. **Plan C `checkRoleAxis` signature** — Specify `opts` now: `{ deptId?, scope?: "self"|"dept"|"all" }`?

3. **`MODULE_AXIS["dashboard"] = "open"`** — anonymous or any-logged-in? Guard already redirects on no-session, but document intent.

4. **Naming inconsistency** — `cong-no-vt` (dash) vs `van-hanh.cong-viec` (dot). Pick one separator for grep + label mapping.

5. **`grantedBy` nullable for seed** — audit trail loses provenance for migrated rows. Sentinel `"system-seed"` user or accept gap?

6. **`ProjectGrantAll` PK=userId** — only meaningful once Q1 (per-project override of super-grant) is decided.
