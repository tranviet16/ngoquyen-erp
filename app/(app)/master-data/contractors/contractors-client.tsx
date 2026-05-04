"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { ContractorForm } from "@/components/master-data/contractor-form";
import { createContractor, updateContractor, softDeleteContractor } from "@/lib/master-data/contractor-service";
import { type ContractorInput } from "@/lib/master-data/schemas";
import { useRouter } from "next/navigation";

type ContractorRow = {
  id: number;
  name: string;
  leader: string | null;
  contact: string | null;
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "name", header: "Tên đội thi công" },
  { key: "leader", header: "Trưởng nhóm" },
  { key: "contact", header: "Liên hệ" },
];

interface ContractorsClientProps {
  data: ContractorRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function ContractorsClient({ data, total, page, pageSize, searchValue }: ContractorsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContractorRow | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreate(input: ContractorInput) {
    await createContractor(input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(input: ContractorInput) {
    if (!editTarget) return;
    await updateContractor(editTarget.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    await softDeleteContractor(id);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Đội Thi Công</h1>
          <p className="text-sm text-muted-foreground">Danh sách đội nhân công và máy móc</p>
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
          const contractor = row as unknown as ContractorRow;
          return (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(contractor)}>
                Sửa
              </Button>
              <DeleteConfirmDialog
                itemName={contractor.name}
                onConfirm={() => handleDelete(contractor.id)}
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

      <CrudDialog title="Thêm đội thi công" open={createOpen} onOpenChange={setCreateOpen}>
        <ContractorForm onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog
        title="Sửa đội thi công"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <ContractorForm
            defaultValues={{
              name: editTarget.name,
              leader: editTarget.leader ?? "",
              contact: editTarget.contact ?? "",
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
