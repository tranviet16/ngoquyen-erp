import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs } from "@/lib/table/query-params";
import { LOAN_SPEC } from "@/lib/tai-chinh/loans/table-spec";
import { serializeDecimals } from "@/lib/serialize";
import { LoanListClient } from "@/components/tai-chinh/loan-list-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VayPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const state = parseTableQuery(params, LOAN_SPEC);
  const args = buildPrismaArgs(state, LOAN_SPEC);
  const where = { ...args.where, deletedAt: null };

  const [loans, total] = await Promise.all([
    prisma.loanContract.findMany({
      ...args,
      where,
      include: { payments: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } } },
    }),
    prisma.loanContract.count({ where }),
  ]);

  return (
    <LoanListClient
      loans={serializeDecimals(loans)}
      total={total}
      page={state.page}
      pageSize={state.pageSize}
      searchValue={state.search ?? ""}
    />
  );
}
