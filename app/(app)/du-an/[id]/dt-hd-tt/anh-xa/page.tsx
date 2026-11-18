import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listAliasBoard } from "@/lib/du-an/dt-hd-tt/alias-service";
import { ALIAS_SOURCES, type AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import { AnhXaClient } from "./anh-xa-client";

/** Màn Ánh xạ: xem cần quyền đọc dự án; gán khóa chưa gán cần `create`, sửa / bỏ gán / xác nhận cần `edit`. */
export default async function AnhXaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [board, canCreate, canEdit, query] = await Promise.all([
    listAliasBoard(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    searchParams,
  ]);

  // Tab mở đầu: theo ?tab=, không có thì tab đầu tiên còn khóa chưa gán (HĐ → TT → DT).
  const asked = typeof query.tab === "string" ? query.tab : undefined;
  const isSource = (v: string | undefined): v is AliasSource => (ALIAS_SOURCES as readonly string[]).includes(v ?? "");
  const firstUnmapped = (["hd", "tt", "dt"] as const).find((s) => board.tabs[s].some((r) => r.alias === null));
  const initialTab: AliasSource = isSource(asked) ? asked : firstUnmapped ?? "hd";

  return <AnhXaClient projectId={projectId} board={board} initialTab={initialTab} canCreate={canCreate} canEdit={canEdit} />;
}
