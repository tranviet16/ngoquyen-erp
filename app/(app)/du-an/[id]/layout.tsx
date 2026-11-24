import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { queryProjectById } from "@/lib/master-data/project-query";
import { requireModuleAccess } from "@/lib/acl/guards";
import { ProjectEditButton } from "@/components/master-data/project-edit-button";
import { ProjectNav } from "@/components/du-an/project-nav";
import { BookNote } from "@/components/du-an/book-note";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function ProjectLayout({ params, children }: Props) {
  const { id } = await params;
  const projectId = Number(id);

  if (isNaN(projectId)) notFound();

  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const project = await queryProjectById(projectId);
  if (!project) notFound();
  // Sửa thông tin dự án là quyền admin (server kiểm lại khi lưu); người khác không thấy nút.
  const session = await auth.api.getSession({ headers: await headers() });
  const canEdit = isAdmin(session?.user?.role);

  const basePath = `/du-an/${projectId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/du-an" className="hover:underline">Dự án</Link>
            <span>/</span>
            <span>{project.code}</span>
          </div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          {project.ownerInvestor && (
            <p className="text-sm text-muted-foreground">CĐT: {project.ownerInvestor}</p>
          )}
        </div>
        {canEdit && (
          <ProjectEditButton
            project={{
              id: project.id,
              code: project.code,
              name: project.name,
              ownerInvestor: project.ownerInvestor,
              contractValue: project.contractValue,
              startDate: project.startDate,
              endDate: project.endDate,
              status: project.status,
            }}
          />
        )}
      </div>

      {/* Điều hướng hai hàng: 7 nhóm, rồi tab của nhóm đang mở. Ghi chú sổ đội tải riêng (Suspense). */}
      <div className="border-b">
        <ProjectNav
          basePath={basePath}
          bookNote={
            <Suspense fallback={null}>
              <BookNote projectId={projectId} />
            </Suspense>
          }
        />
      </div>

      <div>{children}</div>
    </div>
  );
}
