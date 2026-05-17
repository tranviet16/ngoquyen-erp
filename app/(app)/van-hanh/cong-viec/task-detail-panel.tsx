"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { CommentSection } from "@/components/cong-viec/comment-section";
import { AttachmentSection } from "@/components/cong-viec/attachment-section";
import { SubtaskSection } from "@/components/cong-viec/subtask-section";
import type { TaskWithRelations } from "@/lib/task/task-service";
import {
  assignTaskAction,
  deleteTaskAction,
  updateTaskAction,
  getTaskActivity,
  type TaskActivityEntry,
} from "./actions";
import { useAutoSave, type AutoSaveStatus } from "./use-auto-save";

interface MemberOpt {
  id: string;
  name: string;
  email: string;
}

interface Props {
  task: TaskWithRelations;
  members: MemberOpt[];
  currentUserId: string;
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type TabKey = "subtasks" | "comments" | "files" | "activity";

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "Cần làm",
  doing: "Đang làm",
  review: "Đang duyệt",
  done: "Hoàn thành",
};

function StatusIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === "saving") return <span className="text-xs text-muted-foreground">Đang lưu…</span>;
  if (status === "saved") return <span className="text-xs text-emerald-600">Đã lưu ✓</span>;
  if (status === "error") return <span className="text-xs text-destructive">Lỗi ⚠</span>;
  return null;
}

function aggregateStatus(...arr: AutoSaveStatus[]): AutoSaveStatus {
  if (arr.includes("error")) return "error";
  if (arr.includes("saving")) return "saving";
  if (arr.includes("saved")) return "saved";
  return "idle";
}

