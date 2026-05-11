import { listJournalEntries } from "@/lib/tai-chinh/journal-service";
import { listExpenseCategories } from "@/lib/tai-chinh/expense-category-service";
import { listCashAccounts } from "@/lib/tai-chinh/cash-account-service";
import { JournalGridClient } from "@/components/tai-chinh/journal-grid-client";

export const dynamic = "force-dynamic";

export default async function NhatKyPage() {
  const [{ items }, categories, cashAccounts] = await Promise.all([
    listJournalEntries({ pageSize: 200 }),
    listExpenseCategories(),
    listCashAccounts(),
  ]);

  const rows = items.map((it) => ({
    ...it,
    amountVnd: it.amountVnd.toString(),
  }));

  const accounts = cashAccounts.map((a) => ({ id: a.id, name: a.name }));

  return <JournalGridClient rows={rows} categories={categories} cashAccounts={accounts} />;
}
