/**
 * Loại chi phí VL / NC / MTC theo hậu tố mã hạng mục. Tách khỏi keys.ts (module đó kéo Prisma) để các
 * module an toàn cho bundle client — như screen-links.ts — dùng được cùng một quy tắc với báo cáo.
 */

export type CostKind = "VL" | "NC" | "MTC";

/** Loại chi phí của hạng mục theo hậu tố mã (HM1-VL, HM1-NC, HM1-MAY…); null = không phải VL/NC/MTC. */
export function kindOfCategoryCode(code: string): CostKind | null {
  const suffix = code.trim().toUpperCase().split("-").pop();
  if (suffix === "VL") return "VL";
  if (suffix === "NC") return "NC";
  if (suffix === "MAY" || suffix === "MTC") return "MTC";
  return null;
}
