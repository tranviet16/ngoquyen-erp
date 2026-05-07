"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
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
  directorApproveAction,
  directorRejectReviseAction,
  directorRejectCloseAction,
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
  draft: "bg-gray-100 text-gray-700",
  pending_leader: "bg-blue-100 text-blue-700",
  pending_director: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  revising: "bg-orange-100 text-orange-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

const ACTION_LABEL: Record<string, string> = {
  submit: "Gửi duyệt",
  resubmit: "Gửi lại",
  leader_approve: "Lãnh đạo duyệt",
  leader_reject_revise: "Lãnh đạo yêu cầu sửa",
  leader_reject_close: "Lãnh đạo từ chối",
  director_approve: "Giám đốc duyệt",
  director_reject_revise: "Giám đốc yêu cầu sửa",
  director_reject_close: "Giám đốc từ chối",
  cancel: "Hủy phiếu",
};

type RejectKind = {
  step: "leader" | "director";
  type: "revise" | "close";
};

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

  function run(name: string, fn: () => Promise<unknown>, successMsg: string) {
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
    run("submit", () => submitFormAction(form.id), "Đã gửi duyệt");
  }
  function doCancel() {
    if (!confirm("Hủy phiếu này? Hành động không thể hoàn tác.")) return;
    run("cancel", () => cancelFormAction(form.id), "Đã hủy phiếu");
  }
  function doApprove(kind: "leader" | "director") {
    const fn = kind === "leader" ? leaderApproveAction : directorApproveAction;
    run("approve", () => fn(form.id), "Đã duyệt");
  }
  function openReject(step: "leader" | "director", type: "revise" | "close") {
    setRejectComment("");
    setRejectDialog({ step, type });
  }
  function doReject() {
    if (!rejectDialog) return;
    if (rejectComment.trim().length < 5) {
      toast.error("Lý do tối thiểu 5 ký tự");
      return;
    }
    const fn =
      rejectDialog.step === "leader"
        ? rejectDialog.type === "revise"
          ? leaderRejectReviseAction
          : leaderRejectCloseAction
        : rejectDialog.type === "revise"
        ? directorRejectReviseAction
        : directorRejectCloseAction;
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
        <Link href="/phieu-phoi-hop" className="text-sm text-muted-foreground hover:underline">
          ← Quay lại danh sách
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold font-mono">{form.code}</h1>
            <p className="text-sm text-muted-foreground">
              Tạo bởi {form.creator.name} • {new Date(form.createdAt).toLocaleString("vi-VN")}
            </p>
          </div>
          <span
            className={`px-2 py-1 rounded text-sm ${
              STATUS_BADGE[form.status as FormStatus] ?? "bg-gray-100"
            }`}
          >
            {statusLabel(form.status as FormStatus)}
          </span>
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        <div className="grid grid-cols-2 gap-2 p-3 text-sm">
          <div className="text-muted-foreground">Phòng tạo:</div>
          <div>{form.creatorDept.name}</div>
        </div>
        {!editing ? (
          <>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Phòng thực hiện:</div>
              <div>{form.executorDept.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Mức ưu tiên:</div>
              <div>{PRIORITY_LABEL[form.priority] ?? form.priority}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="text-muted-foreground">Hạn chót:</div>
              <div>
                {form.deadline
                  ? new Date(form.deadline).toLocaleDateString("vi-VN")
                  : "—"}
              </div>
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
                <Input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
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

      <div className="rounded-lg border">
        <div className="border-b px-3 py-2 text-sm font-medium bg-muted/40">
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
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.signedAt).toLocaleString("vi-VN")}
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
        <div className="rounded-lg border p-3 flex flex-wrap gap-2">
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
            <Button onClick={() => doApprove("leader")} disabled={pending}>
              Duyệt (Lãnh đạo)
            </Button>
          )}
          {availableActions.includes("leader_reject_revise") && (
            <Button
              variant="outline"
              onClick={() => openReject("leader", "revise")}
              disabled={pending}
            >
              Yêu cầu sửa
            </Button>
          )}
          {availableActions.includes("leader_reject_close") && (
            <Button
              variant="destructive"
              onClick={() => openReject("leader", "close")}
              disabled={pending}
            >
              Từ chối (đóng)
            </Button>
          )}
          {availableActions.includes("director_approve") && (
            <Button onClick={() => doApprove("director")} disabled={pending}>
              Duyệt cuối (Giám đốc)
            </Button>
          )}
          {availableActions.includes("director_reject_revise") && (
            <Button
              variant="outline"
              onClick={() => openReject("director", "revise")}
              disabled={pending}
            >
              Yêu cầu sửa
            </Button>
          )}
          {availableActions.includes("director_reject_close") && (
            <Button
              variant="destructive"
              onClick={() => openReject("director", "close")}
              disabled={pending}
            >
              Từ chối (đóng)
            </Button>
          )}
          {availableActions.includes("cancel") && (
            <Button
              variant="ghost"
              className="ml-auto text-red-600 hover:text-red-700"
              onClick={doCancel}
              disabled={pending}
            >
              Hủy phiếu
            </Button>
          )}
        </div>
      )}

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
            <p className="text-sm text-red-600">
              ⚠ Hành động này sẽ đóng phiếu vĩnh viễn (không thể hoàn tác).
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
