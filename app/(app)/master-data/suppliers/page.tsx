import { Suspense } from "react";
import { SuppliersClient } from "./suppliers-client";
import { listSuppliers } from "@/lib/master-data/supplier-service";

interface Props {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function SuppliersPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);

  const result = await listSuppliers({ search, page, pageSize: 20 });

  return (
    <Suspense>
      <SuppliersClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
