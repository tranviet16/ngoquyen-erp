"use client";

/**
 * Bảng khóa của một tab Ánh xạ: mỗi khóa tên|ĐVT một dòng; khóa đang mở (`key` của URL) có ô gán ngay
 * dưới, kèm dòng nguồn của khóa (hd / tt) khi trang đã đọc đúng khóa đó. Nút "Gán" / "Sửa" chỉ hiện khi
 * người dùng mở được khóa; mở / đóng / sang khóa kế do màn quyết định (`AnhXaClient`).
 * Móc kiểm thử: `data-open-key-button` (khóa của nút mở).
 */

import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { vndFormatter } from "@/lib/format";
import type { AliasBoard, AliasKeyRow } from "@/lib/du-an/dt-hd-tt/alias-board";
// Chỉ kiểu: module loader đọc Prisma, không được vào bundle client.
import type { AliasSourceLines } from "@/lib/du-an/dt-hd-tt/alias-source-lines";
import { rowStatus } from "@/lib/du-an/dt-hd-tt/anh-xa-filter";
import { ALIAS_STATUS_LABEL, type AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import { AliasEditor } from "./anh-xa-editor";
import { AnhXaSourceLines } from "./anh-xa-source-lines";

const AMOUNT_TITLE: Record<AliasSource, string> = { dt: "Giá trị DT", hd: "Σ chưa VAT", tt: "Σ gồm VAT" };
const PARTY_TITLE: Record<AliasSource, string> = { dt: "NCC phụ trách", hd: "NCC", tt: "Đầu mối" };

interface Props {
  projectId: number;
  tab: AliasSource;
  /** Khóa còn lại sau bộ lọc. */
  rows: readonly AliasKeyRow[];
  board: Pick<AliasBoard, "groups" | "dtLines">;
  liveDtKeys: ReadonlySet<string>;
  openKey: string | null;
  canOpenRow: (row: AliasKeyRow) => boolean;
  /** Có quyền `edit` — bỏ gán alias đang có. */
  canEdit: boolean;
  /** Đang điều hướng để mở một khóa: khóa các nút mở và ô gán. */
  opening: boolean;
  sourceLines: AliasSourceLines | null;
  onOpen: (itemKey: string) => void;
  onClose: () => void;
  /** Ô gán xong (lưu / bỏ gán / đóng): đóng và tải lại. */
  onDone: () => void;
  /** "Lưu và sang dòng kế" đã lưu khóa này. */
  onAdvance: (itemKey: string) => void;
}

export function AnhXaKeyTable({ projectId, tab, rows, board, liveDtKeys, openKey, canOpenRow, canEdit, opening, sourceLines, onOpen, onClose, onDone, onAdvance }: Props) {
  const isDt = tab === "dt";
  const colSpan = isDt ? 9 : 10;
  const groupCode = new Map(board.groups.map((g) => [g.id, g.code]));
  const dtLabel = new Map(board.dtLines.map((l) => [l.key, l.label]));

  return (
    <div className="max-h-[640px] overflow-auto rounded border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-1">Tên hàng</th>
            <th className="px-2 py-1">ĐVT</th>
            {isDt && <th className="px-2 py-1">Loại</th>}
            <th className="px-2 py-1 text-right">Số dòng</th>
            <th className="px-2 py-1 text-right">{AMOUNT_TITLE[tab]}</th>
            <th className="px-2 py-1">{PARTY_TITLE[tab]}</th>
            <th className="px-2 py-1">Mã nhóm</th>
            {!isDt && <th className="px-2 py-1">Dòng DT</th>}
            {!isDt && <th className="px-2 py-1 text-right">Hệ số</th>}
            <th className="px-2 py-1">Trạng thái</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = r.alias;
            const canOpen = canOpenRow(r);
            const open = canOpen && openKey === r.itemKey;
            const status = rowStatus(r, liveDtKeys);
            const lines = sourceLines && sourceLines.source === r.source && sourceLines.itemKey === r.itemKey ? sourceLines.lines : null;
            return (
              <Fragment key={r.itemKey}>
                <tr className={`border-t ${status === "chua_gan" ? "bg-amber-50/60" : ""}`}>
                  <td className="px-2 py-1">{r.itemName}</td>
                  <td className="px-2 py-1">{r.unit}</td>
                  {isDt && <td className="px-2 py-1">{a?.kind && a.kind !== r.lineKind ? <strong>{a.kind}</strong> : r.lineKind}</td>}
                  <td className="px-2 py-1 text-right">{r.lineCount}</td>
                  <td className="px-2 py-1 text-right">{vndFormatter(r.amount)}</td>
                  <td className="px-2 py-1 text-xs">{r.parties}</td>
                  <td className="px-2 py-1">{a?.groupCodeId ? groupCode.get(a.groupCodeId) ?? `#${a.groupCodeId}` : ""}</td>
                  {!isDt && <td className="max-w-72 truncate px-2 py-1 text-xs" title={a?.dtKey ? dtLabel.get(a.dtKey) : undefined}>{a?.dtKey ? dtLabel.get(a.dtKey) ?? "(dòng DT không còn)" : ""}</td>}
                  {!isDt && <td className="px-2 py-1 text-right">{a?.factor ?? ""}</td>}
                  <td className="px-2 py-1">{status === "chua_gan" ? <span className="text-amber-700">chưa gán</span> : ALIAS_STATUS_LABEL[status]}</td>
                  <td className="px-2 py-1 text-right">
                    {canOpen && (
                      <Button
                        size="sm"
                        variant={open ? "secondary" : "outline"}
                        disabled={opening}
                        onClick={() => (open ? onClose() : onOpen(r.itemKey))}
                        data-open-key-button={r.itemKey}
                      >
                        {a ? "Sửa" : "Gán"}
                      </Button>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={colSpan} className="p-0">
                      <AliasEditor
                        projectId={projectId}
                        row={r}
                        groups={board.groups}
                        dtLines={board.dtLines}
                        canDelete={canEdit}
                        pending={opening}
                        onDone={onDone}
                        onAdvance={() => onAdvance(r.itemKey)}
                      />
                      {r.source !== "dt" && lines && (
                        <AnhXaSourceLines projectId={projectId} source={r.source} itemKey={r.itemKey} lines={lines} lineCount={r.lineCount} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={colSpan} className="px-2 py-6 text-center text-muted-foreground">Không có khóa nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
