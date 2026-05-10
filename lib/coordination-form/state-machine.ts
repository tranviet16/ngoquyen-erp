export const FORM_STATUSES = [
  "draft",
  "pending_leader",
  "approved",
  "rejected",
  "revising",
  "cancelled",
] as const;

export type FormStatus = (typeof FORM_STATUSES)[number];

export const TERMINAL_STATUSES: FormStatus[] = ["approved", "rejected", "cancelled"];

export type FormAction =
  | "submit"
  | "leader_approve"
  | "leader_reject_revise"
  | "leader_reject_close"
  | "resubmit"
  | "cancel";

const TRANSITIONS: Record<FormStatus, Partial<Record<FormAction, FormStatus>>> = {
  draft: { submit: "pending_leader", cancel: "cancelled" },
  pending_leader: {
    leader_approve: "approved",
    leader_reject_revise: "revising",
    leader_reject_close: "rejected",
  },
  revising: { resubmit: "pending_leader", cancel: "cancelled" },
  approved: {},
  rejected: {},
  cancelled: {},
};

const ACTION_LABEL: Record<FormAction, string> = {
  submit: "gửi duyệt",
  leader_approve: "lãnh đạo duyệt",
  leader_reject_revise: "lãnh đạo yêu cầu sửa",
  leader_reject_close: "lãnh đạo từ chối",
  resubmit: "gửi lại",
  cancel: "hủy",
};

const STATUS_LABEL: Record<FormStatus, string> = {
  draft: "nháp",
  pending_leader: "chờ lãnh đạo",
  approved: "đã duyệt",
  rejected: "đã từ chối",
  revising: "đang sửa",
  cancelled: "đã hủy",
};

export function nextStatus(from: FormStatus, action: FormAction): FormStatus {
  const to = TRANSITIONS[from]?.[action];
  if (!to) {
    throw new Error(
      `Không thể ${ACTION_LABEL[action]} khi phiếu đang ở trạng thái "${STATUS_LABEL[from]}"`
    );
  }
  return to;
}

export function statusLabel(s: FormStatus): string {
  return STATUS_LABEL[s];
}
