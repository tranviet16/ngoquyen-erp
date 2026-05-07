import { Suspense } from "react";
import { listProjects } from "@/lib/master-data/project-service";
import { DuAnListClient } from "./du-an-list-client";

interface Props {
  searchParams: Promise<{ search?: string; page?: string; status?: string }>;
}

export default async function DuAnPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);
  const status = params.status;

  const result = await listProjects({ search, page, pageSize: 20, status });
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
