"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MODULE_KEYS, MODULE_LEVELS } from "@/lib/acl/modules";
import type { ModuleKey, AccessLevel } from "@/lib/acl/modules";
import type { MODULE_LABELS } from "@/lib/acl/module-labels";
import {
  bulkApplyModulePermissionChanges,
  type ModulePermissionChange,
} from "../actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  name: string;
  role: string;
  deptName: string | null;
};

type PermissionsMap = Map<string, Map<ModuleKey, AccessLevel>>;

type CellKey = `${string}:${ModuleKey}`;

type Props = {
  users: UserRow[];
  permissions: PermissionsMap;
  moduleLabels: Record<ModuleKey, string>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cellKey(userId: string, moduleKey: ModuleKey): CellKey {
  return `${userId}:${moduleKey}` as CellKey;
}

function getLevelOptions(moduleKey: ModuleKey): readonly (AccessLevel | "default")[] {
  return ["default", ...MODULE_LEVELS[moduleKey]] as const;
}

function levelLabel(level: AccessLevel | "default"): string {
  if (level === "default") return "Mặc định";
  if (level === "read") return "Xem";
  if (level === "comment") return "Bình luận";
  if (level === "edit") return "Chỉnh sửa";
  if (level === "admin") return "Admin";
  return level;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ModulePermissionGrid({
  users,
  permissions,
  moduleLabels,
}: Props) {
  const [pending, setPending] = useState<Map<CellKey, AccessLevel | "default">>(
    new Map(),
  );
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.size > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pending.size]);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  }

  function getValue(userId: string, moduleKey: ModuleKey): AccessLevel | "default" {
    const key = cellKey(userId, moduleKey);
    if (pending.has(key)) return pending.get(key)!;
    return permissions.get(userId)?.get(moduleKey) ?? "default";
  }

  function handleCellChange(
    userId: string,
    moduleKey: ModuleKey,
    value: AccessLevel | "default",
  ) {
    setPending((prev) => {
      const next = new Map(prev);
      const key = cellKey(userId, moduleKey);
      const original = permissions.get(userId)?.get(moduleKey) ?? "default";
      if (value === original) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }

  function isDirty(userId: string, moduleKey: ModuleKey): boolean {
    return pending.has(cellKey(userId, moduleKey));
  }

  function handleCancel() {
    setPending(new Map());
  }

  function handleSaveClick() {
    // Check if any pending change grants admin level
    const hasAdminGrant = Array.from(pending.values()).some((v) => v === "admin");
    if (hasAdminGrant) {
      setShowConfirm(true);
    } else {
      commitChanges();
    }
  }

  function commitChanges() {
    setShowConfirm(false);
    const changes: ModulePermissionChange[] = [];
    for (const [key, level] of pending.entries()) {
      const [userId, ...rest] = key.split(":");
      const moduleKey = rest.join(":") as ModuleKey;
      changes.push({ userId, moduleKey, level });
    }

    startTransition(async () => {
      try {
        const result = await bulkApplyModulePermissionChanges(changes);
        setPending(new Map());
        if (result.rejected.length > 0) {
          const rejectedList = result.rejected
            .map((r) => `• ${r.change.userId}/${r.change.moduleKey}: ${r.reason}`)
            .join("\n");
          showToast(
            `Đã lưu ${result.applied} thay đổi. ${result.rejected.length} bị từ chối:\n${rejectedList}`,
          );
        } else {
          showToast(`Đã lưu ${result.applied} thay đổi thành công.`);
        }
      } catch (err) {
        showToast(
          `Lỗi khi lưu: ${err instanceof Error ? err.message : "Lỗi không xác định"}`,
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {pending.size > 0
            ? `${pending.size} thay đổi chưa lưu`
            : "Không có thay đổi chưa lưu"}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={pending.size === 0 || isPending}
          >
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleSaveClick}
            disabled={pending.size === 0 || isPending}
          >
            {isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {toastMsg}
        </div>
      )}

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[160px] bg-muted/50 px-3 py-2 text-left font-medium">
                Người dùng
              </th>
              {MODULE_KEYS.map((mk) => (
                <th
                  key={mk}
                  className="min-w-[120px] px-2 py-2 text-center text-xs font-medium"
                  title={mk}
                >
                  {moduleLabels[mk]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, rowIdx) => (
              <tr
                key={user.id}
                className={rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                {/* Sticky user column */}
                <td
                  className={`sticky left-0 z-10 px-3 py-2 ${
                    rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {user.role}
                    {user.deptName ? ` · ${user.deptName}` : ""}
                  </div>
                </td>

                {/* Module cells */}
                {MODULE_KEYS.map((mk) => {
                  const dirty = isDirty(user.id, mk);
                  const value = getValue(user.id, mk);
                  const options = getLevelOptions(mk);
                  return (
                    <td
                      key={mk}
                      className={`px-2 py-1 text-center ${dirty ? "bg-amber-50" : ""}`}
                    >
                      <select
                        value={value}
                        onChange={(e) =>
                          handleCellChange(
                            user.id,
                            mk,
                            e.target.value as AccessLevel | "default",
                          )
                        }
                        className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs"
                        disabled={isPending}
                      >
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {levelLabel(opt)}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Admin grant confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận cấp quyền Admin</DialogTitle>
            <DialogDescription>
              Một hoặc nhiều thay đổi đang cấp quyền mức <strong>Admin</strong>.
              Quyền Admin cho phép truy cập toàn bộ chức năng của module. Bạn có
              chắc muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
            >
              Hủy
            </Button>
            <Button onClick={commitChanges} disabled={isPending}>
              Xác nhận lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
