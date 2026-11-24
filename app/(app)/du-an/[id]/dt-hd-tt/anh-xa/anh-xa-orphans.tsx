"use client";

/**
 * Alias mồ côi: ánh xạ không còn dòng nguồn nào (tên đã sửa, dòng đã xóa, dự toán đã đồng bộ lại).
 * Không ảnh hưởng số liệu; người có quyền `edit` bỏ gán để danh sách gọn.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { GroupOption, OrphanAlias } from "@/lib/du-an/dt-hd-tt/alias-board";
import { softDeleteAlias } from "@/lib/du-an/dt-hd-tt/alias-service";
import { ALIAS_SOURCE_LABEL, ALIAS_STATUS_LABEL } from "@/lib/du-an/dt-hd-tt/register-ui";

interface Props {
  projectId: number;
  orphans: OrphanAlias[];
  groups: GroupOption[];
  canEdit: boolean;
  onChanged: () => void;
}

export function OrphanAliases({ projectId, orphans, groups, canEdit, onChanged }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  if (orphans.length === 0) return null;
  const codeOf = new Map(groups.map((g) => [g.id, g.code]));

  async function remove(alias: OrphanAlias) {
    setBusyId(alias.id);
    try {
      const result = await softDeleteAlias(alias.id, projectId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Đã bỏ ánh xạ "${alias.itemName}"`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Ánh xạ không còn dòng nguồn ({orphans.length})</h3>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1">Nguồn</th>
              <th className="px-2 py-1">Tên hàng</th>
              <th className="px-2 py-1">ĐVT</th>
              <th className="px-2 py-1">Mã nhóm</th>
              <th className="px-2 py-1">Trạng thái</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {orphans.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-2 py-1">{ALIAS_SOURCE_LABEL[a.source]}</td>
                <td className="px-2 py-1">{a.itemName}</td>
                <td className="px-2 py-1">{a.unit}</td>
                <td className="px-2 py-1">{a.groupCodeId !== null ? codeOf.get(a.groupCodeId) ?? `#${a.groupCodeId}` : ""}</td>
                <td className="px-2 py-1">{ALIAS_STATUS_LABEL[a.status]}</td>
                <td className="px-2 py-1 text-right">
                  {canEdit && (
                    <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => remove(a)}>
                      Bỏ ánh xạ
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
