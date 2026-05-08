"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import {
  createDepartmentAction,
  updateDepartmentAction,
  assignUserAction,
  setDirectorAction,
  unsetDirectorAction,
} from "./actions";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

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

  async function submitDept(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createDepartmentAction(deptForm);
        toast.success("Đã lưu");
        setDeptDialog({ open: false, edit: null });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const deptColumns: DataGridColumn<DeptRow>[] = [
    { id: "code", title: "Mã", kind: "text", width: 100 },
    { id: "name", title: "Tên phòng ban", kind: "text", width: 260 },
    { id: "memberCount", title: "Số thành viên", kind: "number", width: 130, readonly: true },
    { id: "isActive", title: "Hoạt động", kind: "boolean", width: 100 },
  ];

  const deptHandlers: DataGridHandlers<DeptRow> = {
    onCellEdit: async (id, col, value) => {
      const patch: Partial<{ code: string; name: string; isActive: boolean }> = {};
      if (col === "code" && typeof value === "string") patch.code = value;
      else if (col === "name" && typeof value === "string") patch.name = value;
      else if (col === "isActive") patch.isActive = Boolean(value);
      else return;
      try {
        await updateDepartmentAction(id, patch);
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        startTransition(() => router.refresh());
      }
    },
  };

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
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Sửa trực tiếp Mã, Tên, Hoạt động trong bảng. Toggle ô &quot;Hoạt động&quot; để ẩn/hiện.
            </p>
            <Button size="sm" onClick={openCreateDept} disabled={pending}>
              + Thêm phòng ban
            </Button>
          </div>
          <DataGrid<DeptRow>
            columns={deptColumns}
            rows={departments}
            handlers={deptHandlers}
            height={420}
          />
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
        title="Thêm phòng ban"
        open={deptDialog.open}
        onOpenChange={(o) => setDeptDialog({ open: o, edit: null })}
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
