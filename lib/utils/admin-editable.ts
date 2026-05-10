/**
 * Admin override helper for DataGrid columns.
 *
 * Wraps a readonly rule so admins can always edit the cell regardless of the
 * normal lock. Use for workflow-locked, computed, or row-title columns where
 * the business invariant is "non-admin cannot touch this" but admin needs
 * manual override capability.
 *
 * Do NOT use for schema-key columns (foreign keys, codes used as cross-references)
 * — admin editing those breaks relational integrity.
 *
 * Companion: server-side actions must call writeAuditLog() when admin
 * persists a value to a normally-locked column.
 */
export function adminEditable<T>(
  baseRule: boolean | ((row: T, role?: string) => boolean) = true,
): (row: T, role?: string) => boolean {
  return (row, role) => {
    if (role === "admin") return false;
    if (typeof baseRule === "function") return baseRule(row, role);
    return baseRule;
  };
}
