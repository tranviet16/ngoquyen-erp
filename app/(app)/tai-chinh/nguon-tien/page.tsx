import { listCashAccounts } from "@/lib/tai-chinh/cash-account-service";
import { CashAccountClient } from "@/components/tai-chinh/cash-account-client";

export const dynamic = "force-dynamic";

export default async function NguonTienPage() {
  const accounts = await listCashAccounts();
  const rows = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    openingBalanceVnd: a.openingBalanceVnd.toString(),
    displayOrder: a.displayOrder,
  }));
  return <CashAccountClient rows={rows} />;
}
