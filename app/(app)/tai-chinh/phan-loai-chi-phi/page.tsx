import { listJournalEntries, type CostBehavior } from "@/lib/tai-chinh/journal-service";
import { listExpenseCategories } from "@/lib/tai-chinh/expense-category-service";
import { ExpenseFilterClient } from "@/components/tai-chinh/expense-filter-client";

export const dynamic = "force-dynamic";

interface SearchParams {
  g?: string;        // composed key: thu-fixed | thu-variable | chi-fixed | chi-variable | transfer
  c?: string;        // expenseCategoryId
  f?: string;        // dateFrom yyyy-mm-dd
  t?: string;        // dateTo
  q?: string;        // keyword
  page?: string;
}

const GROUP_MAP: Record<string, { entryType?: string; costBehavior?: CostBehavior }> = {
  "thu-fixed": { entryType: "thu", costBehavior: "fixed" },
  "thu-variable": { entryType: "thu", costBehavior: "variable" },
  "chi-fixed": { entryType: "chi", costBehavior: "fixed" },
  "chi-variable": { entryType: "chi", costBehavior: "variable" },
  "transfer": { entryType: "chuyen_khoan" },
};

export default async function PhanLoaiChiPhiPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const group = sp.g ?? "";
  const mapped = GROUP_MAP[group] ?? {};
  const page = Math.max(1, Number(sp.page) || 1);

  const [result, categories] = await Promise.all([
    listJournalEntries({
      entryType: mapped.entryType,
      costBehavior: mapped.costBehavior,
      expenseCategoryId: sp.c ? Number(sp.c) : undefined,
      dateFrom: sp.f || undefined,
      dateTo: sp.t || undefined,
      q: sp.q || undefined,
      page,
      pageSize: 50,
    }),
    listExpenseCategories(),
  ]);

  const rows = result.items.map((it) => ({
    id: it.id,
    date: it.date.toISOString().slice(0, 10),
    entryType: it.entryType,
    costBehavior: it.costBehavior,
    description: it.description,
    amountVnd: it.amountVnd.toString(),
    fromAccount: it.fromAccountRef?.name ?? it.fromAccount ?? null,
    toAccount: it.toAccountRef?.name ?? it.toAccount ?? null,
    expenseCategoryName: it.expenseCategory ? `${it.expenseCategory.code} - ${it.expenseCategory.name}` : null,
  }));

  return (
    <ExpenseFilterClient
      initial={{
        g: group,
        c: sp.c ?? "",
        f: sp.f ?? "",
        t: sp.t ?? "",
        q: sp.q ?? "",
        page,
      }}
      categories={categories.map((c) => ({ id: c.id, label: `${c.code} - ${c.name}` }))}
      rows={rows}
      total={result.total}
      pageSize={result.pageSize}
      aggregate={{
        totalAmountVnd: result.aggregate.totalAmountVnd.toString(),
        rowCount: result.aggregate.rowCount,
        avgAmountVnd: result.aggregate.avgAmountVnd.toString(),
      }}
    />
  );
}
