-- CreateView: vw_ledger_party
-- Polymorphic join: maps partyId to either suppliers (material) or contractors (labor).
-- Used for reporting only; not imported into Prisma client (raw SQL access only).

CREATE OR REPLACE VIEW "vw_ledger_party" AS
  SELECT
    lt.*,
    s.name AS party_name
  FROM ledger_transactions lt
  JOIN suppliers s ON lt."partyId" = s.id
  WHERE lt."ledgerType" = 'material'
    AND lt."deletedAt" IS NULL
UNION ALL
  SELECT
    lt.*,
    c.name AS party_name
  FROM ledger_transactions lt
  JOIN contractors c ON lt."partyId" = c.id
  WHERE lt."ledgerType" = 'labor'
    AND lt."deletedAt" IS NULL;
