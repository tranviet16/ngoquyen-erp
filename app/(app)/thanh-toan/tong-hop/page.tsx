import { aggregateMonth } from "@/lib/payment/payment-service";
import { TongHopClient } from "./tong-hop-client";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const rows = await aggregateMonth(month);
  return <TongHopClient month={month} rows={rows} />;
}
