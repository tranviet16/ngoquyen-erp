import { describe, it, expect } from "vitest";
import {
  FORM_STATUSES,
  TERMINAL_STATUSES,
  type FormStatus,
  type FormAction,
  nextStatus,
  statusLabel,
} from "@/lib/coordination-form/state-machine";

const ACTIONS: FormAction[] = [
  "submit",
  "leader_approve",
  "leader_reject_revise",
  "leader_reject_close",
  "resubmit",
  "cancel",
];

// The complete legal transition table, derived from the source.
const LEGAL: Record<string, FormStatus> = {
  "draft:submit": "pending_leader",
  "draft:cancel": "cancelled",
  "pending_leader:leader_approve": "approved",
  "pending_leader:leader_reject_revise": "revising",
  "pending_leader:leader_reject_close": "rejected",
  "revising:resubmit": "pending_leader",
  "revising:cancel": "cancelled",
};

describe("coordination-form nextStatus", () => {
  it("covers every status × action cell — legal moves resolve, illegal moves throw", () => {
    for (const from of FORM_STATUSES) {
      for (const action of ACTIONS) {
        const key = `${from}:${action}`;
        if (key in LEGAL) {
          expect(nextStatus(from, action)).toBe(LEGAL[key]);
        } else {
          expect(() => nextStatus(from, action)).toThrow();
        }
      }
    }
  });

  it("terminal statuses have no outgoing action", () => {
    for (const term of TERMINAL_STATUSES) {
      for (const action of ACTIONS) {
        expect(() => nextStatus(term, action)).toThrow();
      }
    }
  });

  it("throws a Vietnamese error naming the action and current status", () => {
    expect(() => nextStatus("approved", "submit")).toThrow(
      /Không thể .* khi phiếu đang ở trạng thái/,
    );
  });
});

describe("coordination-form statusLabel", () => {
  it("returns a non-empty label for every status", () => {
    for (const s of FORM_STATUSES) expect(statusLabel(s)).toBeTruthy();
    expect(statusLabel("approved")).toBe("đã duyệt");
  });
});
