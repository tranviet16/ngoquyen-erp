"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { SupplierForm } from "@/components/master-data/supplier-form";
import { createSupplier, updateSupplier, softDeleteSupplier } from "@/lib/master-data/supplier-service";
import { type SupplierInput } from "@/lib/master-data/schemas";
import { useRouter } from "next/navigation";

type SupplierRow = {
  id: number;
  name: string;
  taxCode: string | null;
  phone: string | null;
  address: string | null;
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "name", header: "Tên nhà cung cấp" },
  { key: "taxCode", header: "MST" },
  { key: "phone", header: "Điện thoại" },
  { key: "address", header: "Địa chỉ" },
];

interface SuppliersClientProps {
  data: SupplierRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function SuppliersClient({ data, total, page, pageSize, searchValue }: SuppliersClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierRow | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreate(input: SupplierInput) {
    await createSupplier(input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(input: SupplierInput) {
    if (!editTarget) return;
    await updateSupplier(editTarget.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    await softDeleteSupplier(id);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhà Cung Cấp</h1>
          <p className="text-sm text-muted-foreground">Danh sách nhà cung cấp vật tư xây dựng</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm mới</Button>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo tên..."
        actionColumn={(row) => {
          const supplier = row as unknown as SupplierRow;
          return (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(supplier)}>
                Sửa
              </Button>
              <DeleteConfirmDialog
                itemName={supplier.name}
                onConfirm={() => handleDelete(supplier.id)}
                trigger={
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    Xóa
                  </Button>
                }
              />
            </div>
          );
        }}
      />

      <CrudDialog title="Thêm nhà cung cấp" open={createOpen} onOpenChange={setCreateOpen}>
        <SupplierForm onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog
        title="Sửa nhà cung cấp"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <SupplierForm
            defaultValues={{
              name: editTarget.name,
              taxCode: editTarget.taxCode ?? "",
              phone: editTarget.phone ?? "",
              address: editTarget.address ?? "",
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
