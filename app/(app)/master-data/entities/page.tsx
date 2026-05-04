import { Suspense } from "react";
import { EntitiesClient } from "./entities-client";
import { listEntities } from "@/lib/master-data/entity-service";

interface Props {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function EntitiesPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);

  const result = await listEntities({ search, page, pageSize: 20 });

  return (
    <Suspense>
      <EntitiesClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
