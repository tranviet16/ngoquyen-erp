"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fmtNum } from "@/lib/sl-dt/format";
import {
  patchMonthlyInputCell,
  patchProgressStatusCell,
} from "@/app/(app)/sl-dt/nhap-thang-moi/actions";

type NumField = "slThucKyTho" | "slTrat" | "dtThoKy" | "qtTratChua" | "dtTratKy";
type TextField = "ghiChu";

interface BaseProps {
  lotId: number;
  year: number;
  month: number;
  className?: string;
}

export function EditableNumberCell({
  lotId, year, month, field, value, className,
}: BaseProps & { field: NumField; value: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || 0));
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = Number(draft.replace(/[,\s]/g, "")) || 0;
    if (next === value) { setEditing(false); return; }
    startTransition(async () => {
      try {
        await patchMonthlyInputCell(year, month, lotId, { [field]: next });
        router.refresh();
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setDraft(String(value || 0));
      }
    });
  };

  if (editing) {
    return (
      <td className={`p-1 text-right ${className ?? ""}`}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(String(value || 0)); setEditing(false); }
          }}
          className="w-full px-1.5 py-1 text-right tabular-nums border border-primary rounded bg-background"
        />
      </td>
    );
  }
  return (
    <td
      onClick={() => setEditing(true)}
      title="Click để sửa"
      className={`p-2 text-right tabular-nums cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary/40 ${className ?? ""}`}
    >
      {fmtNum(value)}
    </td>
  );
}

export function EditableTextCell({
  lotId, year, month, field, value, className,
}: BaseProps & { field: TextField; value: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim() || null;
    if (next === (value ?? null)) { setEditing(false); return; }
    startTransition(async () => {
      try {
        await patchProgressStatusCell(year, month, lotId, { [field]: next });
        router.refresh();
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setDraft(value ?? "");
      }
    });
  };

  if (editing) {
    return (
      <td className={`p-1 ${className ?? ""}`}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="w-full px-1.5 py-1 border border-primary rounded bg-background"
        />
      </td>
    );
  }
  return (
    <td
      onClick={() => setEditing(true)}
      title="Click để sửa"
      className={`p-2 cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary/40 ${className ?? ""}`}
    >
      {value ?? <span className="text-muted-foreground italic">—</span>}
    </td>
  );
}
