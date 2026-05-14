"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import type { UserWithGrants } from "@/lib/admin/user-grants-service";
import type { AccessLevel } from "@/lib/dept-access";
import {
  setGrantAction,
  removeGrantAction,
  updateUserAttributesAction,
} from "./actions";
import { ALL_ROLES } from "@/lib/rbac";

const ROLE_LABELS_VI: Record<string, string> = {
  admin: "Quản trị",
  ketoan: "Kế toán",
  chihuy_ct: "Chỉ huy CT",
  canbo_vt: "Cán bộ VT",
  viewer: "Xem",
};

interface DeptOpt {
  id: number;
  code: string;
  name: string;
}

const LEVEL_LABEL: Record<AccessLevel, string> = {
  read: "Xem",
  comment: "Bình luận",
  edit: "Chỉnh sửa",
};

export function UserGrantsClient({
  users,
  departments,
}: {
  users: UserWithGrants[];
  departments: DeptOpt[];
}) {
  const [search, setSearch] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Người dùng & Quyền xem phòng</h1>
        <Input
          placeholder="Tìm theo tên hoặc email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="rounded border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Tên</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Phòng</th>
              <th className="px-3 py-2 text-left">Cờ</th>
              <th className="px-3 py-2 text-left">Quyền xem phòng khác</th>
              <th className="px-3 py-2 text-left">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                departments={departments}
                isOpen={openUserId === u.id}
                onToggle={() =>
                  setOpenUserId(openUserId === u.id ? null : u.id)
                }
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Không có user
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user,
  departments,
  isOpen,
  onToggle,
}: {
  user: UserWithGrants;
  departments: DeptOpt[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDeptId, setNewDeptId] = useState<string>("");
  const [newLevel, setNewLevel] = useState<AccessLevel>("read");

  const [role, setRole] = useState<string>(user.role ?? "viewer");
  const [isLeader, setIsLeader] = useState<boolean>(user.isLeader);
  const [isDirector, setIsDirector] = useState<boolean>(user.isDirector);
  const [deptId, setDeptId] = useState<number | null>(user.departmentId ?? null);

  // Remember the last server snapshot used to init local state. Resync only
  // when current local state still matches it (= no pending edit). Prevents
  // sibling router.refresh() from clobbering an in-progress edit on this row.
  const lastServerRef = useRef({
    role: user.role ?? "viewer",
    isLeader: user.isLeader,
    isDirector: user.isDirector,
    deptId: user.departmentId ?? null,
  });

  useEffect(() => {
    const next = {
      role: user.role ?? "viewer",
      isLeader: user.isLeader,
      isDirector: user.isDirector,
      deptId: user.departmentId ?? null,
    };
    const prev = lastServerRef.current;
    if (role === prev.role) setRole(next.role);
    if (isLeader === prev.isLeader) setIsLeader(next.isLeader);
    if (isDirector === prev.isDirector) setIsDirector(next.isDirector);
    if (deptId === prev.deptId) setDeptId(next.deptId);
    lastServerRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role, user.isLeader, user.isDirector, user.departmentId]);

  const dirty =
    role !== (user.role ?? "viewer") ||
    isLeader !== user.isLeader ||
    isDirector !== user.isDirector ||
    deptId !== (user.departmentId ?? null);

  const grantedDeptIds = new Set(user.grants.map((g) => g.deptId));
  const availableDepts = departments.filter(
    (d) => d.id !== user.departmentId && !grantedDeptIds.has(d.id),
  );

  const isPrivileged =
    user.role === "admin" || user.isDirector;

  function handleSaveAttrs() {
    startTransition(async () => {
      try {
        await updateUserAttributesAction({
          userId: user.id,
          role,
          isLeader,
          isDirector,
          departmentId: deptId,
        });
        toast.success("Đã lưu");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
      }
    });
  }

  const stop = (e: React.MouseEvent | React.ChangeEvent) =>
    e.stopPropagation();

  function handleAdd() {
    const id = Number(newDeptId);
    if (!id) {
      toast.error("Chọn phòng để cấp quyền");
      return;
    }
    startTransition(async () => {
      try {
        await setGrantAction(user.id, id, newLevel);
        toast.success("Đã cấp quyền");
        setNewDeptId("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function handleUpdate(deptId: number, level: AccessLevel) {
    startTransition(async () => {
      try {
        await setGrantAction(user.id, deptId, level);
        toast.success("Đã cập nhật");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function handleRemove(deptId: number) {
    startTransition(async () => {
      try {
        await removeGrantAction(user.id, deptId);
        toast.success("Đã xoá quyền");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  return (
    <>
      <tr
        className="border-t hover:bg-muted/30 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-medium">{user.name ?? "-"}</td>
        <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
        <td className="px-3 py-2" onClick={stop}>
          <select
            value={role}
            disabled={pending}
            onChange={(e) => setRole(e.target.value)}
            onClick={stop}
            className="rounded border px-2 py-1 text-xs bg-background"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS_VI[r] ?? r}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <select
            value={deptId ?? ""}
            disabled={pending}
            onChange={(e) =>
              setDeptId(e.target.value ? Number(e.target.value) : null)
            }
            onClick={stop}
            className="rounded border px-2 py-1 text-xs bg-background min-w-[160px]"
          >
            <option value="">— Không —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <div className="flex flex-col gap-1 text-xs">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isLeader}
                disabled={pending}
                onChange={(e) => setIsLeader(e.target.checked)}
                onClick={stop}
              />
              <span>TBP</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isDirector}
                disabled={pending}
                onChange={(e) => setIsDirector(e.target.checked)}
                onClick={stop}
              />
              <span>Giám đốc</span>
            </label>
          </div>
        </td>
        <td className="px-3 py-2">
          {isPrivileged ? (
            <span className="text-xs text-muted-foreground">
              Tự động xem tất cả
            </span>
          ) : (
            <span className="text-xs">
              {user.grants.length} phòng
            </span>
          )}
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={(e) => {
              e.stopPropagation();
              handleSaveAttrs();
            }}
          >
            Lưu
          </Button>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t bg-muted/20">
          <td colSpan={7} className="px-3 py-3">
            {isPrivileged ? (
              <p className="text-sm text-muted-foreground">
                User này có quyền xem tất cả phòng (admin/director).
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  {user.grants.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Chưa có quyền xem phòng khác.
                    </p>
                  )}
                  {user.grants.map((g) => (
                    <div
                      key={g.deptId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="min-w-[200px]">{g.deptName}</span>
                      <select
                        value={g.level}
                        disabled={pending}
                        onChange={(e) =>
                          handleUpdate(g.deptId, e.target.value as AccessLevel)
                        }
                        className="rounded border px-2 py-1 text-sm bg-background"
                      >
                        {(["read", "comment", "edit"] as AccessLevel[]).map(
                          (lv) => (
                            <option key={lv} value={lv}>
                              {LEVEL_LABEL[lv]}
                            </option>
                          ),
                        )}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => handleRemove(g.deptId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {availableDepts.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <select
                      value={newDeptId}
                      onChange={(e) => setNewDeptId(e.target.value)}
                      className="rounded border px-2 py-1 text-sm bg-background min-w-[200px]"
                    >
                      <option value="">— Chọn phòng —</option>
                      {availableDepts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value as AccessLevel)}
                      className="rounded border px-2 py-1 text-sm bg-background"
                    >
                      {(["read", "comment", "edit"] as AccessLevel[]).map(
                        (lv) => (
                          <option key={lv} value={lv}>
                            {LEVEL_LABEL[lv]}
                          </option>
                        ),
                      )}
                    </select>
                    <Button size="sm" disabled={pending} onClick={handleAdd}>
                      <Plus className="h-4 w-4 mr-1" /> Thêm
                    </Button>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
