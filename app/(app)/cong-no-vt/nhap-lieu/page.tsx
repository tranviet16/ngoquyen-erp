import { redirect } from "next/navigation";
import { listMaterialTransactions } from "@/lib/cong-no-vt/material-ledger-service";
import { NhapLieuPager } from "./nhap-lieu-pager";
import {
  patchMaterialTransactionAction,
  adminPatchMaterialTransactionAction,
  bulkUpsertMaterialTransactionsAction,
  softDeleteMaterialTransactionsAction,
} from "@/lib/cong-no-vt/material-ledger-actions";
import { prisma } from "@/lib/prisma";
import { LedgerTransactionGrid, type TxRow } from "@/components/ledger-grid/transaction-grid";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

/** Số dòng sổ mỗi trang của lưới (mới nhất trước). */
const PAGE_SIZE = 200;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NhapLieuPage({ searchParams }: PageProps) {
  const { userId, role } = await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });
  const sp = await searchParams;
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  const [txResult, entities, suppliers, projects, items, canCreate, canEdit] = await Promise.all([
    listMaterialTransactions({ page, pageSize: PAGE_SIZE }),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { deletedAt: null, type: "material" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "edit", scope: "module" }),
  ]);

  // Trang vượt quá số trang hiện có (ví dụ sau khi xóa dòng) → về trang cuối.
  const totalPages = Math.max(1, Math.ceil(txResult.total / PAGE_SIZE));
  if (page > totalPages) redirect(`/cong-no-vt/nhap-lieu?page=${totalPages}`);

  const rows: TxRow[] = txResult.items.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    transactionType: t.transactionType,
    entityId: t.entityId,
    partyId: t.partyId,
    projectId: t.projectId,
    itemId: t.itemId,
    amountTt: t.amountTt.toString(),
    vatPctTt: t.vatPctTt.toString(),
    vatTt: t.vatTt.toString(),
    totalTt: t.totalTt.toString(),
    amountHd: t.amountHd.toString(),
    vatPctHd: t.vatPctHd.toString(),
    vatHd: t.vatHd.toString(),
    totalHd: t.totalHd.toString(),
    invoiceNo: t.invoiceNo,
    content: t.content,
    status: t.status,
    note: t.note,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nhập liệu công nợ vật tư</h1>
        <p className="text-sm text-muted-foreground">
          Excel-like grid: edit in-place, paste range từ Excel, thêm/xóa dòng. Computed: vatTt/totalTt cập nhật server.
        </p>
      </div>

      <NhapLieuPager total={txResult.total} page={page} pageSize={PAGE_SIZE} />

      <LedgerTransactionGrid
        key={page}
        initialData={rows}
        entities={entities}
        partyOptions={suppliers}
        projects={projects}
        items={items}
        partyLabel="Nhà cung cấp"
        defaults={{ entityId: entities[0]?.id ?? 0, partyId: suppliers[0]?.id ?? 0 }}
        actions={{
          // Action trả { ok, … } — lỗi nghiệp vụ hiện trên toast cả ở bản production.
          patch: patchMaterialTransactionAction,
          adminPatch: adminPatchMaterialTransactionAction,
          bulkUpsert: bulkUpsertMaterialTransactionsAction,
          softDeleteMany: softDeleteMaterialTransactionsAction,
        }}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canEdit}
        isAdmin={role === "admin"}
        requireProject
      />
    </div>
  );
}
