import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/master-data/project-service";
import { requireModuleAccess } from "@/lib/acl/guards";

const TABS = [
  { href: "", label: "Dashboard" },
  { href: "/tien-do", label: "Tiến Độ" },
  { href: "/nghiem-thu", label: "Nghiệm Thu" },
  { href: "/du-toan", label: "Dự Toán" },
  { href: "/du-toan-dieu-chinh", label: "DT Điều Chỉnh" },
  { href: "/phat-sinh", label: "Phát Sinh (CO)" },
  { href: "/dinh-muc", label: "Định Mức" },
  { href: "/giao-dich", label: "Giao Dịch" },
  { href: "/hop-dong", label: "Hợp Đồng" },
  { href: "/dong-tien-3-ben", label: "Dòng Tiền 3 Bên" },
  { href: "/cong-no", label: "Công Nợ NCC" },
  { href: "/cai-dat", label: "Cài Đặt" },
];

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function ProjectLayout({ params, children }: Props) {
  const { id } = await params;
  const projectId = Number(id);

  if (isNaN(projectId)) notFound();

  const project = await getProjectById(projectId);
  if (!project) notFound();

  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const basePath = `/du-an/${projectId}`;

  return (
    <div className="space-y-4">
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

      {/* Tab bar */}
      <div className="border-b overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`${basePath}${tab.href}`}
              className="px-4 py-2 text-sm font-medium border-b-2 border-transparent hover:border-primary hover:text-primary transition-colors whitespace-nowrap text-muted-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
