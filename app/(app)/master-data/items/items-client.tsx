"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { ItemForm } from "@/components/master-data/item-form";
import { createItem, updateItem, softDeleteItem } from "@/lib/master-data/item-service";
import { type ItemInput } from "@/lib/master-data/schemas";
import { useRouter } from "next/navigation";

type ItemRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  type: string;
  note: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  material: "Vật liệu",
  labor: "Nhân công",
  machine: "Máy móc",
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "code", header: "Mã", className: "w-[120px]" },
  { key: "name", header: "Tên vật tư / hạng mục" },
  { key: "unit", header: "ĐVT", className: "w-[80px]" },
  {
    key: "type",
    header: "Loại",
    className: "w-[100px]",
    render: (row) => TYPE_LABELS[row.type as string] ?? String(row.type),
  },
];

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
  const [isPending, startTransition] = useTransition();

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
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên..."
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
