"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProfileAction,
  uploadAvatarAction,
  removeAvatarAction,
  changePasswordAction,
} from "./actions";

interface HoSoUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
  department: { code: string; name: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  ketoan: "Kế toán",
  thukho: "Thủ kho",
  giamsat: "Giám sát",
  viewer: "Người xem",
};

const AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function initialsOf(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarSrc(image: string | null, bust: number): string | null {
  if (!image) return null;
  return `/api/${image}?v=${bust}`;
}

export function HoSoClient({ user }: { user: HoSoUser }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name);
  const [imagePath, setImagePath] = useState(user.image);
  const [bust, setBust] = useState(() => Date.now());

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingName, startSaveName] = useTransition();
  const [uploadingAvatar, startUploadAvatar] = useTransition();
  const [removingAvatar, startRemoveAvatar] = useTransition();
  const [changingPassword, startChangePassword] = useTransition();

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const src = avatarSrc(imagePath, bust);

  function onSaveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      toast.error("Họ tên phải từ 2-80 ký tự");
      return;
    }
    if (trimmed === user.name) {
      toast.info("Không có thay đổi");
      return;
    }
    startSaveName(async () => {
      try {
        await updateProfileAction({ name: trimmed });
        toast.success("Đã cập nhật họ tên");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi cập nhật");
      }
    });
  }

  function onPickFile() {
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_MIME.has(file.type)) {
      toast.error("Chỉ hỗ trợ PNG, JPEG, WEBP");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Ảnh vượt quá 2MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    const form = new FormData();
    form.append("file", file);
    startUploadAvatar(async () => {
      try {
        const res = await uploadAvatarAction(form);
        setImagePath(res.image);
        setBust(Date.now());
        toast.success("Đã cập nhật ảnh đại diện");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi tải ảnh");
      }
    });
  }

  function onRemoveAvatar() {
    if (!imagePath) return;
    startRemoveAvatar(async () => {
      try {
        await removeAvatarAction();
        setImagePath(null);
        toast.success("Đã xóa ảnh đại diện");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi xóa ảnh");
      }
    });
  }

  function onChangePassword() {
    if (newPassword.length < 8) {
      toast.error("Mật khẩu mới tối thiểu 8 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu không khớp");
      return;
    }
    if (!currentPassword) {
      toast.error("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    startChangePassword(async () => {
      try {
        await changePasswordAction({ currentPassword, newPassword });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success("Đã đổi mật khẩu");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Đổi mật khẩu thất bại");
      }
    });
  }

  const avatarBusy = uploadingAvatar || removingAvatar;

  return (
    <div className="container mx-auto max-w-3xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hồ sơ cá nhân</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý thông tin tài khoản và mật khẩu của bạn
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onPickFile}
              disabled={avatarBusy}
              className="relative size-24 overflow-hidden rounded-full bg-primary/10 ring-2 ring-border transition hover:ring-primary disabled:opacity-60"
              aria-label="Đổi ảnh đại diện"
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={user.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-xl font-semibold text-primary">
                  {initialsOf(user.name, user.email)}
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                Đổi ảnh
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onFileChange}
            />
            {imagePath && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRemoveAvatar}
                disabled={avatarBusy}
              >
                Xóa ảnh
              </Button>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <Label htmlFor="ho-so-name">Họ và tên</Label>
            <Input
              id="ho-so-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={savingName}
            />
            <div className="flex justify-end">
              <Button onClick={onSaveName} disabled={savingName || name.trim() === user.name}>
                {savingName ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold">Thông tin tài khoản</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vai trò</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {roleLabel}
              </span>
              {user.isDirector && (
                <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Giám đốc
                </span>
              )}
              {user.isLeader && !user.isDirector && (
                <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  Trưởng phòng
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phòng ban</dt>
            <dd className="font-medium">
              {user.department
                ? `${user.department.code} — ${user.department.name}`
                : "—"}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Email, vai trò và phòng ban do quản trị viên cập nhật.
        </p>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold">Đổi mật khẩu</h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cur-pw">Mật khẩu hiện tại</Label>
            <Input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changingPassword}
            />
          </div>
          <div>
            <Label htmlFor="new-pw">Mật khẩu mới (tối thiểu 8 ký tự)</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changingPassword}
            />
          </div>
          <div>
            <Label htmlFor="confirm-pw">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changingPassword}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={onChangePassword}
            disabled={
              changingPassword ||
              !currentPassword ||
              newPassword.length < 8 ||
              newPassword !== confirmPassword
            }
          >
            {changingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
