-- CreateTable
CREATE TABLE "coordination_forms" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "creatorDeptId" INTEGER NOT NULL,
  "executorDeptId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'trung_binh',
  "deadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "coordination_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coordination_forms_code_key" ON "coordination_forms"("code");
CREATE INDEX "coordination_forms_executorDeptId_status_idx" ON "coordination_forms"("executorDeptId", "status");
CREATE INDEX "coordination_forms_creatorId_idx" ON "coordination_forms"("creatorId");
CREATE INDEX "coordination_forms_status_idx" ON "coordination_forms"("status");

-- AddForeignKey
ALTER TABLE "coordination_forms"
  ADD CONSTRAINT "coordination_forms_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "coordination_forms_creatorDeptId_fkey"
    FOREIGN KEY ("creatorDeptId") REFERENCES "departments"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "coordination_forms_executorDeptId_fkey"
    FOREIGN KEY ("executorDeptId") REFERENCES "departments"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- CreateTable
CREATE TABLE "coordination_form_approvals" (
  "id" SERIAL NOT NULL,
  "formId" INTEGER NOT NULL,
  "step" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coordination_form_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coordination_form_approvals_formId_idx" ON "coordination_form_approvals"("formId");
CREATE INDEX "coordination_form_approvals_approverId_idx" ON "coordination_form_approvals"("approverId");

-- AddForeignKey
ALTER TABLE "coordination_form_approvals"
  ADD CONSTRAINT "coordination_form_approvals_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "coordination_forms"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT "coordination_form_approvals_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
