-- CreateIndex
CREATE INDEX "audit_logs_tableName_recordId_createdAt_idx" ON "audit_logs"("tableName", "recordId", "createdAt");
