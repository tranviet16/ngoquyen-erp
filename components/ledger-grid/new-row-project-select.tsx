"use client";

import type { SelectOption } from "@/components/data-grid";

export const NEW_ROW_PROJECT_REQUIRED_MESSAGE =
  "Chọn công trình cho dòng mới trước khi thêm dòng — công nợ vật tư theo NCC × công trình.";

interface Props {
  projects: SelectOption[];
  value: number | null;
  onChange: (projectId: number | null) => void;
}

/**
 * Bộ chọn "Công trình cho dòng mới" của lưới sổ vật tư (prop `requireProject`): lưới tạo dòng
 * ngay khi bấm "Thêm dòng", nên công trình phải được chọn trước; dòng dán từ Excel thiếu cột
 * công trình cũng lấy giá trị này.
 */
export function NewRowProjectSelect({ projects, value, onChange }: Props) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Công trình cho dòng mới</span>
      <select
        className="h-8 min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label="Công trình cho dòng mới"
      >
        <option value="">-- Chọn công trình --</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}
