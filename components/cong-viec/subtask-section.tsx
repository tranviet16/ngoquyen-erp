"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TASK_STATUSES, taskStatusLabel, type TaskStatus } from "@/lib/task/state-machine";
import {
  createSubtaskAction,
  deleteSubtaskAction,
  listChildrenAction,
  moveSubtaskAction,
  reorderSubtasksAction,
} from "@/app/(app)/van-hanh/cong-viec/subtasks-actions";

interface SubtaskRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string | Date;
}

interface MemberOpt {
  id: string;
  name: string;
}

interface Props {
  parentId: number;
  members: MemberOpt[];
  canEditParent: boolean;
}

const STATUS_PILL: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  doing: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export function SubtaskSection({ parentId, members, canEditParent }: Props) {
  const [items, setItems] = useState<SubtaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, startBusy] = useTransition();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAssignee, setDraftAssignee] = useState("");

  async function load() {
    try {
      const rows = await listChildrenAction(parentId);
      setItems(rows as SubtaskRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  function submitNew() {
    const title = draftTitle.trim();
    if (!title) return;
    startBusy(async () => {
      try {
        const row = await createSubtaskAction(parentId, {
          title,
          assigneeId: draftAssignee || null,
        });
        setItems((cur) => [...cur, row as SubtaskRow]);
        setDraftTitle("");
        setDraftAssignee("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function changeStatus(id: number, to: TaskStatus) {
    startBusy(async () => {
      try {
        await moveSubtaskAction(id, to);
        setItems((cur) => cur.map((s) => (s.id === id ? { ...s, status: to } : s)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    const prev = items;
    setItems(next);
    startBusy(async () => {
      try {
        await reorderSubtasksAction(parentId, next.map((s) => s.id));
      } catch (err) {
        setItems(prev);
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function doDelete(id: number) {
    if (!confirm("Xoá việc nhỏ này?")) return;
    startBusy(async () => {
      try {
        await deleteSubtaskAction(id);
        setItems((cur) => cur.filter((s) => s.id !== id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const done = items.filter((s) => s.status === "done").length;

  return (
    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold mb-2">
        Việc nhỏ ({done}/{items.length})
      </h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-2">Chưa có việc nhỏ.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1 mb-2">
              {items.map((s) => (
                <SortableSubtaskRow
                  key={s.id}
                  row={s}
                  busy={busy}
                  canEditParent={canEditParent}
                  onChangeStatus={changeStatus}
                  onDelete={doDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canEditParent && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              placeholder="Thêm việc nhỏ…"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNew();
                }
              }}
              disabled={busy}
            />
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={draftAssignee}
              onChange={(e) => setDraftAssignee(e.target.value)}
              disabled={busy}
            >
              <option value="">— Người làm —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={submitNew} disabled={busy || !draftTitle.trim()}>
              Thêm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  row: SubtaskRow;
  busy: boolean;
  canEditParent: boolean;
  onChangeStatus: (id: number, to: TaskStatus) => void;
  onDelete: (id: number) => void;
}

function SortableSubtaskRow({ row, busy, canEditParent, onChangeStatus, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border bg-slate-50 px-2 py-1 text-sm"
    >
      {canEditParent && (
        <button
          type="button"
          className="cursor-grab text-slate-400 hover:text-slate-700 select-none px-1"
          aria-label="Kéo để sắp xếp"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      )}
      <select
        className={`h-6 rounded border-0 px-1 text-[11px] font-medium ${STATUS_PILL[row.status] ?? ""}`}
        value={row.status}
        onChange={(e) => onChangeStatus(row.id, e.target.value as TaskStatus)}
        disabled={busy}
      >
        {TASK_STATUSES.map((st) => (
          <option key={st} value={st}>{taskStatusLabel(st)}</option>
        ))}
      </select>
      <span className="flex-1 truncate" title={row.title}>{row.title}</span>
      {row.assigneeName && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{row.assigneeName}</span>
      )}
      {canEditParent && (
        <button
          type="button"
          className="text-[11px] text-red-600 hover:underline"
          onClick={() => onDelete(row.id)}
          disabled={busy}
        >
          ✕
        </button>
      )}
    </li>
  );
}
