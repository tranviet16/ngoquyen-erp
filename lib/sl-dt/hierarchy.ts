export function cleanHierarchyLabel(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed === "?" ? "" : trimmed;
}

export function hasHierarchyLabel(value: string | null | undefined) {
  return cleanHierarchyLabel(value).length > 0;
}

