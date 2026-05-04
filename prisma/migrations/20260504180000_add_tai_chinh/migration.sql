-- Phase 8: Tài chính NQ
-- Creates loan_contracts, loan_payments, journal_entries, expense_categories,
-- payable_receivable_adjustments tables.

-- CreateTable loan_contracts
CREATE TABLE "loan_contracts" (
  "id"              SERIAL          NOT NULL,
  "lenderName"      TEXT            NOT NULL,
  "principalVnd"    DECIMAL(18,2)   NOT NULL,
  "interestRatePct" DECIMAL(5,4)    NOT NULL,
  "startDate"       TIMESTAMP(3)    NOT NULL,
  "endDate"         TIMESTAMP(3)    NOT NULL,
  "paymentSchedule" TEXT            NOT NULL,
  "status"          TEXT            NOT NULL DEFAULT 'active',
  "contractDoc"     TEXT,
  "note"            TEXT,
  "deletedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_contracts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loan_contracts_status_endDate_idx" ON "loan_contracts" ("status", "endDate");

-- CreateTable loan_payments
CREATE TABLE "loan_payments" (
  "id"              SERIAL          NOT NULL,
  "loanContractId"  INTEGER         NOT NULL,
  "dueDate"         TIMESTAMP(3)    NOT NULL,
  "principalDue"    DECIMAL(18,2)   NOT NULL,
  "interestDue"     DECIMAL(18,2)   NOT NULL,
  "paidDate"        TIMESTAMP(3),
  "principalPaid"   DECIMAL(18,2),
  "interestPaid"    DECIMAL(18,2),
  "status"          TEXT            NOT NULL DEFAULT 'pending',
  "note"            TEXT,
  "deletedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loan_payments_loanContractId_fkey" FOREIGN KEY ("loanContractId") REFERENCES "loan_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "loan_payments_loanContractId_dueDate_idx" ON "loan_payments" ("loanContractId", "dueDate");
CREATE INDEX "loan_payments_dueDate_status_idx" ON "loan_payments" ("dueDate", "status");

-- CreateTable expense_categories
CREATE TABLE "expense_categories" (
  "id"        SERIAL          NOT NULL,
  "code"      TEXT            NOT NULL,
  "name"      TEXT            NOT NULL,
  "parentId"  INTEGER,
  "level"     INTEGER         NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_categories_parentId_idx" ON "expense_categories" ("parentId");

-- CreateTable journal_entries
CREATE TABLE "journal_entries" (
  "id"                SERIAL          NOT NULL,
  "date"              TIMESTAMP(3)    NOT NULL,
  "entryType"         TEXT            NOT NULL,
  "amountVnd"         DECIMAL(18,2)   NOT NULL,
  "fromAccount"       TEXT,
  "toAccount"         TEXT,
  "expenseCategoryId" INTEGER,
  "refModule"         TEXT,
  "refId"             INTEGER,
  "description"       TEXT            NOT NULL,
  "attachmentUrl"     TEXT,
  "note"              TEXT,
  "deletedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journal_entries_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "journal_entries_date_entryType_idx" ON "journal_entries" ("date", "entryType");
CREATE INDEX "journal_entries_expenseCategoryId_idx" ON "journal_entries" ("expenseCategoryId");

-- CreateTable payable_receivable_adjustments
CREATE TABLE "payable_receivable_adjustments" (
  "id"          SERIAL          NOT NULL,
  "date"        TIMESTAMP(3)    NOT NULL,
  "partyType"   TEXT            NOT NULL,
  "partyName"   TEXT            NOT NULL,
  "projectId"   INTEGER,
  "type"        TEXT            NOT NULL,
  "amountVnd"   DECIMAL(18,2)   NOT NULL,
  "dueDate"     TIMESTAMP(3),
  "status"      TEXT            NOT NULL DEFAULT 'pending',
  "note"        TEXT,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payable_receivable_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payable_receivable_adjustments_type_status_idx" ON "payable_receivable_adjustments" ("type", "status");
CREATE INDEX "payable_receivable_adjustments_projectId_idx" ON "payable_receivable_adjustments" ("projectId");
