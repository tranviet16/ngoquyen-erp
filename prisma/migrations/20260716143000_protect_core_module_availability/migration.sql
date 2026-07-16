ALTER TABLE "module_availability"
ADD CONSTRAINT "module_availability_core_ready_check"
CHECK (
  "moduleKey" NOT IN ('dashboard', 'admin.permissions')
  OR "status" = 'ready'
);
