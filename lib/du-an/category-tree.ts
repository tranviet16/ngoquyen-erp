/**
 * Dựng cây hạng mục 2 cấp từ mã ProjectCategory dạng `HM<n>-<SECTION>`
 * (vd HM1-VL, HM2-NC). Mã không theo chuẩn (vd "HM01" từ adapter cũ, "OTHER")
 * degrade thành nhóm cấp-1 độc lập, KHÔNG có tầng section và không throw.
 * Pure helper — không I/O, không "use server"; dùng chung cho các tab
 * Dự Toán / DT Điều Chỉnh / Phát Sinh.
 */

export interface CategoryLite {
  id: number;
  code: string;
  name: string;
}

export interface SectionGroup<T> {
  categoryId: number;
  /** phần sau dấu "-" của mã (VL, NC, MAY, CPC, …) */
  sectionCode: string;
  categoryName: string;
  categoryCode: string;
  rows: T[];
}

export interface HmGroup<T> {
  /** "HM1" … hoặc raw code cho category không theo chuẩn */
  hmCode: string;
  hmLabel: string;
  /** true khi nhóm sinh từ mã không theo chuẩn (không có tầng section) */
  fallback: boolean;
  sections: SectionGroup<T>[];
  /** rows của category không theo chuẩn (fallback=true) */
  directRows: T[];
}

const HM_PATTERN = /^(HM\d+)-(.+)$/;

function hmSortKey(code: string): [number, string] {
  const m = code.match(/^HM(\d+)$/);
  return m ? [Number(m[1]), ""] : [Number.MAX_SAFE_INTEGER, code];
}

export function buildCategoryTree<T>(
  rows: T[],
  getCategoryId: (row: T) => number,
  categoriesById: Map<number, CategoryLite>,
): HmGroup<T>[] {
  const rowsByCategory = new Map<number, T[]>();
  for (const row of rows) {
    const id = getCategoryId(row);
    const list = rowsByCategory.get(id) ?? [];
    list.push(row);
    rowsByCategory.set(id, list);
  }

  const groups = new Map<string, HmGroup<T>>();
  const ensureGroup = (hmCode: string, fallback: boolean): HmGroup<T> => {
    const existing = groups.get(hmCode);
    if (existing) return existing;
    const g: HmGroup<T> = { hmCode, hmLabel: hmCode, fallback, sections: [], directRows: [] };
    groups.set(hmCode, g);
    return g;
  };

  for (const [categoryId, catRows] of rowsByCategory) {
    if (catRows.length === 0) continue;
    const cat = categoriesById.get(categoryId);
    if (!cat) {
      const g = ensureGroup("Không xác định", true);
      g.directRows.push(...catRows);
      continue;
    }
    const m = cat.code.match(HM_PATTERN);
    if (m) {
      const g = ensureGroup(m[1], false);
      g.sections.push({
        categoryId,
        sectionCode: m[2],
        categoryName: cat.name,
        categoryCode: cat.code,
        rows: catRows,
      });
    } else {
      const g = ensureGroup(cat.code, true);
      g.directRows.push(...catRows);
    }
  }

  const result = [...groups.values()];
  for (const g of result) {
    g.sections.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  }
  result.sort((a, b) => {
    // nhóm chuẩn HM<n> trước, nhóm fallback sau
    if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
    const [na, sa] = hmSortKey(a.hmCode);
    const [nb, sb] = hmSortKey(b.hmCode);
    return na !== nb ? na - nb : sa.localeCompare(sb);
  });
  return result;
}
