import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getViewableProjectIds } from "@/lib/acl";
import { listProjects } from "@/lib/master-data/project-service";
import { DuAnListClient } from "./du-an-list-client";

interface Props {
  searchParams: Promise<{ search?: string; page?: string; status?: string }>;
}

export default async function DuAnPage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");

  const v = await getViewableProjectIds(session.user.id);

  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);
  const status = params.status;

  // No viewable projects — show empty list (layout guard already checked module access)
  if (v.kind === "none") {
    return (
      <Suspense>
        <DuAnListClient data={[]} total={0} page={1} pageSize={20} searchValue={search} />
      </Suspense>
    );
  }

  const result = await listProjects({
    search,
    page,
    pageSize: 20,
    status,
    ...(v.kind === "subset" ? { ids: v.ids } : {}),
  });

  const items = result.items.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    ownerInvestor: p.ownerInvestor,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    _count: p._count,
  }));

  return (
    <Suspense>
      <DuAnListClient
        data={items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
