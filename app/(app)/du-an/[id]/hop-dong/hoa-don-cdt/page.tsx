import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listCdtInvoices } from "@/lib/du-an/cdt-invoice-service";
import { HoaDonCdtClient } from "./hoa-don-cdt-client";

interface Props {
  params: Promise<{ id: string }>;
}

/** Sổ hóa đơn xuất CĐT của công trình — sổ gốc cho "Hóa đơn đã xuất" của hợp đồng CĐT. */
export default async function HoaDonCdtPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [invoices, batches, canCreate, canEdit] = await Promise.all([
    listCdtInvoices(projectId),
    prisma.projectAcceptance.findMany({
      where: { projectId, deletedAt: null, acceptanceBatch: { not: null } },
      select: { acceptanceBatch: true },
      distinct: ["acceptanceBatch"],
      orderBy: { acceptanceBatch: "asc" },
    }),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  const rows = invoices.map((r) => ({
    id: r.id,
    invoiceDate: r.invoiceDate.toISOString().slice(0, 10),
    invoiceSymbol: r.invoiceSymbol,
    invoiceNo: r.invoiceNo,
    amountVnd: r.amountVnd.toFixed(),
    vatVnd: r.vatVnd.toFixed(),
    total: r.amountVnd.plus(r.vatVnd).toFixed(),
    acceptanceBatch: r.acceptanceBatch,
    note: r.note,
  }));

  const sumAmount = invoices.reduce((s, r) => s.plus(r.amountVnd), new Prisma.Decimal(0));
  const sumVat = invoices.reduce((s, r) => s.plus(r.vatVnd), new Prisma.Decimal(0));
  const totals = { amountVnd: sumAmount.toFixed(), vatVnd: sumVat.toFixed(), total: sumAmount.plus(sumVat).toFixed() };

  return (
    <div className="space-y-4">
      <Link href={`/du-an/${projectId}/hop-dong`} className="text-sm text-muted-foreground hover:underline">
        ← Danh mục hợp đồng
      </Link>
      <HoaDonCdtClient
        projectId={projectId}
        rows={rows}
        batches={batches.map((b) => b.acceptanceBatch!).filter(Boolean)}
        canCreate={canCreate}
        canEdit={canEdit}
        totals={totals}
      />
    </div>
  );
}
