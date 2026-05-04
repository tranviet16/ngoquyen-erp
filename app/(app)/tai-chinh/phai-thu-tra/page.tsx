import { getConsolidatedPR } from "@/lib/tai-chinh/consolidated-pr-service";
import { PrClient } from "@/components/tai-chinh/pr-client";

export const dynamic = "force-dynamic";

export default async function PhaiThuTraPage() {
  const rows = await getConsolidatedPR();
  return <PrClient rows={rows} />;
}
