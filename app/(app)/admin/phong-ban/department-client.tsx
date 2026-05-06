"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import {
  createDepartmentAction,
  updateDepartmentAction,
  assignUserAction,
  setDirectorAction,
  unsetDirectorAction,
} from "./actions";

interface DeptRow {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  memberCount: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
  isLeader: boolean;
  isDirector: boolean;
}

interface Props {
  departments: DeptRow[];
  users: UserRow[];
}

type Tab = "depts" | "users";

export function DepartmentClient({ departments, users }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("depts");
  const [pending, startTransition] = useTransition();

  // Department dialog state
  const [deptDialog, setDeptDialog] = useState<{
    open: boolean;
    edit: DeptRow | null;
  }>({ open: false, edit: null });
  const [deptForm, setDeptForm] = useState({ code: "", name: "" });

  function openCreateDept() {
    setDeptForm({ code: "", name: "" });
    setDeptDialog({ open: true, edit: null });
  }

  function openEditDept(d: DeptRow) {
    setDeptForm({ code: d.code, name: d.name });
    setDeptDialog({ open: true, edit: d });
  }

  async function submitDept(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (deptDialog.edit) {
          await updateDepartmentAction(deptDialog.edit.id, deptForm);
        } else {
          await createDepartmentAction(deptForm);
        }
        toast.success("Đã lưu");
        setDeptDialog({ open: false, edit: null });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleActive(d: DeptRow) {
    startTransition(async () => {
      try {
        await updateDepartmentAction(d.id, { isActive: !d.isActive });
        toast.success(d.isActive ? "Đã ẩn phòng ban" : "Đã kích hoạt phòng ban");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function changeUserDept(u: UserRow, deptId: number | null) {
    startTransition(async () => {
      try {
        const isLeader = deptId === null ? false : u.isLeader;
        await assignUserAction(u.id, deptId, isLeader);
        toast.success("Đã cập nhật phòng ban");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleLeader(u: UserRow) {
    if (u.departmentId === null) {
      toast.error("Cần gán phòng ban trước khi đánh dấu lãnh đạo");
      return;
    }
    startTransition(async () => {
      try {
        await assignUserAction(u.id, u.departmentId, !u.isLeader);
        toast.success(!u.isLeader ? "Đã đặt làm lãnh đạo" : "Đã bỏ lãnh đạo");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleDirector(u: UserRow) {
    const currentDirector = users.find((x) => x.isDirector && x.id !== u.id);
    if (!u.isDirector && currentDirector) {
      const ok = confirm(
        `Đã có giám đốc: ${currentDirector.name}. Thay bằng ${u.name}?`
      );
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        if (u.isDirector) {
          await unsetDirectorAction(u.id);
          toast.success("Đã bỏ giám đốc");
        } else {
          await setDirectorAction(u.id);
          toast.success("Đã đặt làm giám đốc");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Quản lý phòng ban</h1>
        <p className="text-sm text-muted-foreground">
          Tạo phòng ban, gán thành viên, xác lập lãnh đạo và giám đốc.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {(["depts", "users"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "depts" ? `Phòng ban (${departments.length})` : `Thành viên (${users.length})`}
          </button>
        ))}
      </div>

      {tab === "depts" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateDept} disabled={pending}>
              + Thêm phòng ban
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">Mã</th>
                  <th className="text-left px-3 py-2">Tên phòng ban</th>
                  <th className="text-right px-3 py-2">Số thành viên</th>
                  <th className="text-left px-3 py-2">Trạng thái</th>
                  <th className="text-right px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      Chưa có phòng ban nào
                    </td>
                  </tr>
                ) : (
                  departments.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono">{d.code}</td>
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2 text-right">{d.memberCount}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs ${
                            d.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d.isActive ? "Hoạt động" : "Ngừng"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button
                          onClick={() => openEditDept(d)}
                          className="text-xs text-primary underline"
                          disabled={pending}
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => toggleActive(d)}
                          className="text-xs text-orange-600 underline"
                          disabled={pending}
                        >
                          {d.isActive ? "Ẩn" : "Bật"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">Họ tên</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Vai trò chức năng</th>
                <th className="text-left px-3 py-2">Phòng ban</th>
                <th className="text-center px-3 py-2">Lãnh đạo</th>
                <th className="text-center px-3 py-2">Giám đốc</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-muted">{u.role}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="h-7 rounded border border-input bg-transparent px-2 text-xs"
                      value={u.departmentId ?? ""}
                      onChange={(e) =>
                        changeUserDept(u, e.target.value === "" ? null : Number(e.target.value))
                      }
                      disabled={pending}
                    >
                      <option value="">— Không thuộc phòng —</option>
                      {departments
                        .filter((d) => d.isActive || d.id === u.departmentId)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} - {d.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={u.isLeader}
                      onChange={() => toggleLeader(u)}
                      disabled={pending || u.departmentId === null}
                      className="size-4"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={u.isDirector}
                      onChange={() => toggleDirector(u)}
                      disabled={pending}
                      className="size-4"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CrudDialog
        title={deptDialog.edit ? "Sửa phòng ban" : "Thêm phòng ban"}
        open={deptDialog.open}
        onOpenChange={(o) => setDeptDialog({ open: o, edit: o ? deptDialog.edit : null })}
      >
        <form onSubmit={submitDept} className="space-y-3">
          <div>
            <Label>Mã *</Label>
            <Input
              value={deptForm.code}
              onChange={(e) => setDeptForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="KT"
              required
              autoFocus
            />
          </div>
          <div>
            <Label>Tên phòng ban *</Label>
            <Input
              value={deptForm.name}
              onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Phòng Kế toán"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeptDialog({ open: false, edit: null })}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </form>
      </CrudDialog>
    </div>
  );
}
