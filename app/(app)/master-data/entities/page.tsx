import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { ENTITY_SPEC } from "@/lib/master-data/entities/table-spec";
import { EntitiesClient } from "./entities-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EntitiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const state = parseTableQuery(params, ENTITY_SPEC);
  const args = buildPrismaArgs(state, ENTITY_SPEC);

  const [rows, total] = await Promise.all([
    prisma.entity.findMany({
      ...args,
      where: { ...args.where, deletedAt: null },
    }),
    prisma.entity.count({ where: { ...args.where, deletedAt: null } }),
  ]);

  return (
    <Suspense>
      <EntitiesClient
        data={rows}
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        searchValue={state.search ?? ""}
      />
    </Suspense>
  );
}
