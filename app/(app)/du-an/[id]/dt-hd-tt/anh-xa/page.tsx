import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { unmappedRows } from "@/lib/du-an/dt-hd-tt/anh-xa-filter";
import { listAliasBoard } from "@/lib/du-an/dt-hd-tt/alias-service";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { ANH_XA_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { AnhXaClient } from "./anh-xa-client";

/**
 * Màn Ánh xạ: xem cần quyền đọc dự án; gán khóa chưa gán cần `create`, sửa / bỏ gán / xác nhận cần
 * `edit`. Đọc `tab` / `status` / `q` / `key` của URL bằng parser của screen-links — chỉ là bản cho lần
 * render đầu, client giữ và ghi lại URL.
 */
export default async function AnhXaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  // Không có ?tab=: tab đầu tiên còn khóa chưa gán (HĐ → TT → DT), cùng định nghĩa "chưa gán" với báo cáo.
  const liveDtKeys = new Set(board.dtLines.map((l) => l.key));
  const defaultTab = (["hd", "tt", "dt"] as const).find((s) => unmappedRows(board.tabs[s], liveDtKeys).length > 0) ?? "hd";

  return (
    <AnhXaClient
      projectId={projectId}
      board={board}
      initialParams={ANH_XA_URL.parse(toSearchParams(query).toString())}
      defaultTab={defaultTab}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  );
}
