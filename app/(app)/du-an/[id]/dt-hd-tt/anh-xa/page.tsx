import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { unmappedRows } from "@/lib/du-an/dt-hd-tt/anh-xa-filter";
import { listAliasBoard } from "@/lib/du-an/dt-hd-tt/alias-service";
import { loadAliasSourceLines } from "@/lib/du-an/dt-hd-tt/alias-source-lines";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { ANH_XA_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { AnhXaClient } from "./anh-xa-client";

/**
 * Màn Ánh xạ: xem cần quyền đọc dự án; gán khóa chưa gán cần `create`, sửa / bỏ gán / xác nhận cần
 * `edit`. Đọc `tab` / `status` / `q` / `key` của URL bằng parser của screen-links — chỉ là bản cho lần
 * render đầu, client giữ và ghi lại URL. Chỉ khi URL có `key` (khóa đang mở) mới đọc dòng nguồn của khóa
 * đó (`loadAliasSourceLines`, tối đa 20 dòng); bảng Ánh xạ không đọc thêm gì.
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

  const initialParams = ANH_XA_URL.parse(toSearchParams(await searchParams).toString());
  const openKey = initialParams.key;
  const [board, canCreate, canEdit, keyLines] = await Promise.all([
    listAliasBoard(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    // Khóa đang mở kèm tab (client luôn ghi tab khi mở khóa): đọc song song với bảng.
    openKey && initialParams.tab ? loadAliasSourceLines(projectId, initialParams.tab, openKey) : null,
  ]);

  // Không có ?tab=: tab đầu tiên còn khóa chưa gán (HĐ → TT → DT), cùng định nghĩa "chưa gán" với báo cáo.
  const liveDtKeys = new Set(board.dtLines.map((l) => l.key));
  const defaultTab = (["hd", "tt", "dt"] as const).find((s) => unmappedRows(board.tabs[s], liveDtKeys).length > 0) ?? "hd";
  // Link có `key` mà không có `tab`: khóa thuộc tab mặc định, chỉ biết sau khi có bảng.
  const sourceLines = keyLines ?? (openKey ? await loadAliasSourceLines(projectId, defaultTab, openKey) : null);

  return (
    <AnhXaClient
      projectId={projectId}
      board={board}
      initialParams={initialParams}
      defaultTab={defaultTab}
      canCreate={canCreate}
      canEdit={canEdit}
      sourceLines={sourceLines}
    />
  );
}
