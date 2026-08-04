"use server";

/**
 * Báo giá NCC theo thời gian: (vật tư, đơn giá, hiệu lực từ ngày). Nhiều mức giá
 * cùng vật tư → mức có effectiveFrom mới nhất mà <= ngày phiếu là mức áp dụng.
 * Nguồn giá tự điền cho bước chốt kỳ; kế toán vẫn sửa được từng phiếu.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { priceQuoteSchema, type PriceQuoteInput } from "./schemas";

export async function listPriceQuotes(supplierId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  return prisma.supplierPriceQuote.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: [{ itemId: "asc" }, { effectiveFrom: "desc" }],
  });
}

export async function createPriceQuote(input: PriceQuoteInput) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const data = priceQuoteSchema.parse(input);
  const record = await prisma.supplierPriceQuote.create({
    data: {
      supplierId: data.supplierId,
      itemId: data.itemId,
      unitPrice: new Prisma.Decimal(data.unitPrice),
      effectiveFrom: new Date(data.effectiveFrom),
      note: data.note ?? null,
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/bao-gia`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/chot-ky`);
  return record;
}

export async function updatePriceQuote(id: number, input: PriceQuoteInput) {
  const data = priceQuoteSchema.parse(input);
  const existing = await prisma.supplierPriceQuote.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.supplierPriceQuote.update({
    where: { id },
    data: {
      itemId: data.itemId,
      unitPrice: new Prisma.Decimal(data.unitPrice),
      effectiveFrom: new Date(data.effectiveFrom),
      note: data.note ?? null,
      updatedAt: new Date(),
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/bao-gia`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/chot-ky`);
  return record;
}

export async function softDeletePriceQuote(id: number, supplierId: number) {
  const existing = await prisma.supplierPriceQuote.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.supplierPriceQuote.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/bao-gia`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/chot-ky`);
  return record;
}
