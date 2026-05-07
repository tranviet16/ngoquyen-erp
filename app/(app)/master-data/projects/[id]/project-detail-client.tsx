"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { CategoryForm } from "@/components/master-data/category-form";
import {
  createCategory,
  updateCategory,
  softDeleteCategory,
} from "@/lib/master-data/project-service";
import { type CategoryInput } from "@/lib/master-data/schemas";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVND, formatDate } from "@/lib/utils/format";

type Category = {
  id: number;
  projectId: number;
  code: string;
  name: string;
  sortOrder: number;
};

type Project = {
  id: number;
  code: string;
  name: string;
  ownerInvestor: string | null;
  status: string;
  contractValue: number | null;
  startDate: Date | null;
  endDate: Date | null;
  categories: Category[];
};

const CATEGORY_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "code", header: "Mã hạng mục", className: "w-[160px] font-mono" },
  { key: "name", header: "Tên hạng mục" },
  { key: "sortOrder", header: "Thứ tự", className: "w-[80px]", align: "right" },
];

interface ProjectDetailClientProps {
  project: Project;
}

export function ProjectDetailClient({ project }: ProjectDetailClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreateCategory(input: CategoryInput) {
    await createCategory(project.id, input);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEditCategory(input: CategoryInput) {
    if (!editTarget) return;
    await updateCategory(editTarget.id, project.id, input);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDeleteCategory(id: number) {
    await softDeleteCategory(id, project.id);
    startTransition(() => router.refresh());
  }

  const contractDisplay = formatVND(project.contractValue);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/master-data" className="hover:underline">Dữ liệu nền tảng</Link>
        <span>/</span>
        <Link href="/master-data/projects" className="hover:underline">Dự án</Link>
        <span>/</span>
        <span>{project.name}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mã: <span className="font-mono">{project.code}</span>
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Chủ đầu tư</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{project.ownerInvestor ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Giá trị HĐ</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{contractDisplay}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Thời gian</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {formatDate(project.startDate)} <span className="text-muted-foreground">→</span> {formatDate(project.endDate)}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Hạng Mục Dự Án</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>Thêm hạng mục</Button>
        </div>

        <DataTable
          columns={CATEGORY_COLUMNS}
          data={project.categories as unknown as Record<string, unknown>[]}
          total={project.categories.length}
          page={1}
          pageSize={project.categories.length || 1}
          emptyText="Chưa có hạng mục nào"
          actionColumn={(row) => {
            const cat = row as unknown as Category;
            return (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setEditTarget(cat)}>
                  Sửa
                </Button>
                <DeleteConfirmDialog
                  itemName={cat.name}
                  onConfirm={() => handleDeleteCategory(cat.id)}
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
      </div>

      <CrudDialog title="Thêm hạng mục" open={createOpen} onOpenChange={setCreateOpen}>
        <CategoryForm onSubmit={handleCreateCategory} />
      </CrudDialog>

      <CrudDialog
        title="Sửa hạng mục"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        {editTarget && (
          <CategoryForm
            defaultValues={{
              code: editTarget.code,
              name: editTarget.name,
              sortOrder: editTarget.sortOrder,
            }}
            onSubmit={handleEditCategory}
          />
        )}
      </CrudDialog>
    </div>
  );
}
