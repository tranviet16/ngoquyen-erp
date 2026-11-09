"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { ProjectForm } from "@/components/master-data/project-form";
import {
  createProject,
  updateProject,
  softDeleteProject,
  patchProject,
  patchProjectEntity,
} from "@/lib/master-data/project-service";
import { type ProjectInput } from "@/lib/master-data/schemas";
import { PROJECT_SPEC, type ProjectRow } from "@/lib/master-data/projects/table-spec";
import { formatNumber } from "@/lib/utils/format";

type EntityOption = { id: number; name: string };
type ProjectListRow = ProjectRow & { entityId: number | null };

/**
 * Cột "Chủ thể" (sửa nhanh bằng select). Chủ thể là nguồn suy Chủ thể cho công nợ vật tư; server
 * từ chối đổi khi công trình đã có dữ liệu vật tư (gán lần đầu luôn được).
 */
function entityColumn(entities: EntityOption[]): ColumnDef<Record<string, unknown>> {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  return {
    key: "entityId",
    header: "Chủ thể",
    className: "w-[200px]",
    editable: true,
    editKind: "select",
    editOptions: entities.map((e) => ({ id: String(e.id), name: e.name })),
    parseEdit: (raw) => (raw === "" ? null : Number(raw)),
    render: (row) => {
      const id = typeof row.entityId === "number" ? row.entityId : null;
      if (id == null) return <span className="text-muted-foreground">Chưa gán</span>;
      return names.get(id) ?? `#${id}`;
    },
  };
}

const PROJECT_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "code",
    header: "Mã DA",
    kind: "text",
    className: "w-[100px] font-mono",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "text",
  },
  {
    key: "name",
    header: "Tên dự án",
    kind: "text",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "text",
  },
  { key: "ownerInvestor", header: "Chủ đầu tư" },
  {
    key: "status",
    header: "Trạng thái",
    kind: "select",
    className: "w-[160px]",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "select",
    editOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
    filterOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
    render: (row) => <StatusBadge status={row.status as string} />,
  },
  {
    key: "_count",
    kind: "number",
    sortKey: "categories._count",
    filterable: false,
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
  data: ProjectListRow[];
  entities: EntityOption[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function ProjectsClient({ data, entities, total, page, pageSize, searchValue }: ProjectsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null);
  const [, startTransition] = useTransition();
  // Chèn "Chủ thể" sau "Chủ đầu tư".
  const columns = useMemo(() => {
    const at = PROJECT_COLUMNS.findIndex((c) => c.key === "ownerInvestor") + 1;
    return [...PROJECT_COLUMNS.slice(0, at), entityColumn(entities), ...PROJECT_COLUMNS.slice(at)];
  }, [entities]);

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
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên..."
        resourceSpec={PROJECT_SPEC}
        onCellEdit={async (row, key, value) => {
          const project = row as unknown as ProjectListRow;
          if (key === "entityId") {
            // Trả kết quả để lý do từ chối (đã có dữ liệu vật tư) hiện đúng trên toast.
            const result = await patchProjectEntity(project.id, typeof value === "number" ? value : null);
            if (!result.ok) throw new Error(result.message);
            return;
          }
          return patchProject(project.id, { [key]: value }) as Promise<Record<string, unknown>>;
        }}
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
