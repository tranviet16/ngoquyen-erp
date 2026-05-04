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

  return (
    <Suspense>
      <DuAnListClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
