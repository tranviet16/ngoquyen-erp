import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/acl/effective";
import { listRounds, type RoundStatus } from "@/lib/payment/payment-service";
import { RoundListClient } from "./round-list-client";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const status = (sp.status as RoundStatus | undefined) || undefined;
  const [rounds, canCreate] = await Promise.all([
    listRounds({ month, status }),
    canAccess(session.user.id, "thanh-toan.ke-hoach", { minLevel: "create", scope: "any" }),
  ]);
  const editableRoundIds = new Set(
    await Promise.all(
      rounds.map(async (round) => {
        if (round.departmentId === null) return -1;
        const allowed = await canAccess(session.user.id, "thanh-toan.ke-hoach", {
          minLevel: "edit",
          scope: { kind: "dept", deptId: round.departmentId },
        });
        return allowed ? round.id : -1;
      }),
    ),
  );
  return (
    <RoundListClient
      initialRounds={rounds}
      initialFilter={{ month, status }}
      canCreate={canCreate}
      editableRoundIds={Array.from(editableRoundIds).filter((id) => id !== -1)}
    />
  );
}
