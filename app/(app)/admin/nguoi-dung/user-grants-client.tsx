"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import type { UserWithGrants } from "@/lib/admin/user-grants-service";
import type { AccessLevel } from "@/lib/dept-access";
import { setGrantAction, removeGrantAction } from "./actions";

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
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Phòng</th>
              <th className="px-3 py-2">Cờ</th>
              <th className="px-3 py-2">Quyền xem phòng khác</th>
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
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
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

  const grantedDeptIds = new Set(user.grants.map((g) => g.deptId));
  const availableDepts = departments.filter(
    (d) => d.id !== user.departmentId && !grantedDeptIds.has(d.id),
  );

  const isPrivileged =
    user.role === "admin" || user.isDirector;

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
        <td className="px-3 py-2">
          <span className="inline-flex rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs">
            {user.role}
          </span>
        </td>
        <td className="px-3 py-2">{user.departmentName ?? "-"}</td>
        <td className="px-3 py-2 space-x-1">
          {user.isLeader && (
            <span className="inline-flex rounded bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">
              Leader
            </span>
          )}
          {user.isDirector && (
            <span className="inline-flex rounded bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">
              Director
            </span>
          )}
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
      </tr>
      {isOpen && (
        <tr className="border-t bg-muted/20">
          <td colSpan={6} className="px-3 py-3">
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
