import { Suspense } from "react";
import { ContractorsClient } from "./contractors-client";
import { listContractors } from "@/lib/master-data/contractor-service";

interface Props {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function ContractorsPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);

  const result = await listContractors({ search, page, pageSize: 20 });

  return (
    <Suspense>
      <ContractorsClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
