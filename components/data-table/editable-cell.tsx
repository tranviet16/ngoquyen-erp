"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface EditOption {
  id: string;
  name: string;
}

interface EditableCellProps<T extends Record<string, unknown>> {
  row: T;
  colKey: string;
  editKind?: "text" | "number" | "boolean" | "select";
  editOptions?: EditOption[];
  parseEdit?: (raw: string) => unknown;
  onCellEdit: (row: T, key: string, value: unknown) => Promise<T | void>;
  onPendingChange: (delta: number) => void;
  children: React.ReactNode;
  className?: string;
}

export function EditableCell<T extends Record<string, unknown>>({
  row,
  colKey,
  editKind = "text",
  editOptions,
  parseEdit,
  onCellEdit,
  onPendingChange,
  children,
  className,
}: EditableCellProps<T>) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const committingRef = useRef(false);

  const rawValue = row[colKey];

  const startEdit = () => {
    if (saving) return;
    const initial =
      rawValue === null || rawValue === undefined ? "" : String(rawValue);
    setInputVal(initial);
    setEditing(true);
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
  };

  const commit = async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    setEditing(false);
    const raw = inputVal;
    const parsed: unknown = parseEdit
      ? parseEdit(raw)
      : editKind === "number"
      ? raw === "" ? null : Number(raw)
      : editKind === "boolean"
      ? raw === "true"
      : raw;

    if (parsed === rawValue) {
      committingRef.current = false;
      return;
    }

    setSaving(true);
    onPendingChange(+1);
    try {
      await onCellEdit(row, colKey, parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không lưu được";
      toast.error(msg);
    } finally {
      setSaving(false);
      onPendingChange(-1);
      committingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      cancel();
    }
  };

  const sharedInputClass =
    "h-7 w-full text-xs px-1 border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary";

  const renderInput = () => {
    if (editKind === "select" || editKind === "boolean") {
      const options: EditOption[] =
        editKind === "boolean"
          ? [{ id: "true", name: "Có" }, { id: "false", name: "Không" }]
          : (editOptions ?? []).slice(0, 200);

      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          className={sharedInputClass}
        >
          <option value="">--</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={editKind === "number" ? "number" : "text"}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className={sharedInputClass}
      />
    );
  };

  return (
    <TableCell
      className={cn("relative", className)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      onClick={(e) => editing && e.stopPropagation()}
    >
      {editing ? (
        renderInput()
      ) : (
        <span
          className={cn(
            "block",
            saving && "opacity-50",
            !saving && "cursor-text"
          )}
          title={saving ? "Đang lưu..." : "Nhấn đúp để sửa"}
        >
          {children}
        </span>
      )}
    </TableCell>
  );
}
