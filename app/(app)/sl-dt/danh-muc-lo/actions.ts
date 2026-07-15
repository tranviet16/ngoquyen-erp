"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { cleanHierarchyLabel } from "@/lib/sl-dt/hierarchy";
import { lotCatalogSchema } from "@/lib/sl-dt/schemas";

export interface LotCatalogRow {
  id: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  activeFromYear: number | null;
  activeFromMonth: number | null;
  phaseSortOrder: number;
  groupSortOrder: number;
  showInSanLuong: boolean;
  showInDoanhThu: boolean;
  showInChiTieu: boolean;
  showInTienDoXd: boolean;
  showInNopTien: boolean;
  estimateValue: number;
  contractValue: number | null;
}

async function assertAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  await requireRoleModuleAccess(session?.user?.role ?? null, "sl-dt", "admin");
}

function num(v: unknown) {
  return v == null || v === "" ? 0 : Number(v);
}

function nullableNum(v: unknown) {
  return v == null || v === "" ? null : Number(v);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function duplicateLotCodeError(code: string) {
  return new Error(`Mã lô "${code}" đã tồn tại. Vui lòng dùng mã lô khác.`);
}

function toRow(row: {
  id: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  activeFromYear: number | null;
  activeFromMonth: number | null;
  showInSanLuong: boolean;
  showInDoanhThu: boolean;
  showInChiTieu: boolean;
  showInTienDoXd: boolean;
  showInNopTien: boolean;
  estimateValue: Prisma.Decimal;
  contractValue: Prisma.Decimal | null;
}): LotCatalogRow {
  return {
    id: row.id,
    code: row.code,
    lotName: row.lotName,
    phaseCode: cleanHierarchyLabel(row.phaseCode),
    groupCode: cleanHierarchyLabel(row.groupCode),
    sortOrder: row.sortOrder,
    activeFromYear: row.activeFromYear,
    activeFromMonth: row.activeFromMonth,
    phaseSortOrder: 0,
    groupSortOrder: 0,
    showInSanLuong: row.showInSanLuong,
    showInDoanhThu: row.showInDoanhThu,
    showInChiTieu: row.showInChiTieu,
    showInTienDoXd: row.showInTienDoXd,
    showInNopTien: row.showInNopTien,
    estimateValue: Number(row.estimateValue),
    contractValue: row.contractValue == null ? null : Number(row.contractValue),
  };
}

async function upsertSubtotalOrder(scope: "phase" | "group", key: string, label: string, sortOrder: number) {
  const existing = await prisma.slDtSubtotalLabel.findUnique({
    where: { scope_key: { scope, key } },
    select: { id: true },
  });

  if (existing) {
    await prisma.slDtSubtotalLabel.update({
      where: { id: existing.id },
      data: { label, sortOrder },
    });
    return;
  }

  await prisma.slDtSubtotalLabel.create({
    data: { scope, key, label, sortOrder },
  });
}

function revalidateSlDt() {
  revalidatePath("/sl-dt");
  revalidatePath("/sl-dt/danh-muc-lo");
  revalidatePath("/sl-dt/nhap-thang-moi");
  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/bao-cao-sl");
  revalidatePath("/sl-dt/bao-cao-dt");
  revalidatePath("/sl-dt/tien-do-xd");
  revalidatePath("/sl-dt/tien-do-nop-tien");
}

export async function patchLotCatalogRow(id: number, patch: Record<string, unknown>) {
  await assertAdmin();
  if (!id || id < 1) throw new Error("Lô không hợp lệ");

  const current = await prisma.slDtLot.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new Error("Không tìm thấy lô");

  const merged = lotCatalogSchema.parse({
    code: "code" in patch ? patch.code : current.code,
    lotName: "lotName" in patch ? patch.lotName : current.lotName,
    phaseCode: "phaseCode" in patch ? patch.phaseCode : current.phaseCode,
    groupCode: "groupCode" in patch ? patch.groupCode : current.groupCode,
    sortOrder: "sortOrder" in patch ? num(patch.sortOrder) : current.sortOrder,
    activeFromYear: "activeFromYear" in patch ? num(patch.activeFromYear) : (current.activeFromYear ?? 2000),
    activeFromMonth: "activeFromMonth" in patch ? num(patch.activeFromMonth) : (current.activeFromMonth ?? 1),
    estimateValue: "estimateValue" in patch ? num(patch.estimateValue) : Number(current.estimateValue),
    contractValue: "contractValue" in patch ? nullableNum(patch.contractValue) : (
      current.contractValue == null ? null : Number(current.contractValue)
    ),
  });

  if ("phaseSortOrder" in patch) {
    const phase = cleanHierarchyLabel(merged.phaseCode);
    if (phase) await upsertSubtotalOrder("phase", phase, phase, num(patch.phaseSortOrder));
  }
  if ("groupSortOrder" in patch) {
    const phase = cleanHierarchyLabel(merged.phaseCode);
    const group = cleanHierarchyLabel(merged.groupCode);
    if (phase && group) await upsertSubtotalOrder("group", `${phase}/${group}`, group, num(patch.groupSortOrder));
  }

  if (merged.code !== current.code) {
    const duplicate = await prisma.slDtLot.findUnique({ where: { code: merged.code }, select: { id: true } });
    if (duplicate && duplicate.id !== id) throw duplicateLotCodeError(merged.code);
  }

  let updated;
  try {
    updated = await prisma.slDtLot.update({
      where: { id },
      data: {
        code: merged.code,
        lotName: merged.lotName,
        phaseCode: cleanHierarchyLabel(merged.phaseCode),
        groupCode: cleanHierarchyLabel(merged.groupCode),
        sortOrder: merged.sortOrder,
        activeFromYear: merged.activeFromYear,
        activeFromMonth: merged.activeFromMonth,
        showInSanLuong: "showInSanLuong" in patch ? Boolean(patch.showInSanLuong) : current.showInSanLuong,
        showInDoanhThu: "showInDoanhThu" in patch ? Boolean(patch.showInDoanhThu) : current.showInDoanhThu,
        showInChiTieu: "showInChiTieu" in patch ? Boolean(patch.showInChiTieu) : current.showInChiTieu,
        showInTienDoXd: "showInTienDoXd" in patch ? Boolean(patch.showInTienDoXd) : current.showInTienDoXd,
        showInNopTien: "showInNopTien" in patch ? Boolean(patch.showInNopTien) : current.showInNopTien,
        estimateValue: new Prisma.Decimal(merged.estimateValue),
        contractValue: merged.contractValue == null ? null : new Prisma.Decimal(merged.contractValue),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateLotCodeError(merged.code);
    throw error;
  }

  revalidateSlDt();
  return toRow(updated);
}

export async function createLotCatalogRow(input: Record<string, unknown>) {
  await assertAdmin();
  const data = lotCatalogSchema.parse({
    code: input.code,
    lotName: input.lotName,
    phaseCode: input.phaseCode,
    groupCode: input.groupCode,
    sortOrder: num(input.sortOrder),
    activeFromYear: num(input.activeFromYear),
    activeFromMonth: num(input.activeFromMonth),
    estimateValue: num(input.estimateValue),
    contractValue: nullableNum(input.contractValue),
  });

  const duplicate = await prisma.slDtLot.findUnique({ where: { code: data.code }, select: { id: true } });
  if (duplicate) throw duplicateLotCodeError(data.code);

  let created;
  try {
    created = await prisma.slDtLot.create({
      data: {
        code: data.code,
        lotName: data.lotName,
        phaseCode: cleanHierarchyLabel(data.phaseCode),
        groupCode: cleanHierarchyLabel(data.groupCode),
        sortOrder: data.sortOrder,
        activeFromYear: data.activeFromYear,
        activeFromMonth: data.activeFromMonth,
        showInSanLuong: input.showInSanLuong == null ? true : Boolean(input.showInSanLuong),
        showInDoanhThu: input.showInDoanhThu == null ? true : Boolean(input.showInDoanhThu),
        showInChiTieu: input.showInChiTieu == null ? true : Boolean(input.showInChiTieu),
        showInTienDoXd: input.showInTienDoXd == null ? true : Boolean(input.showInTienDoXd),
        showInNopTien: input.showInNopTien == null ? true : Boolean(input.showInNopTien),
        estimateValue: new Prisma.Decimal(data.estimateValue),
        contractValue: data.contractValue == null ? null : new Prisma.Decimal(data.contractValue),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateLotCodeError(data.code);
    throw error;
  }

  revalidateSlDt();
  return toRow(created);
}

export async function deleteLotCatalogRows(ids: number[]) {
  await assertAdmin();
  if (!ids.length) return;

  const dataCount = await prisma.slDtLot.count({
    where: {
      id: { in: ids },
      OR: [
        { monthlyInputs: { some: {} } },
        { progressStatus: { some: {} } },
        { paymentPlan: { isNot: null } },
      ],
    },
  });
  if (dataCount > 0) {
    throw new Error("Không thể xóa lô đã có dữ liệu tháng, tiến độ hoặc kế hoạch nộp tiền");
  }

  await prisma.slDtLot.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date() },
  });
  revalidateSlDt();
}
