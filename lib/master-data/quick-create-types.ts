/** Loại danh mục tạo nhanh được ngay trong ô chọn. */
export type QuickCreateKind = "supplier" | "contractor" | "entity" | "item" | "project";

export type ItemType = "material" | "labor" | "machine";

/** Bản ghi vừa tạo (hoặc bản ghi trùng tên đã có) — đủ để các ô chọn hiện và chọn nó ngay. */
export interface QuickCreatedRecord {
  kind: QuickCreateKind;
  id: number;
  name: string;
  /** Vật tư, dự án. */
  code?: string;
  /** Vật tư. */
  unit?: string;
  itemType?: ItemType;
}

export type QuickCreateResult =
  | { ok: true; record: QuickCreatedRecord }
  | {
      ok: false;
      message: string;
      /** `similar_name`: đã có bản ghi tên gần giống — hỏi người dùng rồi mới tạo tiếp. */
      code?: "similar_name";
      similar?: QuickCreatedRecord[];
    };

export const QUICK_CREATE_LABELS: Record<QuickCreateKind, string> = {
  supplier: "nhà cung cấp",
  contractor: "đội thi công",
  entity: "chủ thể",
  item: "vật tư",
  project: "dự án / công trình",
};
