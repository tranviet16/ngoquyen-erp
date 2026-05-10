import { listLoanContracts } from "@/lib/tai-chinh/loan-service";
import { LoanListClient } from "@/components/tai-chinh/loan-list-client";
import { serializeDecimals } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function VayPage() {
  const loans = await listLoanContracts();
  return <LoanListClient loans={serializeDecimals(loans)} />;
}
