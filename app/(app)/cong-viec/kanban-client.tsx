"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils/format";
import { Plus, Calendar, User as UserIcon, FileText } from "lucide-react";
import {
  TASK_STATUSES,
  taskStatusLabel,
  type TaskStatus,
} from "@/lib/task/state-machine";
import type { TaskWithRelations } from "@/lib/task/task-service";
import {
  assignTaskAction,
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  updateTaskAction,
} from "./actions";
import { CommentSection } from "@/components/cong-viec/comment-section";
import { AttachmentSection } from "@/components/cong-viec/attachment-section";
import { SubtaskSection } from "@/components/cong-viec/subtask-section";

interface DeptOpt {
  id: number;
  code: string;
  name: string;
}
interface MemberOpt {
  id: string;
  name: string;
  email: string;
}
interface Filters {
  deptId: number | null;
  assigneeId: string | null;
  priority: string | null;
  fromForm: boolean | null;
}

interface Props {
  byStatus: Record<TaskStatus, TaskWithRelations[]>;
  departments: DeptOpt[];
  members: MemberOpt[];
  currentUserId: string;
  currentRole: string;
  currentDeptId: number | null;
  currentIsLeader: boolean;
  currentIsDirector: boolean;
  filters: Filters;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-50 border-slate-300 dark:bg-slate-900/40 dark:border-slate-700",
  doing: "bg-sky-50 border-sky-300 dark:bg-sky-500/5 dark:border-sky-500/40",
  review: "bg-amber-50 border-amber-300 dark:bg-amber-500/5 dark:border-amber-500/40",
  done: "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/5 dark:border-emerald-500/40",
};

const PRIORITY_COLORS: Record<string, string> = {
  cao: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  trung_binh: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  thap: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
};

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

export function KanbanClient({
  byStatus,
  departments,
  members,
  currentUserId,
  currentRole,
  currentDeptId,
  currentIsLeader,
  currentIsDirector,
  filters,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(byStatus);
  // Re-sync local optimistic state when server returns a new board (e.g. after
  // changing the dept filter or after router.refresh). Without this, useState's
  // initial value sticks and filter changes don't visibly update the columns.
  useEffect(() => {
    setOptimistic(byStatus);
  }, [byStatus]);
  const [openEdit, setOpenEdit] = useState<TaskWithRelations | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function canDragTask(task: TaskWithRelations): boolean {
    if (currentRole === "admin") return true;
    if (currentIsLeader && currentDeptId === task.deptId) return true;
    if (task.assigneeId === currentUserId) return true;
    if (task.creatorId === currentUserId && !task.sourceFormId && task.status === "review") return true;
    return false;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = Number(active.id);
    const toStatus = String(over.id) as TaskStatus;
    if (!TASK_STATUSES.includes(toStatus)) return;

    const allTasks = (Object.values(optimistic) as TaskWithRelations[][]).flat();
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === toStatus) return;

    const fromStatus = task.status as TaskStatus;
    const next = { ...optimistic };
    next[fromStatus] = next[fromStatus].filter((t) => t.id !== taskId);
    next[toStatus] = [...next[toStatus], { ...task, status: toStatus }];
    setOptimistic(next);

    startTransition(async () => {
      try {
        await moveTaskAction(taskId, toStatus);
        toast.success("Đã chuyển task");
        router.refresh();
      } catch (err) {
        setOptimistic(byStatus);
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function updateFilter(key: keyof Filters, value: string | null) {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = {
      deptId: filters.deptId !== null ? String(filters.deptId) : null,
      assigneeId: filters.assigneeId,
      priority: filters.priority,
      fromForm: filters.fromForm !== null ? String(filters.fromForm) : null,
    };
    merged[key] = value;
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/cong-viec${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const canCreate = currentRole === "admin" || currentIsDirector || currentIsLeader || currentDeptId !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bảng công việc</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kéo-thả thẻ giữa các cột để cập nhật trạng thái
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Tạo task
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end rounded-lg border bg-card p-3 shadow-sm">
        <div>
          <Label className="text-xs">Phòng ban</Label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.deptId !== null ? String(filters.deptId) : ""}
            onChange={(e) => updateFilter("deptId", e.target.value || null)}
          >
            <option value="">— Tất cả —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Mức ưu tiên</Label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.priority ?? ""}
            onChange={(e) => updateFilter("priority", e.target.value || null)}
          >
            <option value="">— Tất cả —</option>
            <option value="cao">Cao</option>
            <option value="trung_binh">Trung bình</option>
            <option value="thap">Thấp</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Nguồn</Label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.fromForm === null ? "" : String(filters.fromForm)}
            onChange={(e) => updateFilter("fromForm", e.target.value || null)}
          >
            <option value="">— Tất cả —</option>
            <option value="true">Từ phiếu phối hợp</option>
            <option value="false">Tạo tay</option>
          </select>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {TASK_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={optimistic[status]}
              colorClass={STATUS_COLORS[status]}
              canDragTask={canDragTask}
              onClickTask={(t) => setOpenEdit(t)}
            />
          ))}
        </div>
      </DndContext>

      {openCreate && (
        <CreateTaskDialog
          departments={departments}
          currentDeptId={currentDeptId}
          onClose={() => setOpenCreate(false)}
          onCreated={() => {
            setOpenCreate(false);
            router.refresh();
          }}
          pending={pending}
        />
      )}
      {openEdit && (
        <EditTaskDialog
          task={openEdit}
          members={openEdit.deptId === currentDeptId ? members : []}
          currentUserId={currentUserId}
          canEdit={canEditTask(openEdit, currentUserId, currentRole, currentIsLeader, currentDeptId)}
          canAssign={canAssignTask(openEdit, currentRole, currentIsLeader, currentDeptId)}
          canDelete={canDeleteTask(openEdit, currentUserId, currentRole)}
          onClose={() => setOpenEdit(null)}
          onChanged={() => {
            setOpenEdit(null);
            router.refresh();
          }}
          pending={pending}
        />
      )}
    </div>
  );
}

