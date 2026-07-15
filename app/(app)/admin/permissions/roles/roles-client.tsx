"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleForm, type RoleFormData } from "./role-form";
import { deleteRole } from "./actions";

export interface RoleListItem extends RoleFormData {
  moduleCount: number;
  userCount: number;
}

export function RolesClient({ roles }: { roles: RoleListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<RoleFormData | undefined>(undefined);

  function openCreate() {
    setFormMode("create");
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(role: RoleListItem) {
    setFormMode("edit");
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
    setFormOpen(true);
  }

  function handleDelete(role: RoleListItem) {
    if (role.userCount > 0) {
      toast.error(
        `Còn ${role.userCount} người dùng — gán lại vai trò khác trước khi xóa`,
      );
      return;
    }
    if (!confirm(`Xóa vai trò "${role.name}"? Hành động không hoàn tác.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteRole(role.id);
        toast.success("Đã xóa vai trò");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi khi xóa");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Vai trò</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo, sửa, xóa vai trò và ma trận quyền 18 module.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Tạo vai trò
        </Button>
      </div>

      <div className="overflow-hidden rounded border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Tên</th>
              <th className="px-3 py-2 text-left">Mã</th>
              <th className="px-3 py-2 text-right">Số module</th>
              <th className="px-3 py-2 text-right">Người dùng</th>
              <th className="px-3 py-2 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">
                  {r.name}
                  {r.id === "admin" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (toàn quyền)
                    </span>
                  )}
                  {r.description && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {r.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {r.id}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.id === "admin" ? "—" : r.moduleCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.userCount}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || r.userCount > 0}
                      title={
                        r.userCount > 0
                          ? "Còn người dùng đang dùng vai trò này"
                          : "Xóa vai trò"
                      }
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Chưa có vai trò nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RoleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initial={editing}
      />
    </div>
  );
}
