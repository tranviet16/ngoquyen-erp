"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { store } from "@/lib/storage";
import { logUserAudit } from "@/lib/audit-user";

const AVATAR_MIME = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function requireSessionUser(): Promise<{ id: string; image: string | null; name: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, image: true, name: true },
  });
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
}

export async function updateProfileAction(input: { name: string }): Promise<void> {
  const user = await requireSessionUser();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Họ tên phải từ 2-80 ký tự");
  }
  if (name === user.name) return;
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  await logUserAudit("profile_update", user.id, user.id, { name: user.name }, { name });
  revalidatePath("/ho-so");
}

export async function uploadAvatarAction(formData: FormData): Promise<{ image: string }> {
  const user = await requireSessionUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Không có file");
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Ảnh vượt quá 2MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }
  const ext = AVATAR_MIME.get(file.type);
  if (!ext) throw new Error("Chỉ hỗ trợ PNG, JPEG, WEBP");

  const rel = `avatars/${user.id}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await store.putFile(rel, buf);

  const oldImage = user.image;
  await prisma.user.update({ where: { id: user.id }, data: { image: rel } });
  await logUserAudit("profile_update", user.id, user.id, { image: oldImage }, { image: rel });

  if (oldImage && oldImage.startsWith("avatars/")) {
    await store.deleteFile(oldImage).catch(() => {});
  }
  revalidatePath("/ho-so");
  return { image: rel };
}

export async function removeAvatarAction(): Promise<void> {
  const user = await requireSessionUser();
  if (!user.image) return;
  const old = user.image;
  await prisma.user.update({ where: { id: user.id }, data: { image: null } });
  await logUserAudit("profile_update", user.id, user.id, { image: old }, { image: null });
  if (old.startsWith("avatars/")) {
    await store.deleteFile(old).catch(() => {});
  }
  revalidatePath("/ho-so");
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await requireSessionUser();
  if (input.newPassword.length < 8) {
    throw new Error("Mật khẩu mới tối thiểu 8 ký tự");
  }
  await auth.api.changePassword({
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: false,
    },
    headers: await headers(),
  });
  await logUserAudit("password_change", user.id, user.id, null, null);
}
