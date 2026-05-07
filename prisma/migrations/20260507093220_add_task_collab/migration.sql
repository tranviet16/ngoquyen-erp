-- Task collaboration extensions: comments, attachments, sub-tasks (parentId)
-- Per plans/260507-task-collab-extensions/

-- 1) Sub-task self-relation on tasks
ALTER TABLE "tasks" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tasks_parentId_idx" ON "tasks"("parentId");

-- 2) TaskComment
CREATE TABLE "task_comments" (
  "id"        SERIAL PRIMARY KEY,
  "taskId"    INTEGER NOT NULL,
  "authorId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "editedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comments_taskId_fkey"   FOREIGN KEY ("taskId")   REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON UPDATE CASCADE
);
CREATE INDEX "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");
CREATE INDEX "task_comments_authorId_idx"         ON "task_comments"("authorId");

-- 3) TaskAttachment
CREATE TABLE "task_attachments" (
  "id"         SERIAL PRIMARY KEY,
  "taskId"     INTEGER NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "filename"   TEXT NOT NULL,
  "storedPath" TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "sizeBytes"  INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_taskId_fkey"     FOREIGN KEY ("taskId")     REFERENCES "tasks"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON UPDATE CASCADE
);
CREATE INDEX "task_attachments_taskId_createdAt_idx" ON "task_attachments"("taskId", "createdAt");