function canEditTask(t: TaskWithRelations, userId: string, role: string, isLeader: boolean, deptId: number | null) {
  if (role === "admin") return true;
  if (t.creatorId === userId) return true;
  if (isLeader && deptId === t.deptId) return true;
  return false;
}
function canAssignTask(t: TaskWithRelations, role: string, isLeader: boolean, deptId: number | null) {
  if (role === "admin") return true;
  if (isLeader && deptId === t.deptId) return true;
  return false;
}
function canDeleteTask(t: TaskWithRelations, userId: string, role: string) {
  if (role === "admin") return true;
  if (t.creatorId === userId && t.status === "todo") return true;
  return false;
}

function Column({
  status,
  tasks,
  colorClass,
  canDragTask,
  onClickTask,
}: {
  status: TaskStatus;
  tasks: TaskWithRelations[];
  colorClass: string;
  canDragTask: (t: TaskWithRelations) => boolean;
  onClickTask: (t: TaskWithRelations) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 p-2 min-h-96 ${colorClass} ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-semibold text-sm tracking-tight">{taskStatusLabel(status)}</h3>
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} draggable={canDragTask(t)} onClick={() => onClickTask(t)} />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">— Trống —</p>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  draggable,
  onClick,
}: {
  task: TaskWithRelations;
  draggable: boolean;
  onClick: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable || !mounted,
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : {};
  return (
    <div
      ref={mounted ? setNodeRef : undefined}
      style={style}
      {...(mounted ? listeners : {})}
      {...(mounted ? attributes : {})}
      suppressHydrationWarning
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`rounded-md border bg-card p-2.5 shadow-sm hover:border-primary/40 transition-colors ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">{task.title}</p>
        {task.childCounts && task.childCounts.total > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap tabular-nums">
            {task.childCounts.done}/{task.childCounts.total}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 items-center text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}>
          {PRIORITY_LABEL[task.priority] ?? task.priority}
        </span>
        {task.deadline && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Calendar className="size-3" aria-hidden="true" />
            {formatDate(task.deadline)}
          </span>
        )}
        {task.assignee && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <UserIcon className="size-3" aria-hidden="true" />
            {task.assignee.name}
          </span>
        )}
        {task.sourceForm && (
          <Link
            href={`/phieu-phoi-hop/${task.sourceForm.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <FileText className="size-3" aria-hidden="true" />
            {task.sourceForm.code}
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">{task.dept.code}</p>
    </div>
  );
}

function CreateTaskDialog({
  departments,
  currentDeptId,
  onClose,
  onCreated,
  pending,
}: {
  departments: DeptOpt[];
  currentDeptId: number | null;
  onClose: () => void;
  onCreated: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deptId, setDeptId] = useState<number | "">(currentDeptId ?? "");
  const [priority, setPriority] = useState<"cao" | "trung_binh" | "thap">("trung_binh");
  const [deadline, setDeadline] = useState("");
  const [submitting, startSubmit] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (deptId === "") return toast.error("Chọn phòng ban");
    if (title.trim().length < 3) return toast.error("Tiêu đề tối thiểu 3 ký tự");
    startSubmit(async () => {
      try {
        await createTaskAction({
          title: title.trim(),
          description: description.trim() || null,
          deptId: Number(deptId),
          priority,
          deadline: deadline || null,
        });
        toast.success("Đã tạo task");
        onCreated();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Backdrop onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-lg font-bold">Tạo task mới</h2>
        <div>
          <Label>Tiêu đề *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </div>
        <div>
          <Label>Mô tả</Label>
          <textarea
            className="mt-1 w-full min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Phòng *</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))}
              required
            >
              <option value="">— Chọn —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ưu tiên</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as "cao" | "trung_binh" | "thap")}
            >
              <option value="cao">Cao</option>
              <option value="trung_binh">Trung bình</option>
              <option value="thap">Thấp</option>
            </select>
          </div>
        </div>
        <div>
          <Label>Hạn chót</Label>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting || pending}>Hủy</Button>
          <Button type="submit" disabled={submitting || pending}>
            {submitting ? "Đang tạo..." : "Tạo task"}
          </Button>
        </div>
      </form>
    </Backdrop>
  );
}

