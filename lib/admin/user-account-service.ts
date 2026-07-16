import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { userProvisioningAuth } from "@/lib/auth";
import { requireActiveAdmin } from "./require-active-admin";

const schema = z.object({
  name: z.string().trim().min(1, "Họ tên không được để trống").max(120),
  username: z
    .string()
    .trim()
    .min(3, "Tên đăng nhập phải có ít nhất 3 ký tự")
    .max(30, "Tên đăng nhập không được quá 30 ký tự")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "Tên đăng nhập chỉ gồm chữ, số, dấu chấm và gạch dưới",
    )
    .transform((value) => value.toLowerCase()),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  password: z
    .string()
    .min(12, "Mật khẩu phải có ít nhất 12 ký tự")
    .max(128, "Mật khẩu không được quá 128 ký tự"),
  role: z.string().trim().min(1, "Vai trò không hợp lệ"),
  departmentId: z.number().int().positive().nullable(),
});

export type CreateUserAccountInput = z.input<typeof schema>;

export async function createUserAccount(input: CreateUserAccountInput) {
  await requireActiveAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const data = parsed.data;

  const [role, department, duplicate] = await Promise.all([
    prisma.role.findUnique({ where: { id: data.role }, select: { id: true } }),
    data.departmentId === null
      ? null
      : prisma.department.findUnique({
          where: { id: data.departmentId },
          select: { id: true, isActive: true },
        }),
    prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
      select: { email: true, username: true },
    }),
  ]);

  if (!role) throw new Error("Vai trò không tồn tại");
  if (data.departmentId !== null && (!department || !department.isActive)) {
    throw new Error("Phòng ban không tồn tại hoặc đã ngừng hoạt động");
  }
  if (duplicate?.email === data.email) throw new Error("Email đã được sử dụng");
  if (duplicate?.username === data.username)
    throw new Error("Tên đăng nhập đã được sử dụng");

  let candidateUserId: string | null = null;
  try {
    const result = await userProvisioningAuth.api.signUpEmail({
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
        username: data.username,
      },
    });
    candidateUserId = result.user.id;
    const [createdUser, sessionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: candidateUserId },
        select: { id: true, email: true },
      }),
      prisma.session.count({ where: { userId: candidateUserId } }),
    ]);
    if (!createdUser || createdUser.email !== data.email) {
      throw new Error("Tài khoản đã tồn tại hoặc không thể được tạo");
    }
    if (result.token !== null || sessionCount !== 0) {
      throw new Error("Provisioning đã tạo phiên đăng nhập ngoài dự kiến");
    }

    await prisma.user.update({
      where: { id: candidateUserId },
      data: {
        role: data.role,
        departmentId: data.departmentId,
        isActive: true,
        isLeader: false,
        isDirector: false,
      },
    });
    return { id: candidateUserId, email: data.email, username: data.username };
  } catch (error) {
    if (candidateUserId) {
      try {
        const cleanupTarget = await prisma.user.findUnique({
          where: { id: candidateUserId },
          select: { id: true, email: true },
        });
        if (cleanupTarget?.email === data.email) {
          await prisma.user.delete({ where: { id: candidateUserId } });
        }
      } catch (cleanupError) {
        console.error("[admin.user.create] compensation failed", {
          userId: candidateUserId,
          error:
            cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
        throw new Error(
          "Tạo tài khoản thất bại và cần quản trị viên xử lý thủ công",
        );
      }
    }
    if (error instanceof Error && error.message.startsWith("Provisioning")) {
      throw error;
    }
    throw new Error(
      "Không thể tạo tài khoản. Email hoặc tên đăng nhập có thể đã tồn tại.",
    );
  }
}
