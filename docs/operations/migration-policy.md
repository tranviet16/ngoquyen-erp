# Migration policy

Use an additive deploy → measured/resumable backfill → later cleanup sequence. A destructive migration requires a named owner, approved repair/rollback decision, and a successful restore drill on a disposable database before merge.

Release candidates run `prisma migrate deploy` against a disposable database and record schema version, migration output, restore evidence, P0 permission smoke, rollout owner and rollback owner.
