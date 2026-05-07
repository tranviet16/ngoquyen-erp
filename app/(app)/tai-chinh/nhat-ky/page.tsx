import { listJournalEntries } from "@/lib/tai-chinh/journal-service";
import { listExpenseCategories } from "@/lib/tai-chinh/expense-category-service";
import { JournalGridClient } from "@/components/tai-chinh/journal-grid-client";

export const dynamic = "force-dynamic";

export default async function NhatKyPage() {
  const [{ items }, categories] = await Promise.all([
    listJournalEntries({ pageSize: 200 }),
    listExpenseCategories(),
  ]);

  const rows = items.map((it) => ({
    ...it,
    amountVnd: it.amountVnd.toString(),
  }));

  return <JournalGridClient rows={rows} categories={categories} />;
}
