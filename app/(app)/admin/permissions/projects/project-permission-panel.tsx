"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AccessLevel } from "@/lib/acl/modules";
import {
  setProjectPermission,
  setProjectGrantAll,
} from "../actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  name: string;
  role: string;
  deptName: string | null;
  hasGrantAll: boolean;
};

type ProjectRow = {
  id: number;
  name: string;
  code: string;
};

type ProjectPermissionRow = {
  userId: string;
  projectId: number;
  level: AccessLevel;
};

type GrantAllRow = {
  userId: string;
  level: AccessLevel;
};

type Props = {
  users: UserRow[];
  projects: ProjectRow[];
  permissions: ProjectPermissionRow[];
  grantAlls: GrantAllRow[];
};

const PROJECT_LEVELS: readonly (AccessLevel | "default")[] = [
  "default",
  "read",
  "comment",
  "edit",
];

function levelLabel(level: AccessLevel | "default"): string {
  if (level === "default") return "Không có";
  if (level === "read") return "Xem";
  if (level === "comment") return "Bình luận";
  if (level === "edit") return "Chỉnh sửa";
  if (level === "admin") return "Admin";
  return level;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectPermissionPanel({
  users,
  projects,
  permissions,
  grantAlls,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    users[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [filterHasGrant, setFilterHasGrant] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      search === "" ||
      u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = !filterHasGrant || u.hasGrantAll;
    return matchSearch && matchFilter;
  });

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  // Per-user permission lookup
  const userPerms = new Map<number, AccessLevel>();
  for (const p of permissions) {
    if (p.userId === selectedUserId) {
      userPerms.set(p.projectId, p.level);
    }
  }

  const grantAll = grantAlls.find((g) => g.userId === selectedUserId) ?? null;
  const exceptionCount = grantAll
    ? permissions.filter((p) => p.userId === selectedUserId).length
    : 0;

  function handleGrantAllChange(value: AccessLevel | "default") {
    if (!selectedUserId) return;
    startTransition(async () => {
      try {
        await setProjectGrantAll(selectedUserId, value);
        showToast(
          value === "default"
            ? "Đã thu hồi quyền toàn bộ dự án."
            : `Đã cấp quyền "${levelLabel(value)}" cho toàn bộ dự án.`,
        );
      } catch (err) {
        showToast(
          `Lỗi: ${err instanceof Error ? err.message : "Lỗi không xác định"}`,
        );
      }
    });
  }

  function handleProjectLevelChange(
    projectId: number,
    value: AccessLevel | "default",
  ) {
    if (!selectedUserId) return;
    startTransition(async () => {
      try {
        await setProjectPermission(selectedUserId, projectId, value);
        showToast(
          value === "default"
            ? "Đã xóa quyền dự án."
            : `Đã cấp quyền "${levelLabel(value)}".`,
        );
      } catch (err) {
        showToast(
          `Lỗi: ${err instanceof Error ? err.message : "Lỗi không xác định"}`,
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {toastMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {toastMsg}
        </div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-4 rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        {/* Left pane: user list */}
        <div className="flex flex-col border-r">
          <div className="border-b p-3 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Tìm người dùng…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={filterHasGrant}
                onChange={(e) => setFilterHasGrant(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Chỉ hiện người có quyền toàn bộ
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors ${
                  selectedUserId === user.id
                    ? "bg-muted font-medium"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{user.name}</span>
                  {user.hasGrantAll && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                      Toàn bộ
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {user.role}
                  {user.deptName ? ` · ${user.deptName}` : ""}
                </div>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Không tìm thấy người dùng
              </div>
            )}
          </div>
        </div>

        {/* Right pane: project grants */}
        <div className="flex flex-col">
          {!selectedUser ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Chọn người dùng để xem phân quyền
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="font-medium">{selectedUser.name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedUser.role}
                  {selectedUser.deptName ? ` · ${selectedUser.deptName}` : ""}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Dự án</th>
                      <th className="pb-2 font-medium w-40">Mức quyền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Grant-all row at top */}
                    <tr className="border-b bg-muted/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Toàn bộ dự án</span>
                          {grantAll && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="cursor-default rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                      Có quyền toàn bộ ({levelLabel(grantAll.level)})
                                      {exceptionCount > 0
                                        ? ` · ${exceptionCount} ngoại lệ`
                                        : ""}
                                    </span>
                                  }
                                />
                                <TooltipContent side="right">
                                  Dòng theo từng dự án ghi đè quyền toàn bộ kể cả
                                  khi cấp thấp hơn.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                      <td className="py-2">
                        <select
                          value={grantAll?.level ?? "default"}
                          onChange={(e) =>
                            handleGrantAllChange(
                              e.target.value as AccessLevel | "default",
                            )
                          }
                          disabled={isPending}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                        >
                          {PROJECT_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {levelLabel(l)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>

                    {/* Per-project rows */}
                    {projects.map((proj) => {
                      const current = userPerms.get(proj.id) ?? "default";
                      return (
                        <tr key={proj.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            <div>{proj.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {proj.code}
                            </div>
                          </td>
                          <td className="py-2">
                            <select
                              value={current}
                              onChange={(e) =>
                                handleProjectLevelChange(
                                  proj.id,
                                  e.target.value as AccessLevel | "default",
                                )
                              }
                              disabled={isPending}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                            >
                              {PROJECT_LEVELS.map((l) => (
                                <option key={l} value={l}>
                                  {levelLabel(l)}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}

                    {projects.length === 0 && (
                      <tr>
                        <td
                          colSpan={2}
                          className="py-4 text-center text-muted-foreground"
                        >
                          Không có dự án nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
