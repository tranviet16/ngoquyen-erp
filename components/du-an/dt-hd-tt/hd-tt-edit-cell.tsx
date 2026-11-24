"use client";

/**
 * Một ô nhập H / S / X / Z của màn HĐ-TT. Bàn phím: Enter lưu rồi (khi lưu xong) xuống dòng dưới, Tab sang ô kế
 * (rời ô = lưu), Esc bỏ nháp về giá trị đang lưu. Ô lưu lỗi viền đỏ, thông báo trong `title` và ngay dưới ô;
 * nháp giữ nguyên. Ô S bị khóa ở dòng mà S làm Σ T lệch, `title` nói lý do. Màn cha giữ nháp và gọi action.
 * Hook đo: `data-edit-cell` = `${linkId}:${ô}`.
 */

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type CommitMove = "down" | null;

export interface HdTtEditCellProps {
  /** `${linkId}:${ô}` — khóa nháp, cũng là hook đo. */
  cellKey: string;
  /** Ô tiền (căn phải) hay ô chữ Z. */
  kind: "money" | "text";
  value: string;
  /** Tên ô + tên NCC, cho trình đọc màn hình. */
  label: string;
  error: string | null;
  saving: boolean;
  /** Lý do khóa (ô S ngoài quy tắc); null = nhập được. */
  disabledReason: string | null;
  onChange: (text: string) => void;
  onCommit: (text: string, move: CommitMove) => void;
  onRevert: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}

export function HdTtEditCell({ cellKey, kind, value, label, error, saving, disabledReason, onChange, onCommit, onRevert, inputRef }: HdTtEditCellProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(e.currentTarget.value, "down");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onRevert();
    }
  };
  return (
    <span className="block">
      <input
        ref={inputRef}
        type="text"
        inputMode={kind === "money" ? "decimal" : "text"}
        value={value}
        disabled={disabledReason !== null}
        title={disabledReason ?? error ?? undefined}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-busy={saving ? true : undefined}
        data-edit-cell={cellKey}
        data-edit-error={error ? "" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => onCommit(e.currentTarget.value, null)}
        className={cn(
          "h-7 rounded border bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          kind === "money" ? "w-28 text-right tabular-nums" : "w-56",
          disabledReason !== null && "cursor-not-allowed bg-muted/50 text-muted-foreground",
          error && "border-red-500 ring-1 ring-red-500",
          saving && "opacity-60",
        )}
      />
      {error && <span className="mt-0.5 block max-w-56 whitespace-normal text-[11px] leading-4 text-red-700 dark:text-red-300">{error}</span>}
    </span>
  );
}
