import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { ITEM_SPEC } from "@/lib/master-data/items/table-spec";
import { ItemsClient } from "./items-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ItemsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const state = parseTableQuery(params, ITEM_SPEC);
  const args = buildPrismaArgs(state, ITEM_SPEC);

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      ...args,
      where: { ...args.where, deletedAt: null },
    }),
    prisma.item.count({ where: { ...args.where, deletedAt: null } }),
  ]);

  return (
    <Suspense>
      <ItemsClient
        data={rows}
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        searchValue={state.search ?? ""}
      />
    </Suspense>
  );
}
