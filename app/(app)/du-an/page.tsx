import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getViewableProjectIds } from "@/lib/acl";
import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { DU_AN_SPEC } from "@/lib/master-data/du-an/table-spec";
import { DuAnListClient } from "./du-an-list-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DuAnPage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");

  const v = await getViewableProjectIds(session.user.id);

  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (typeof val === "string") params.set(k, val);
  }

  const state = parseTableQuery(params, DU_AN_SPEC);

  // No viewable projects — show empty list
  if (v.kind === "none") {
    return (
      <Suspense>
        <DuAnListClient
          data={[]}
          total={0}
          page={state.page}
          pageSize={state.pageSize}
          searchValue={state.search ?? ""}
        />
      </Suspense>
    );
  }

  const args = buildPrismaArgs(state, DU_AN_SPEC);
  const where = {
    ...args.where,
    deletedAt: null,
    ...(v.kind === "subset" ? { id: { in: v.ids } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      ...args,
      where,
      include: { _count: { select: { categories: { where: { deletedAt: null } } } } },
    }),
    prisma.project.count({ where }),
  ]);

  const items = rows.map((p) => ({
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
        total={total}
        page={state.page}
        pageSize={state.pageSize}
        searchValue={state.search ?? ""}
      />
    </Suspense>
  );
}
