"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createUserAccountAction } from "./actions";
import {
  CreateUserAccountFields,
  type AccountForm,
  type AccountOption,
} from "./create-user-account-fields";

const emptyForm: AccountForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  departmentId: "",
};

function defaultRole(roles: AccountOption[]) {
  return String(
    roles.find((role) => role.id === "viewer")?.id ?? roles[0]?.id ?? "",
  );
}

export function CreateUserAccountDialog({
  roles,
  departments,
}: {
  roles: AccountOption[];
  departments: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    role: defaultRole(roles),
  }));

  function resetForm() {
    setForm({ ...emptyForm, role: defaultRole(roles) });
    setError("");
    setShowPassword(false);
  }

  function change(key: keyof AccountForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    startTransition(async () => {
      try {
        await createUserAccountAction({
          name: form.name,
          username: form.username,
          email: form.email,
          password: form.password,
          role: form.role,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
        });
        toast.success("Đã tạo tài khoản người dùng");
        setOpen(false);
        resetForm();
        router.refresh();
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Không thể tạo tài khoản";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="min-h-11 sm:min-h-9">
        <Plus className="mr-2 h-4 w-4" /> Tạo tài khoản
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-0 sm:max-w-lg"
          showCloseButton={!pending}
        >
          <DialogHeader className="safe-top px-4 pt-4 max-sm:pr-14 sm:px-0 sm:pt-0">
            <DialogTitle>Tạo tài khoản người dùng</DialogTitle>
            <DialogDescription>
              Tài khoản được kích hoạt ngay và chưa có phiên đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="contents">
            <CreateUserAccountFields
              form={form}
              roles={roles}
              departments={departments}
              showPassword={showPassword}
              error={error}
              onChange={change}
              onTogglePassword={() => setShowPassword((value) => !value)}
            />
            <DialogFooter className="safe-bottom max-sm:m-0 max-sm:rounded-none">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => handleOpenChange(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={pending || roles.length === 0}>
                {pending && (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                )}{" "}
                Tạo tài khoản
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
