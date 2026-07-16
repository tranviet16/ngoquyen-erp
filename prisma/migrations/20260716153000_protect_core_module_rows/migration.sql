CREATE OR REPLACE FUNCTION prevent_core_module_availability_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD."moduleKey" IN ('dashboard', 'admin.permissions') THEN
    RAISE EXCEPTION 'core module availability rows cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_core_module_availability_delete
BEFORE DELETE ON module_availability
FOR EACH ROW
EXECUTE FUNCTION prevent_core_module_availability_delete();
