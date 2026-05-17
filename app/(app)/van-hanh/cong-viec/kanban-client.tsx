"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import {
  TASK_STATUSES,
  taskStatusLabel,
  type TaskStatus,
} from "@/lib/task/state-machine";
import type { TaskWithRelations } from "@/lib/task/task-service";
import { regroupBySwimlane } from "@/lib/task/regroup-swimlane";
import { createTaskAction, moveTaskAction } from "./actions";
import { TaskCard } from "@/components/task/task-card";
import { TaskDetailPanel } from "./task-detail-panel";
import { ViewToggle, type ViewMode } from "@/components/task/view-toggle";
import { SwimlaneBoard } from "@/components/task/swimlane-board";
import { AssigneeMultiSelect } from "@/components/task/assignee-multi-select";
import { DeadlineRangePicker } from "@/components/task/deadline-range-picker";

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
  assigneeIds: string[];
  priority: string | null;
  fromForm: boolean | null;
  deadlineFrom: string;
  deadlineTo: string;
  includeUndated: boolean;
}

interface Props {
  byStatus: Record<TaskStatus, TaskWithRelations[]>;
  departments: DeptOpt[];
  members: MemberOpt[];
  viewableMembers: { id: string; name: string }[];
  currentUserId: string;
  currentRole: string;
  currentDeptId: number | null;
  currentIsLeader: boolean;
  currentIsDirector: boolean;
  view: ViewMode;
  filters: Filters;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-50 border-slate-300 dark:bg-slate-900/40 dark:border-slate-700",
  doing: "bg-sky-50 border-sky-300 dark:bg-sky-500/5 dark:border-sky-500/40",
  review: "bg-amber-50 border-amber-300 dark:bg-amber-500/5 dark:border-amber-500/40",
  done: "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/5 dark:border-emerald-500/40",
};

export function KanbanClient({
  byStatus,
  departments,
  members,
  viewableMembers,
  currentUserId,
  currentRole,
  currentDeptId,
  currentIsLeader,
  currentIsDirector,
  view,
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
    const overId = String(over.id);
    // Swimlane drop zones encode "swimlane:<assigneeId>:<status>" — ignore
    // the assignee portion (cross-row drag is reassignment, out of scope here)
    // and only act on the status portion.
    let toStatus: TaskStatus;
    if (overId.startsWith("swimlane:")) {
      const parts = overId.split(":");
      toStatus = parts[parts.length - 1] as TaskStatus;
    } else {
      toStatus = overId as TaskStatus;
    }
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

  function pushFilters(next: Partial<Filters>) {
    const merged: Filters = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.deptId !== null) params.set("deptId", String(merged.deptId));
    if (merged.assigneeIds.length > 0) {
      params.set("assigneeIds", merged.assigneeIds.join(","));
    } else if (merged.assigneeId) {
      params.set("assigneeId", merged.assigneeId);
    }
    if (merged.priority) params.set("priority", merged.priority);
    if (merged.fromForm !== null) params.set("fromForm", String(merged.fromForm));
    if (merged.deadlineFrom) params.set("deadlineFrom", merged.deadlineFrom);
    if (merged.deadlineTo) params.set("deadlineTo", merged.deadlineTo);
    if (!merged.includeUndated) params.set("includeUndated", "0");
    if (view === "swimlane") params.set("view", "swimlane");
    const qs = params.toString();
    router.push(`/van-hanh/cong-viec${qs ? `?${qs}` : ""}`);
  }

  function updateDept(v: string | null) {
    pushFilters({ deptId: v ? Number(v) : null });
  }
  function updatePriority(v: string | null) {
    pushFilters({ priority: v });
  }
  function updateFromForm(v: string | null) {
    pushFilters({ fromForm: v === null ? null : v === "true" });
  }
  function updateAssigneeIds(ids: string[]) {
    // Multi-select supersedes legacy single param
    pushFilters({ assigneeIds: ids, assigneeId: ids.length > 0 ? null : filters.assigneeId });
  }
  function updateDeadline(next: { from: string; to: string; includeUndated: boolean }) {
    pushFilters({
      deadlineFrom: next.from,
      deadlineTo: next.to,
      includeUndated: next.includeUndated,
    });
  }

  const canCreate = currentRole === "admin" || currentIsDirector || currentIsLeader || currentDeptId !== null;

  const swimlaneGroups = useMemo(
    () => (view === "swimlane" ? regroupBySwimlane(optimistic) : []),
    [view, optimistic],
  );

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

      <div className="flex flex-wrap gap-3 items-end justify-between rounded-lg border bg-card p-3 shadow-sm">
       <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Phòng ban</Label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.deptId !== null ? String(filters.deptId) : ""}
            onChange={(e) => updateDept(e.target.value || null)}
          >
            <option value="">— Tất cả —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Người được giao</Label>
          <div className="mt-1">
            <AssigneeMultiSelect
              options={viewableMembers}
              selected={filters.assigneeIds}
              onApply={updateAssigneeIds}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Mức ưu tiên</Label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.priority ?? ""}
            onChange={(e) => updatePriority(e.target.value || null)}
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
            onChange={(e) => updateFromForm(e.target.value || null)}
          >
            <option value="">— Tất cả —</option>
            <option value="true">Từ phiếu phối hợp</option>
            <option value="false">Tạo tay</option>
          </select>
        </div>
        <DeadlineRangePicker
          from={filters.deadlineFrom}
          to={filters.deadlineTo}
          includeUndated={filters.includeUndated}
          onChange={updateDeadline}
        />
       </div>
        <ViewToggle value={view} />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {view === "swimlane" ? (
          <SwimlaneBoard
            groups={swimlaneGroups}
            canDragTask={canDragTask}
            onClickTask={(t) => setOpenEdit(t)}
          />
        ) : (
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
        )}
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
        <TaskDetailPanel
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
          <DateInput value={deadline} onChange={(v) => setDeadline(v)} />
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
