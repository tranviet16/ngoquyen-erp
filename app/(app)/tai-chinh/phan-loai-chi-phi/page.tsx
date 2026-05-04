import { listExpenseCategories } from "@/lib/tai-chinh/expense-category-service";
import { ExpenseCategoryClient } from "@/components/tai-chinh/expense-category-client";

export const dynamic = "force-dynamic";

export default async function PhanLoaiChiPhiPage() {
  const categories = await listExpenseCategories();
  return <ExpenseCategoryClient categories={categories} />;
}
