import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

async function getCounts() {
  const [entities, suppliers, contractors, projects, items] = await Promise.all([
    prisma.entity.count({ where: { deletedAt: null } }),
    prisma.supplier.count({ where: { deletedAt: null } }),
    prisma.contractor.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.item.count({ where: { deletedAt: null } }),
  ]);
  return { entities, suppliers, contractors, projects, items };
}

const MASTERS = [
  { href: "/master-data/entities", label: "Chủ Thể", description: "Công ty / cá nhân liên quan", key: "entities" },
  { href: "/master-data/suppliers", label: "Nhà Cung Cấp", description: "NCC vật tư xây dựng", key: "suppliers" },
  { href: "/master-data/contractors", label: "Đội Thi Công", description: "Đội nhân công / máy móc", key: "contractors" },
  { href: "/master-data/projects", label: "Dự Án", description: "Dự án xây dựng + hạng mục", key: "projects" },
  { href: "/master-data/items", label: "Vật Tư / Hạng Mục", description: "Danh mục vật liệu, nhân công, máy móc", key: "items" },
];

export default async function MasterDataPage() {
  const counts = await getCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dữ Liệu Nền Tảng</h1>
        <p className="text-muted-foreground mt-1">
          Quản lý danh mục: Chủ thể, Nhà cung cấp, Đội thi công, Dự án, Vật tư.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MASTERS.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{m.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{m.description}</p>
                <p className="text-2xl font-bold">
                  {counts[m.key as keyof typeof counts]}
                </p>
                <p className="text-xs text-muted-foreground">bản ghi</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
