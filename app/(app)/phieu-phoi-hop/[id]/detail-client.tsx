"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { statusLabel, type FormStatus } from "@/lib/coordination-form/state-machine";
import type {
  AvailableAction,
  FormWithRelations,
} from "@/lib/coordination-form/coordination-form-service";
import {
  submitFormAction,
  cancelFormAction,
  updateDraftAction,
  leaderApproveAction,
  leaderRejectReviseAction,
  leaderRejectCloseAction,
  listAssigneeCandidatesAction,
} from "../actions";

interface DeptOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  form: FormWithRelations;
  availableActions: AvailableAction[];
  departments: DeptOption[];
}

const STATUS_BADGE: Record<FormStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
  pending_leader: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  revising: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  cancelled: "bg-muted text-muted-foreground",
};

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

const ACTION_LABEL: Record<string, string> = {
  submit: "Gửi duyệt",
  resubmit: "Gửi lại",
  leader_approve: "Trưởng phòng duyệt",
  leader_reject_revise: "Trưởng phòng yêu cầu sửa",
  leader_reject_close: "Trưởng phòng từ chối",
  cancel: "Hủy phiếu",
};

type RejectKind = { type: "revise" | "close" };
type Candidate = { id: string; name: string; email: string };

export function DetailClient({ form, availableActions, departments }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectDialog, setRejectDialog] = useState<RejectKind | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(form.content);
  const [editPriority, setEditPriority] = useState<"cao" | "trung_binh" | "thap">(
    form.priority as "cao" | "trung_binh" | "thap"
  );
  const [editDeadline, setEditDeadline] = useState(
    form.deadline ? new Date(form.deadline).toISOString().slice(0, 10) : ""
  );
  const [editExecutor, setEditExecutor] = useState<number>(form.executorDeptId);

  const [approveOpen, setApproveOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [approveComment, setApproveComment] = useState("");

  function run(fn: () => Promise<unknown>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(successMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function doSubmit() {
    run(() => submitFormAction(form.id), "Đã gửi duyệt");
  }
  function doCancel() {
    if (!confirm("Hủy phiếu này? Hành động không thể hoàn tác.")) return;
    run(() => cancelFormAction(form.id), "Đã hủy phiếu");
  }
  async function openApprove() {
    setApproveOpen(true);
    setAssigneeId("");
    setApproveComment("");
    if (!candidates) {
      setLoadingCandidates(true);
      try {
        const list = await listAssigneeCandidatesAction(form.id);
        setCandidates(list);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setApproveOpen(false);
      } finally {
        setLoadingCandidates(false);
      }
    }
  }
  function doApprove() {
    if (!assigneeId) {
      toast.error("Vui lòng chọn nhân viên phụ trách");
      return;
    }
    startTransition(async () => {
      try {
        await leaderApproveAction(form.id, assigneeId, approveComment.trim() || undefined);
        toast.success("Đã duyệt và giao việc");
        setApproveOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }
  function openReject(type: "revise" | "close") {
    setRejectComment("");
    setRejectDialog({ type });
  }
  function doReject() {
    if (!rejectDialog) return;
    if (rejectComment.trim().length < 5) {
      toast.error("Lý do tối thiểu 5 ký tự");
      return;
    }
    const fn =
      rejectDialog.type === "revise" ? leaderRejectReviseAction : leaderRejectCloseAction;
    startTransition(async () => {
      try {
        await fn(form.id, rejectComment.trim());
        toast.success("Đã xử lý từ chối");
        setRejectDialog(null);
        setRejectComment("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }
  function doSaveEdit() {
    if (editContent.trim().length < 10) {
      toast.error("Nội dung tối thiểu 10 ký tự");
      return;
    }
    startTransition(async () => {
      try {
        await updateDraftAction(form.id, {
          executorDeptId: editExecutor,
          content: editContent.trim(),
          priority: editPriority,
          deadline: editDeadline || null,
        });
        toast.success("Đã lưu");
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link
          href="/phieu-phoi-hop"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Quay lại danh sách
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">{form.code}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tạo bởi <span className="font-medium text-foreground">{form.creator.name}</span> ·{" "}
              <span className="tabular-nums">{formatDateTime(form.createdAt)}</span>
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              STATUS_BADGE[form.status as FormStatus] ?? "bg-muted"
            }`}
          >
            {statusLabel(form.status as FormStatus)}
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm divide-y">
        <div className="grid grid-cols-2 gap-2 p-3 text-sm">
          <div className="text-muted-foreground">Phòng tạo:</div>
          <div className="font-medium">{form.creatorDept.name}</div>
        </div>
        {!editing ? (
          <>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Phòng thực hiện:</div>
              <div className="font-medium">{form.executorDept.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Mức ưu tiên:</div>
              <div className="font-medium">{PRIORITY_LABEL[form.priority] ?? form.priority}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Hạn chót:</div>
              <div className="font-medium tabular-nums">{formatDate(form.deadline)}</div>
            </div>
            <div className="p-3">
              <div className="text-sm text-muted-foreground mb-1">Nội dung:</div>
              <div className="whitespace-pre-wrap text-sm">{form.content}</div>
            </div>
          </>
        ) : (
          <div className="p-3 space-y-3">
            <div>
              <Label>Phòng thực hiện</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={editExecutor}
                onChange={(e) => setEditExecutor(Number(e.target.value))}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Nội dung ({editContent.length}/2000)</Label>
              <textarea
                className="mt-1 w-full min-h-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={2000}
                rows={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mức ưu tiên</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={editPriority}
                  onChange={(e) =>
                    setEditPriority(e.target.value as "cao" | "trung_binh" | "thap")
                  }
                >
                  <option value="cao">Cao</option>
                  <option value="trung_binh">Trung bình</option>
                  <option value="thap">Thấp</option>
                </select>
              </div>
              <div>
                <Label>Hạn chót</Label>
                <DateInput
                  value={editDeadline}
                  onChange={(v) => setEditDeadline(v)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
                Hủy sửa
              </Button>
              <Button onClick={doSaveEdit} disabled={pending}>
                {pending ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-3 py-2 text-sm font-semibold bg-muted/40">
          Lịch sử ký duyệt ({form.approvals.length})
        </div>
        {form.approvals.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Chưa có lịch sử</div>
        ) : (
          <ul className="divide-y">
            {form.approvals.map((a) => (
              <li key={a.id} className="p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">
                    {a.approver.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({a.step})
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(a.signedAt)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ACTION_LABEL[a.action] ?? a.action}
                </div>
                {a.comment && (
                  <div className="mt-1 text-sm bg-muted/30 rounded px-2 py-1 whitespace-pre-wrap">
                    {a.comment}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {availableActions.length > 0 && (
        <div className="rounded-lg border bg-card p-3 shadow-sm flex flex-wrap gap-2">
          {availableActions.includes("edit") && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)} disabled={pending}>
              Sửa nội dung
            </Button>
          )}
          {availableActions.includes("submit") && (
            <Button onClick={doSubmit} disabled={pending}>
              Gửi duyệt
            </Button>
          )}
          {availableActions.includes("resubmit") && (
            <Button onClick={doSubmit} disabled={pending}>
              Gửi lại
            </Button>
          )}
          {availableActions.includes("leader_approve") && (
            <Button onClick={openApprove} disabled={pending}>
              Duyệt & giao việc
            </Button>
          )}
          {availableActions.includes("leader_reject_revise") && (
            <Button
              variant="outline"
              onClick={() => openReject("revise")}
              disabled={pending}
            >
              Yêu cầu sửa
            </Button>
          )}
          {availableActions.includes("leader_reject_close") && (
            <Button
              variant="destructive"
              onClick={() => openReject("close")}
              disabled={pending}
            >
              Từ chối (đóng)
            </Button>
          )}
          {availableActions.includes("cancel") && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive/80"
              onClick={doCancel}
              disabled={pending}
            >
              Hủy phiếu
            </Button>
          )}
        </div>
      )}

      <CrudDialog
        title="Duyệt phiếu & giao việc"
        open={approveOpen}
        onOpenChange={(o) => {
          if (!o) {
            setApproveOpen(false);
            setAssigneeId("");
            setApproveComment("");
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Chọn nhân viên phụ trách trong phòng <strong>{form.executorDept.name}</strong>. Sau khi
            duyệt, hệ thống tự tạo công việc đã giao cho người này.
          </p>
          <div>
            <Label>Nhân viên phụ trách *</Label>
            {loadingCandidates ? (
              <p className="text-xs text-muted-foreground mt-1">Đang tải danh sách...</p>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-xs text-destructive mt-1">
                Phòng thực hiện chưa có nhân viên nào.
              </p>
            ) : (
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                autoFocus
              >
                <option value="">— Chọn nhân viên —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <Label>
              Ghi chú (tuỳ chọn){" "}
              <span className="text-xs text-muted-foreground">
                ({approveComment.length}/500)
              </span>
            </Label>
            <textarea
              className="mt-1 w-full min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setApproveOpen(false);
                setAssigneeId("");
                setApproveComment("");
              }}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button onClick={doApprove} disabled={pending || !assigneeId}>
              {pending ? "Đang xử lý..." : "Duyệt & giao việc"}
            </Button>
          </div>
        </div>
      </CrudDialog>

      <CrudDialog
        title={
          rejectDialog?.type === "revise" ? "Yêu cầu sửa lại" : "Từ chối phiếu (đóng)"
        }
        open={!!rejectDialog}
        onOpenChange={(o) => {
          if (!o) {
            setRejectDialog(null);
            setRejectComment("");
          }
        }}
      >
        <div className="space-y-3">
          {rejectDialog?.type === "close" && (
            <p className="inline-flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Hành động này sẽ đóng phiếu vĩnh viễn (không thể hoàn tác).
            </p>
          )}
          <div>
            <Label>
              Lý do (tối thiểu 5 ký tự) *{" "}
              <span className="text-xs text-muted-foreground">
                ({rejectComment.length}/500)
              </span>
            </Label>
            <textarea
              className="mt-1 w-full min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              maxLength={500}
              rows={4}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectComment("");
              }}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button variant="destructive" onClick={doReject} disabled={pending}>
              {pending ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
