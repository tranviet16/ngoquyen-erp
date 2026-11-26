"use client";

/**
 * Ô chọn "Loại NCC" (Tất cả / Vật tư / Nhân công) dùng chung cho bộ lọc báo cáo công nợ vật tư.
 * Giá trị `null` = tất cả loại (URL không có tham số `loai`).
 */

import { Label } from "@/components/ui/label";
import {
  SUPPLIER_KIND_OPTIONS,
  parseSupplierKind,
  type SupplierKind,
} from "@/lib/master-data/supplier-kind";

interface Props {
  id: string;
  value: SupplierKind | null;
  onChange: (value: SupplierKind | null) => void;
}

export function SupplierKindSelect({ id, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Loại NCC</Label>
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm"
        value={value ?? ""}
        onChange={(e) => onChange(parseSupplierKind(e.target.value))}
      >
        <option value="">Tất cả</option>
        {SUPPLIER_KIND_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
