import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { SUPPLIER_SPEC } from "@/lib/master-data/suppliers/table-spec";
import { SuppliersClient } from "./suppliers-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SuppliersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const state = parseTableQuery(params, SUPPLIER_SPEC);
  const args = buildPrismaArgs(state, SUPPLIER_SPEC);

  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      ...args,
      where: { ...args.where, deletedAt: null },
    }),
    prisma.supplier.count({ where: { ...args.where, deletedAt: null } }),
  ]);

  return (
    <Suspense>
      <SuppliersClient
        data={rows}
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        searchValue={state.search ?? ""}
      />
    </Suspense>
  );
}