export function TaskDetailPanel({
  task,
  members,
  currentUserId,
  canEdit,
  canAssign,
  canDelete,
  onClose,
  onChanged,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [deadline, setDeadline] = useState(
    task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : "",
  );
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [tab, setTab] = useState<TabKey>("subtasks");
  const [descMode, setDescMode] = useState<"edit" | "preview">(
    (task.description ?? "").length > 0 ? "preview" : "edit",
  );

  const titleSave = useAutoSave(title, async (v) => {
    if (!canEdit) return;
    if (v.trim().length < 3) throw new Error("Tiêu đề tối thiểu 3 ký tự");
    await updateTaskAction(task.id, { title: v });
  });

  const descSave = useAutoSave(description, async (v) => {
    if (!canEdit) return;
    await updateTaskAction(task.id, { description: v || null });
  });

  const prioritySave = useAutoSave(priority, async (v) => {
    if (!canEdit) return;
    await updateTaskAction(task.id, { priority: v as "cao" | "trung_binh" | "thap" });
  });

  const deadlineSave = useAutoSave(deadline, async (v) => {
    if (!canEdit) return;
    await updateTaskAction(task.id, { deadline: v || null });
  });

  const assigneeSave = useAutoSave(assigneeId, async (v) => {
    if (!canAssign) return;
    await assignTaskAction(task.id, v || null);
  });

  useEffect(() => {
    const errored = [titleSave, descSave, prioritySave, deadlineSave, assigneeSave].find(
      (s) => s.status === "error",
    );
    if (errored) toast.error("Lưu thất bại, kiểm tra kết nối");
  }, [titleSave, descSave, prioritySave, deadlineSave, assigneeSave]);

  const aggStatus = aggregateStatus(
    titleSave.status,
    descSave.status,
    prioritySave.status,
    deadlineSave.status,
    assigneeSave.status,
  );

  const [pendingDelete, startDelete] = useTransition();
  function doDelete() {
    if (!confirm("Xóa task này?")) return;
    startDelete(async () => {
      try {
        await deleteTaskAction(task.id);
        toast.success("Đã xóa");
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[720px] md:max-w-[720px] overflow-y-auto p-0"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b px-6 py-3">
            <div className="flex items-center gap-3">
              <SheetTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Task #{task.id}
              </SheetTitle>
              {task.sourceForm && (
                <Link
                  href={`/van-hanh/phieu-phoi-hop/${task.sourceForm.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  Từ phiếu {task.sourceForm.code}
                </Link>
              )}
            </div>
            <StatusIndicator status={aggStatus} />
          </div>

          <div className="px-6 py-4 space-y-4 border-b">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              maxLength={200}
              placeholder="Nhập tiêu đề task…"
              className="text-2xl font-semibold border-0 shadow-none px-0 focus-visible:ring-0 h-auto"
            />

            <div className="space-y-1">
              <PropertyRow label="Trạng thái" value={STATUS_LABEL[task.status] ?? task.status} readOnly />
              <PropertyRow label="Ưu tiên">
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-full max-w-[200px]"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={!canEdit}
                >
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </PropertyRow>
              <PropertyRow label="Hạn chót">
                <div className="max-w-[200px]">
                  <DateInput value={deadline} onChange={setDeadline} disabled={!canEdit} />
                </div>
              </PropertyRow>
              <PropertyRow label="Người thực hiện">
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-full max-w-[260px]"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={!canAssign}
                >
                  <option value="">— Chưa giao —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </PropertyRow>
              <PropertyRow
                label="Phòng ban"
                value={`${task.dept.code} - ${task.dept.name}`}
                readOnly
              />
              <PropertyRow
                label="Người tạo"
                value={task.creator.name ?? "—"}
                readOnly
              />
            </div>
          </div>

          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Mô tả</h3>
              <div className="flex gap-1 rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setDescMode("edit")}
                  className={`px-2 py-0.5 text-xs rounded ${descMode === "edit" ? "bg-muted" : "hover:bg-muted/50"}`}
                >
                  Soạn
                </button>
                <button
                  type="button"
                  onClick={() => setDescMode("preview")}
                  className={`px-2 py-0.5 text-xs rounded ${descMode === "preview" ? "bg-muted" : "hover:bg-muted/50"}`}
                >
                  Xem
                </button>
              </div>
            </div>
            {descMode === "edit" ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                maxLength={2000}
                placeholder="Nhập mô tả… hỗ trợ Markdown"
                className="w-full min-h-32 max-h-96 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none min-h-32 rounded-md border border-input/40 px-3 py-2">
                {description.trim().length > 0 ? (
                  <ReactMarkdown>{description}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">Chưa có mô tả</p>
                )}
              </div>
            )}
          </div>

          <div className="px-6 pt-3 border-b">
            <div className="flex gap-4 text-sm">
              {(["subtasks", "comments", "files", "activity"] as TabKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`pb-2 border-b-2 transition-colors ${
                    tab === k
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tabLabel(k)}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 flex-1">
            {tab === "subtasks" && !task.parentId && (
              <SubtaskSection parentId={task.id} members={members} canEditParent={canEdit} />
            )}
            {tab === "subtasks" && task.parentId && (
              <p className="text-sm text-muted-foreground">Đây là một subtask</p>
            )}
            {tab === "comments" && (
              <CommentSection taskId={task.id} currentUserId={currentUserId} members={members} />
            )}
            {tab === "files" && <AttachmentSection taskId={task.id} />}
            {tab === "activity" && <ActivityTab taskId={task.id} />}
          </div>

          <div className="px-6 py-3 border-t flex justify-between items-center">
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                onClick={doDelete}
                disabled={pendingDelete}
                className="text-destructive"
              >
                Xóa task
              </Button>
            ) : <div />}
            <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function tabLabel(k: TabKey) {
  switch (k) {
    case "subtasks": return "Subtasks";
    case "comments": return "Bình luận";
    case "files": return "Tệp";
    case "activity": return "Lịch sử";
  }
}

function PropertyRow({
  label,
  value,
  children,
  readOnly,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children ? (
        <div className="flex-1">{children}</div>
      ) : (
        <span className={`text-sm flex-1 ${readOnly ? "text-foreground" : ""}`}>{value}</span>
      )}
    </div>
  );
}

function ActivityTab({ taskId }: { taskId: number }) {
  const [entries, setEntries] = useState<TaskActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTaskActivity(taskId)
      .then((r) => { if (!cancelled) setEntries(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [taskId]);

  if (error) return <p className="text-sm text-destructive">Lỗi: {error}</p>;
  if (entries === null) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Chưa có thay đổi nào</p>;

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="text-sm border-l-2 border-muted pl-3">
          <div className="text-xs text-muted-foreground">
            {e.user?.name ?? "Hệ thống"} • {actionLabel(e.action)} • {formatTime(e.createdAt)}
          </div>
          {e.changes.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {e.changes.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.label}:</span>{" "}
                  <span className="text-muted-foreground line-through">{formatVal(c.before)}</span>
                  {" → "}
                  <span>{formatVal(c.after)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function actionLabel(a: string): string {
  switch (a) {
    case "create": return "tạo task";
    case "update": return "cập nhật";
    case "assign": return "phân công";
    case "move": return "chuyển trạng thái";
    case "delete": return "xóa";
    default: return a;
  }
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("vi-VN");
    return v.length > 40 ? v.slice(0, 40) + "…" : v;
  }
  return String(v);
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
