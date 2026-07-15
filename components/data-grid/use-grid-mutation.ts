"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DataGridHandlers, RowWithId } from "./types";

interface PendingEdit<T> {
  rowId: number;
  col: keyof T & string;
  value: unknown;
  prevValue: unknown;
  timer: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 150;

export function useGridMutation<T extends RowWithId>(
  initialRows: T[],
  handlers: DataGridHandlers<T>,
) {
  const [rows, setRows] = useState<T[]>(initialRows);
  const pending = useRef<Map<string, PendingEdit<T>>>(new Map());
  const inflight = useRef(0);
  const [dirty, setDirty] = useState(0);

  const recomputeDirty = useCallback(() => {
    setDirty(pending.current.size + inflight.current);
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size + inflight.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const replaceRow = useCallback((rowId: number, patch: Partial<T>) => {
    setRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  const editCell = useCallback(
    (rowId: number, col: keyof T & string, value: unknown) => {
      if (!handlers.onCellEdit) return;
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      const prevValue = row[col];

      replaceRow(rowId, { [col]: value } as Partial<T>);

      const key = `${rowId}:${col}`;
      const existing = pending.current.get(key);
      if (existing) clearTimeout(existing.timer);

      const timer = setTimeout(async () => {
        pending.current.delete(key);
        inflight.current += 1;
        recomputeDirty();
        try {
          const updated = await handlers.onCellEdit!(rowId, col, value);
          if (updated) replaceRow(rowId, updated);
        } catch (e) {
          replaceRow(rowId, { [col]: prevValue } as Partial<T>);
          toast.error(e instanceof Error ? e.message : "Lỗi cập nhật");
        } finally {
          inflight.current -= 1;
          recomputeDirty();
        }
      }, DEBOUNCE_MS);

      pending.current.set(key, { rowId, col, value, prevValue, timer });
      recomputeDirty();
    },
    [handlers, replaceRow, rows, recomputeDirty],
  );

  const bulkPaste = useCallback(
    async (newRows: Partial<T>[]) => {
      if (!handlers.onBulkPaste) return;
      inflight.current += 1;
      recomputeDirty();
      try {
        const result = await handlers.onBulkPaste(newRows);
        if (result) {
          setRows((cur) => {
            const map = new Map(cur.map((r) => [r.id, r]));
            for (const r of result) map.set(r.id, r);
            return Array.from(map.values());
          });
          toast.success(`Đã cập nhật ${result.length} dòng`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi paste range");
      } finally {
        inflight.current -= 1;
        recomputeDirty();
      }
    },
    [handlers, recomputeDirty],
  );

  const addRow = useCallback(
    async (template: Partial<T>) => {
      if (!handlers.onAddRow) return;
      inflight.current += 1;
      recomputeDirty();
      try {
        const created = await handlers.onAddRow(template);
        if (created) setRows((cur) => [...cur, created]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi thêm dòng");
      } finally {
        inflight.current -= 1;
        recomputeDirty();
      }
    },
    [handlers, recomputeDirty],
  );

  const deleteRows = useCallback(
    async (ids: number[]) => {
      if (!handlers.onDeleteRows || ids.length === 0) return;
      const snapshot = rows;
      setRows((cur) => cur.filter((r) => !ids.includes(r.id)));
      inflight.current += 1;
      recomputeDirty();
      try {
        await handlers.onDeleteRows(ids);
        toast.success(`Đã xóa ${ids.length} dòng`);
      } catch (e) {
        setRows(snapshot);
        toast.error(e instanceof Error ? e.message : "Lỗi xóa dòng");
      } finally {
        inflight.current -= 1;
        recomputeDirty();
      }
    },
    [handlers, rows, recomputeDirty],
  );

  return { rows, setRows, editCell, bulkPaste, addRow, deleteRows, dirty };
}
