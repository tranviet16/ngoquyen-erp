"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { ProjectForm } from "@/components/master-data/project-form";
import { updateProjectAction } from "@/lib/master-data/project-service";
import type { ProjectInput } from "@/lib/master-data/schemas";

/** Thông tin dự án cần để điền sẵn form Sửa (dữ liệu đã qua ranh giới server → client). */
export interface EditableProject {
  id: number;
  code: string;
  name: string;
  ownerInvestor: string | null;
  contractValue: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  status: string;
}

/** Ngày nghiệp vụ lưu 00:00 UTC → `YYYY-MM-DD` cho ô ngày của form. */
const isoDay = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * Giá trị điền sẵn của form Sửa dự án. Phải đủ mọi trường form gửi đi: ô trống được server ghi
 * thành NULL, nên thiếu trường nào là xoá mất số liệu cũ của trường đó.
 */
export function projectFormDefaults(p: EditableProject) {
  return {
    code: p.code,
    name: p.name,
    ownerInvestor: p.ownerInvestor ?? "",
    contractValue: p.contractValue == null ? "" : String(p.contractValue),
    startDate: isoDay(p.startDate),
    endDate: isoDay(p.endDate),
    status: p.status as "active" | "completed" | "paused",
  };
}

/** Lưu form Sửa dự án; lỗi (vd. trùng mã) hiện trên toast. Trả true khi đã lưu. */
export async function saveProjectEdit(id: number, input: ProjectInput): Promise<boolean> {
  const result = await updateProjectAction(id, input);
  if (!result.ok) {
    toast.error(result.message);
    return false;
  }
  toast.success("Đã lưu dự án");
  return true;
}

/** Nút "Sửa thông tin" + hộp thoại form dự án, dùng ở trang dự án (chỉ hiện cho admin). */
export function ProjectEditButton({ project, label = "Sửa thông tin" }: { project: EditableProject; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(input: ProjectInput) {
    if (!(await saveProjectEdit(project.id, input))) return;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={(e) => {
          // Nút nằm trong dòng bảng có onRowClick (mở chi tiết) — không để click lan lên dòng.
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        {label}
      </Button>
      <CrudDialog title="Sửa dự án" open={open} onOpenChange={setOpen}>
        {open && <ProjectForm defaultValues={projectFormDefaults(project)} onSubmit={handleSubmit} />}
      </CrudDialog>
    </>
  );
}
