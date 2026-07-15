import { canAccess, getViewableProjectIds, type ModuleKey } from "@/lib/acl";
import { prisma } from "@/lib/prisma";

export type GlobalSearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  module: string;
};

export type GlobalSearchSection = {
  key: string;
  title: string;
  results: GlobalSearchResult[];
};

const LIMIT = 6;

const MODULE_LINKS: Array<{
  moduleKey: ModuleKey;
  title: string;
  href: string;
  keywords: string[];
}> = [
  { moduleKey: "dashboard", title: "Bảng điều khiển", href: "/dashboard", keywords: ["dashboard", "tong quan"] },
  { moduleKey: "du-an", title: "Dự án", href: "/du-an", keywords: ["du an", "cong trinh"] },
  { moduleKey: "master-data", title: "Dữ liệu nền tảng", href: "/master-data", keywords: ["master data", "du lieu", "ncc", "vat tu"] },
  { moduleKey: "vat-tu-ncc", title: "Vật tư - Nhà cung cấp", href: "/vat-tu-ncc", keywords: ["vat tu", "nha cung cap", "ncc"] },
  { moduleKey: "cong-no-vt", title: "Công nợ vật tư", href: "/cong-no-vt", keywords: ["cong no", "vat tu"] },
  { moduleKey: "cong-no-nc", title: "Công nợ nhân công", href: "/cong-no-nc", keywords: ["cong no", "nhan cong"] },
  { moduleKey: "tai-chinh", title: "Tài chính", href: "/tai-chinh", keywords: ["tai chinh", "nguon tien", "nhat ky"] },
  { moduleKey: "thanh-toan.ke-hoach", title: "Kế hoạch thanh toán", href: "/thanh-toan/ke-hoach", keywords: ["thanh toan", "ke hoach"] },
  { moduleKey: "van-hanh.cong-viec", title: "Công việc", href: "/van-hanh/cong-viec", keywords: ["task", "cong viec", "kanban"] },
  { moduleKey: "van-hanh.phieu-phoi-hop", title: "Phiếu phối hợp", href: "/van-hanh/phieu-phoi-hop", keywords: ["phieu", "phoi hop"] },
  { moduleKey: "admin.phong-ban", title: "Phòng ban", href: "/admin/phong-ban", keywords: ["phong ban", "department"] },
  { moduleKey: "admin.nguoi-dung", title: "Người dùng", href: "/admin/nguoi-dung", keywords: ["nguoi dung", "user"] },
  { moduleKey: "admin.permissions", title: "Phân quyền", href: "/admin/permissions", keywords: ["phan quyen", "permission"] },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matches(value: string, query: string) {
  return normalize(value).includes(query);
}

async function hasModule(userId: string, moduleKey: ModuleKey) {
  return canAccess(userId, moduleKey, { minLevel: "read", scope: "module" });
}

export async function globalSearch(userId: string, rawQuery: string): Promise<GlobalSearchSection[]> {
  const query = rawQuery.trim();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const sections: GlobalSearchSection[] = [];
  const moduleAccess = new Map<ModuleKey, boolean>();

  await Promise.all(
    [...new Set(MODULE_LINKS.map((m) => m.moduleKey))].map(async (moduleKey) => {
      moduleAccess.set(moduleKey, await hasModule(userId, moduleKey));
    }),
  );

  const navResults = MODULE_LINKS
    .filter((item) => moduleAccess.get(item.moduleKey))
    .filter((item) => matches(item.title, normalizedQuery) || item.keywords.some((k) => k.includes(normalizedQuery)))
    .map((item) => ({
      id: item.href,
      title: item.title,
      subtitle: "Đi tới module",
      href: item.href,
      module: "Điều hướng",
    }));
  if (navResults.length) sections.push({ key: "navigation", title: "Điều hướng", results: navResults });

  if (moduleAccess.get("du-an")) {
    const projectAccess = await getViewableProjectIds(userId);
    if (projectAccess.kind !== "none") {
      const projects = await prisma.project.findMany({
        where: {
          deletedAt: null,
          ...(projectAccess.kind === "subset" ? { id: { in: projectAccess.ids } } : {}),
          OR: [
            { code: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { ownerInvestor: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT,
      });
      if (projects.length) {
        sections.push({
          key: "projects",
          title: "Dự án",
          results: projects.map((p) => ({
            id: `project-${p.id}`,
            title: `${p.code} - ${p.name}`,
            subtitle: p.ownerInvestor ?? "Dự án xây dựng",
            href: `/du-an/${p.id}`,
            module: "Dự án",
          })),
        });
      }
    }
  }

  if (moduleAccess.get("master-data")) {
    const [entities, suppliers, contractors, items] = await Promise.all([
      prisma.entity.findMany({ where: { deletedAt: null, name: { contains: query, mode: "insensitive" } }, take: LIMIT, orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ where: { deletedAt: null, OR: [{ name: { contains: query, mode: "insensitive" } }, { taxCode: { contains: query, mode: "insensitive" } }] }, take: LIMIT, orderBy: { name: "asc" } }),
      prisma.contractor.findMany({ where: { deletedAt: null, OR: [{ name: { contains: query, mode: "insensitive" } }, { leader: { contains: query, mode: "insensitive" } }] }, take: LIMIT, orderBy: { name: "asc" } }),
      prisma.item.findMany({ where: { deletedAt: null, OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] }, take: LIMIT, orderBy: { name: "asc" } }),
    ]);
    const results: GlobalSearchResult[] = [
      ...entities.map((e) => ({ id: `entity-${e.id}`, title: e.name, subtitle: e.note ?? "Chủ thể", href: "/master-data/entities", module: "Dữ liệu nền" })),
      ...suppliers.map((s) => ({ id: `supplier-${s.id}`, title: s.name, subtitle: s.taxCode ? `MST: ${s.taxCode}` : "Nhà cung cấp", href: "/master-data/suppliers", module: "Dữ liệu nền" })),
      ...contractors.map((c) => ({ id: `contractor-${c.id}`, title: c.name, subtitle: c.leader ? `Đội trưởng: ${c.leader}` : "Đội thi công", href: "/master-data/contractors", module: "Dữ liệu nền" })),
      ...items.map((i) => ({ id: `item-${i.id}`, title: `${i.code} - ${i.name}`, subtitle: `${i.unit} · ${i.type}`, href: "/master-data/items", module: "Dữ liệu nền" })),
    ].slice(0, LIMIT * 2);
    if (results.length) sections.push({ key: "master-data", title: "Dữ liệu nền", results });
  }

  if (moduleAccess.get("van-hanh.cong-viec")) {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { assigneeId: userId },
        ],
        AND: [
          {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    });
    if (tasks.length) {
      sections.push({
        key: "tasks",
        title: "Công việc",
        results: tasks.map((t) => ({
          id: `task-${t.id}`,
          title: t.title,
          subtitle: `${t.status} · ${t.priority}`,
          href: `/van-hanh/cong-viec?taskId=${t.id}`,
          module: "Vận hành",
        })),
      });
    }
  }

  if (moduleAccess.get("van-hanh.phieu-phoi-hop")) {
    const forms = await prisma.coordinationForm.findMany({
      where: {
        creatorId: userId,
        OR: [
          { code: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    });
    if (forms.length) {
      sections.push({
        key: "forms",
        title: "Phiếu phối hợp",
        results: forms.map((f) => ({
          id: `form-${f.id}`,
          title: f.code,
          subtitle: `${f.status} · ${f.content.slice(0, 90)}`,
          href: `/van-hanh/phieu-phoi-hop/${f.id}`,
          module: "Vận hành",
        })),
      });
    }
  }

  if (moduleAccess.get("admin.phong-ban") || moduleAccess.get("admin.nguoi-dung")) {
    const [departments, users] = await Promise.all([
      moduleAccess.get("admin.phong-ban")
        ? prisma.department.findMany({ where: { OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] }, take: LIMIT, orderBy: { code: "asc" } })
        : Promise.resolve([]),
      moduleAccess.get("admin.nguoi-dung")
        ? prisma.user.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { username: { contains: query, mode: "insensitive" } }] }, take: LIMIT, orderBy: { name: "asc" } })
        : Promise.resolve([]),
    ]);
    const results: GlobalSearchResult[] = [
      ...departments.map((d) => ({ id: `dept-${d.id}`, title: `${d.code} - ${d.name}`, subtitle: d.isActive ? "Phòng ban đang dùng" : "Phòng ban đã ẩn", href: "/admin/phong-ban", module: "Quản trị" })),
      ...users.map((u) => ({ id: `user-${u.id}`, title: u.name, subtitle: `${u.email} · ${u.isActive ? "đang dùng" : "vô hiệu hóa"}`, href: "/admin/nguoi-dung", module: "Quản trị" })),
    ];
    if (results.length) sections.push({ key: "admin", title: "Quản trị", results });
  }

  return sections;
}
