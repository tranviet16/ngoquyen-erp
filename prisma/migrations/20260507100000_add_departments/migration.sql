-- CreateTable: departments
CREATE TABLE "departments" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- AlterTable: users
ALTER TABLE "users"
  ADD COLUMN "departmentId" INTEGER,
  ADD COLUMN "isLeader" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDirector" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
