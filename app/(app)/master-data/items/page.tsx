import { Suspense } from "react";
import { ItemsClient } from "./items-client";
import { listItems } from "@/lib/master-data/item-service";

interface Props {
  searchParams: Promise<{ search?: string; page?: string; type?: string }>;
}

export default async function ItemsPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);
  const type = params.type;

  const result = await listItems({ search, page, pageSize: 20, type });

  return (
    <Suspense>
      <ItemsClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
