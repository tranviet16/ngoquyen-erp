"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MODULE_KEYS,
  MODULE_LEVELS,
  type ModuleKey,
  type AccessLevel,
} from "@/lib/acl/modules";
import { MODULE_LABELS, LEVEL_LABELS } from "@/lib/acl/module-labels";
import { createRole, updateRole, type RolePermissionInput } from "./actions";

export interface RoleFormData {
  id: string;
  name: string;
  description: string | null;
  permissions: { moduleKey: ModuleKey; level: AccessLevel }[];
}

type LevelMap = Partial<Record<ModuleKey, AccessLevel>>;

const GRANTABLE_MODULE_KEYS = MODULE_KEYS.filter(
  (moduleKey) => MODULE_LEVELS[moduleKey].length > 0,
);

function toLevelMap(
  perms: { moduleKey: ModuleKey; level: AccessLevel }[],
): LevelMap {
  const m: LevelMap = {};
  for (const p of perms) m[p.moduleKey] = p.level;
  return m;
}

export function RoleForm({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: RoleFormData;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RoleFormContent
          key={`${mode}:${initial?.id ?? "new"}`}
          mode={mode}
          initial={initial}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function RoleFormContent({
  onOpenChange,
  mode,
  initial,
}: {
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: RoleFormData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [roleId, setRoleId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [levels, setLevels] = useState<LevelMap>(() =>
    initial ? toLevelMap(initial.permissions) : {},
  );

  const isAdminRole = mode === "edit" && initial?.id === "admin";

  function handleSubmit() {
    const permissions: RolePermissionInput[] = MODULE_KEYS.flatMap((mk) => {
      const lv = levels[mk];
      return lv ? [{ moduleKey: mk, level: lv }] : [];
    });
    startTransition(async () => {
      try {
        if (mode === "create") {
          await createRole({ id: roleId, name, description, permissions });
          toast.success("Đã tạo vai trò");
        } else {
          await updateRole(initial!.id, { name, description, permissions });
          toast.success("Đã lưu vai trò");
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tạo vai trò" : `Sửa vai trò: ${initial?.name}`}
          </DialogTitle>
          <DialogDescription>
            Đặt cấp quyền cho từng module. &quot;Không có quyền&quot; = không
            truy cập được module đó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "create" && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Mã vai trò (slug)</label>
              <Input
                value={roleId}
                disabled={pending}
                placeholder="vd: truong-kho"
                onChange={(e) => setRoleId(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Tên hiển thị</label>
            <Input
              value={name}
              disabled={pending}
              placeholder="vd: Trưởng kho"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Mô tả (tùy chọn)</label>
            <Input
              value={description}
              disabled={pending}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isAdminRole && (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              Vai trò admin luôn có toàn quyền — ma trận dưới đây chỉ để hiển
              thị.
            </p>
          )}

          <div className="max-h-[44vh] space-y-1 overflow-y-auto rounded border p-2">
            {GRANTABLE_MODULE_KEYS.map((mk) => (
              <div
                key={mk}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{MODULE_LABELS[mk]}</span>
                <select
                  value={levels[mk] ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    setLevels((prev) => {
                      const next = { ...prev };
                      const v = e.target.value;
                      if (v) next[mk] = v as AccessLevel;
                      else delete next[mk];
                      return next;
                    })
                  }
                  className="rounded border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Không có quyền</option>
                  {MODULE_LEVELS[mk].map((lv) => (
                    <option key={lv} value={lv}>
                      {LEVEL_LABELS[lv]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button disabled={pending} onClick={handleSubmit}>
            {mode === "create" ? "Tạo" : "Lưu"}
          </Button>
        </DialogFooter>
    </DialogContent>
  );
}
