import { getConsolidatedPR } from "@/lib/tai-chinh/consolidated-pr-service";
import { PrClient } from "@/components/tai-chinh/pr-client";

export const dynamic = "force-dynamic";

export default async function PhaiThuTraPage() {
  const raw = await getConsolidatedPR();
  const rows = raw.map((r) => ({
    ...r,
    amountVnd: r.amountVnd.toString(),
    sourceAmountVnd: r.sourceAmountVnd?.toString() ?? null,
    overrideAmountVnd: r.overrideAmountVnd?.toString() ?? null,
    dueDate: r.dueDate?.toISOString() ?? null,
  }));
  return <PrClient rows={rows} />;
}
