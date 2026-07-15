import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { PROJECT_SPEC } from "@/lib/master-data/projects/table-spec";
import { serializeDecimals } from "@/lib/serialize";
import { ProjectsClient } from "./projects-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const state = parseTableQuery(params, PROJECT_SPEC);
  const args = buildPrismaArgs(state, PROJECT_SPEC);
  const where = { ...args.where, deletedAt: null };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      ...args,
      where,
      include: { _count: { select: { categories: { where: { deletedAt: null } } } } },
    }),
    prisma.project.count({ where }),
  ]);

  return (
    <Suspense>
      <ProjectsClient
        data={serializeDecimals(rows)}
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        searchValue={state.search ?? ""}
      />
    </Suspense>
  );
}
