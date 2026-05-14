import { listRounds, type RoundStatus, type PaymentCategory } from "@/lib/payment/payment-service";
import { RoundListClient } from "./round-list-client";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const status = (sp.status as RoundStatus | undefined) || undefined;
  const category = (sp.category as PaymentCategory | undefined) || undefined;
  const rounds = await listRounds({ month, status, category });
  return (
    <RoundListClient
      initialRounds={rounds}
      initialFilter={{ month, status, category }}
    />
  );
}
