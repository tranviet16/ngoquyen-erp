"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { EntityForm } from "@/components/master-data/entity-form";
import { createEntity, updateEntity, softDeleteEntity } from "@/lib/master-data/entity-service";
import { type EntityInput } from "@/lib/master-data/schemas";
import { useRouter } from "next/navigation";

type EntityRow = {
  id: number;
  name: string;
  type: string;
  note: string | null;
  createdAt: Date;
};

const TYPE_LABELS: Record<string, string> = {
  company: "Công ty",
  person: "Cá nhân",
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "name", header: "Tên chủ thể" },
  {
    key: "type",
    header: "Loại",
    render: (row) => TYPE_LABELS[row.type as string] ?? String(row.type),
  },
  { key: "note", header: "Ghi chú" },
];

interface EntitiesClientProps {
  data: EntityRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function EntitiesClient({ data, total, page, pageSize, searchValue }: EntitiesClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EntityRow | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreate(input: EntityInput) {
    await createEntity(input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(input: EntityInput) {
    if (!editTarget) return;
    await updateEntity(editTarget.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    await softDeleteEntity(id);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chủ Thể</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách công ty / cá nhân liên quan</p>
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
          const entity = row as unknown as EntityRow;
          return (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(entity)}>
                Sửa
              </Button>
              <DeleteConfirmDialog
                itemName={entity.name}
                onConfirm={() => handleDelete(entity.id)}
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

      <CrudDialog title="Thêm chủ thể" open={createOpen} onOpenChange={setCreateOpen}>
        <EntityForm onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog
        title="Sửa chủ thể"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <EntityForm
            defaultValues={{ name: editTarget.name, type: editTarget.type as "company" | "person", note: editTarget.note ?? "" }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
