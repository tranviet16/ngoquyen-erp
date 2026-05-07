import { getConsolidatedPR } from "@/lib/tai-chinh/consolidated-pr-service";
import { PrClient } from "@/components/tai-chinh/pr-client";

export const dynamic = "force-dynamic";

export default async function PhaiThuTraPage() {
  const raw = await getConsolidatedPR();
  const rows = raw.map((r) => ({ ...r, amountVnd: r.amountVnd.toString() }));
  return <PrClient rows={rows} />;
}
