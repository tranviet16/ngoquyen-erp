"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { ProjectForm } from "@/components/master-data/project-form";
import { createProject, updateProject, softDeleteProject } from "@/lib/master-data/project-service";
import { type ProjectInput } from "@/lib/master-data/schemas";
import { formatNumber } from "@/lib/utils/format";

type ProjectRow = {
  id: number;
  code: string;
  name: string;
  ownerInvestor: string | null;
  status: string;
  _count: { categories: number };
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "code", header: "Mã DA", className: "w-[100px] font-mono" },
  { key: "name", header: "Tên dự án" },
  { key: "ownerInvestor", header: "Chủ đầu tư" },
  {
    key: "status",
    header: "Trạng thái",
    className: "w-[160px]",
    render: (row) => <StatusBadge status={row.status as string} />,
  },
  {
    key: "_count",
    header: "Hạng mục",
    className: "w-[100px]",
    align: "right",
    render: (row) => {
      const cnt = row._count as { categories: number };
      return formatNumber(cnt?.categories ?? 0);
    },
  },
];

interface ProjectsClientProps {
  data: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function ProjectsClient({ data, total, page, pageSize, searchValue }: ProjectsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreate(input: ProjectInput) {
    await createProject(input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(input: ProjectInput) {
    if (!editTarget) return;
    await updateProject(editTarget.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    await softDeleteProject(id);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dự án</h1>
          <p className="text-sm text-muted-foreground mt-1">Danh sách dự án xây dựng</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Thêm dự án
        </Button>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên..."
        onRowClick={(row) => router.push(`/master-data/projects/${(row as unknown as ProjectRow).id}`)}
        actionColumn={(row) => {
          const project = row as unknown as ProjectRow;
          return (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditTarget(project)}
              >
                Sửa
              </Button>
              <DeleteConfirmDialog
                itemName={project.name}
                onConfirm={() => handleDelete(project.id)}
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

      <CrudDialog title="Thêm dự án" open={createOpen} onOpenChange={setCreateOpen}>
        <ProjectForm onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog
        title="Sửa dự án"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <ProjectForm
            defaultValues={{
              code: editTarget.code,
              name: editTarget.name,
              ownerInvestor: editTarget.ownerInvestor ?? "",
              status: editTarget.status as "active" | "completed" | "paused",
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
