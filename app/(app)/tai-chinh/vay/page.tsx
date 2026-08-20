import { prisma } from "@/lib/prisma";
import { parseTableQuery, buildPrismaArgs, hasDisplayOrderSort, applyDisplayOrderPage } from "@/lib/table/query-params";
import { LOAN_SPEC } from "@/lib/tai-chinh/loans/table-spec";
import { serializeDecimals } from "@/lib/serialize";
import { LoanListClient } from "@/components/tai-chinh/loan-list-client";
import { stableSemanticSort } from "@/lib/table/semantic-compare";

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

  const include = { payments: { where: { deletedAt: null }, orderBy: { dueDate: "asc" as const } } };
  const pendingSort = state.sort?.col === "_pending" ? state.sort.dir : null;
  const displaySort = hasDisplayOrderSort(state, LOAN_SPEC);
  const [loadedLoans, total] = await Promise.all([
    pendingSort || displaySort
      ? prisma.loanContract.findMany({ where, include, orderBy: [{ id: "asc" }] })
      : prisma.loanContract.findMany({ ...args, where, include }),
    prisma.loanContract.count({ where }),
  ]);
  const loans = pendingSort
    ? stableSemanticSort(
        loadedLoans,
        (loan) => loan.payments.filter((payment) => payment.status === "pending").length,
        pendingSort,
        "number",
      ).slice(args.skip, args.skip + args.take)
    : displaySort
      ? applyDisplayOrderPage(loadedLoans, state, LOAN_SPEC)
      : loadedLoans;

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
