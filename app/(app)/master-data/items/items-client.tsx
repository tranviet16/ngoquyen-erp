"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { ItemForm } from "@/components/master-data/item-form";
import { createItem, updateItem, softDeleteItem, patchItem } from "@/lib/master-data/item-service";
import { type ItemInput } from "@/lib/master-data/schemas";
import { useRouter } from "next/navigation";
import { ITEM_COLUMNS, ITEM_SPEC, type ItemRow } from "@/lib/master-data/items/table-spec";

interface ItemsClientProps {
  data: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function ItemsClient({ data, total, page, pageSize, searchValue }: ItemsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null);
  const [, startTransition] = useTransition();

  async function handleCreate(input: ItemInput) {
    await createItem(input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(input: ItemInput) {
    if (!editTarget) return;
    await updateItem(editTarget.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    await softDeleteItem(id);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vật Tư / Hạng Mục</h1>
          <p className="text-sm text-muted-foreground">Danh mục vật liệu, nhân công, máy móc</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm mới</Button>
      </div>

      <DataTable
        columns={ITEM_COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên..."
        resourceSpec={ITEM_SPEC}
        onCellEdit={async (row, key, value) => {
          const item = row as unknown as ItemRow;
          return patchItem(item.id, { [key]: value }) as Promise<Record<string, unknown>>;
        }}
        actionColumn={(row) => {
          const item = row as unknown as ItemRow;
          return (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(item)}>
                Sửa
              </Button>
              <DeleteConfirmDialog
                itemName={item.name}
                onConfirm={() => handleDelete(item.id)}
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

      <CrudDialog title="Thêm vật tư" open={createOpen} onOpenChange={setCreateOpen}>
        <ItemForm onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog
        title="Sửa vật tư"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <ItemForm
            defaultValues={{
              code: editTarget.code,
              name: editTarget.name,
              unit: editTarget.unit,
              type: editTarget.type as "material" | "labor" | "machine",
              note: editTarget.note ?? "",
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