function EditTaskDialog({
  task,
  members,
  currentUserId,
  canEdit,
  canAssign,
  canDelete,
  onClose,
  onChanged,
  pending,
}: {
  task: TaskWithRelations;
  members: MemberOpt[];
  currentUserId: string;
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [deadline, setDeadline] = useState(
    task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : "",
  );
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [submitting, startSubmit] = useTransition();

  function saveEdit() {
    startSubmit(async () => {
      try {
        await updateTaskAction(task.id, {
          title,
          description: description || null,
          priority: priority as "cao" | "trung_binh" | "thap",
          deadline: deadline || null,
        });
        toast.success("Đã cập nhật");
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function saveAssign() {
    startSubmit(async () => {
      try {
        await assignTaskAction(task.id, assigneeId || null);
        toast.success("Đã phân công");
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function doDelete() {
    if (!confirm("Xóa task này?")) return;
    startSubmit(async () => {
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
    <Backdrop onClose={onClose}>
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Chi tiết task</h2>
          {task.sourceForm && (
            <Link href={`/phieu-phoi-hop/${task.sourceForm.id}`} className="text-xs text-primary hover:underline">
              Từ phiếu {task.sourceForm.code}
            </Link>
          )}
        </div>
        <div>
          <Label>Tiêu đề</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} maxLength={200} />
        </div>
        <div>
          <Label>Mô tả</Label>
          <textarea
            className="mt-1 w-full min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            maxLength={2000}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ưu tiên</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={!canEdit}
            >
              <option value="cao">Cao</option>
              <option value="trung_binh">Trung bình</option>
              <option value="thap">Thấp</option>
            </select>
          </div>
          <div>
            <Label>Hạn chót</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <div>
          <Label>Người được giao</Label>
          <div className="mt-1 flex gap-2">
            <select
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!canAssign}
            >
              <option value="">— Chưa giao —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {canAssign && (
              <Button type="button" size="sm" onClick={saveAssign} disabled={submitting || pending}>
                Lưu
              </Button>
            )}
          </div>
          {!canAssign && (
            <p className="text-xs text-muted-foreground mt-1">Chỉ lãnh đạo phòng được phân công</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Phòng: {task.dept.code} - {task.dept.name} • Người tạo: {task.creator.name}
        </p>
        {!task.parentId && (
          <SubtaskSection parentId={task.id} members={members} canEditParent={canEdit} />
        )}
        <CommentSection taskId={task.id} currentUserId={currentUserId} members={members} />
        <AttachmentSection taskId={task.id} />
        <div className="flex justify-between gap-2 pt-2 border-t">
          <div>
            {canDelete && (
              <Button type="button" variant="outline" onClick={doDelete} disabled={submitting || pending} className="text-destructive">
                Xóa
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting || pending}>Đóng</Button>
            {canEdit && (
              <Button type="button" onClick={saveEdit} disabled={submitting || pending}>
                {submitting ? "Đang lưu..." : "Lưu"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-card p-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
