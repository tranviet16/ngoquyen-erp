"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TASK_STATUSES, taskStatusLabel, type TaskStatus } from "@/lib/task/state-machine";
import {
  createSubtaskAction,
  deleteSubtaskAction,
  listChildrenAction,
  moveSubtaskAction,
} from "@/app/(app)/cong-viec/subtasks-actions";

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
  todo: "bg-slate-100 text-slate-700",
  doing: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
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
        <ul className="space-y-1 mb-2">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded border bg-slate-50 px-2 py-1 text-sm">
              <select
                className={`h-6 rounded border-0 px-1 text-[11px] font-medium ${STATUS_PILL[s.status] ?? ""}`}
                value={s.status}
                onChange={(e) => changeStatus(s.id, e.target.value as TaskStatus)}
                disabled={busy}
              >
                {TASK_STATUSES.map((st) => (
                  <option key={st} value={st}>{taskStatusLabel(st)}</option>
                ))}
              </select>
              <span className="flex-1 truncate" title={s.title}>{s.title}</span>
              {s.assigneeName && (
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{s.assigneeName}</span>
              )}
              {canEditParent && (
                <button
                  type="button"
                  className="text-[11px] text-red-600 hover:underline"
                  onClick={() => doDelete(s.id)}
                  disabled={busy}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
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
