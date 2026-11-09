"use client";

import { useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, SelectOption } from "@/components/data-grid";
import { NEW_ROW_PROJECT_REQUIRED_MESSAGE, NewRowProjectSelect } from "./new-row-project-select";
import { unwrapActionResult } from "./unwrap-action-result";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends { id: number }>(props: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  newRowTemplate?: Partial<T>;
  role?: string;
}) => ReactElement;

export interface OpeningRow {
  id: number;
  entityId: number;
  partyId: number;
  projectId: number | null;
  balanceTt: string;
  balanceHd: string;
  asOfDate: string;
  note: string | null;
}

/**
 * Server action của lưới. Mỗi action trả thẳng dữ liệu (số dư nhân công, ném khi lỗi) hoặc
 * `{ ok, row | rows } | { ok: false, message }` (số dư vật tư) — xem unwrapActionResult.
 */
export interface OpeningActions {
  patch: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  bulkUpsert: (rows: Array<Record<string, unknown> & { id?: number }>) => Promise<unknown>;
  deleteMany: (ids: number[]) => Promise<unknown>;
}

interface Props {
  initialData: OpeningRow[];
  entities: SelectOption[];
  partyOptions: SelectOption[];
  projects: SelectOption[];
  partyLabel: string;
  defaults: { entityId: number; partyId: number };
  actions: OpeningActions;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  role?: string;
  /** Sổ vật tư: bắt buộc chọn công trình trước khi tạo dòng (sổ nhân công không truyền). */
  requireProject?: boolean;
}

export function dbObToRow(b: Record<string, unknown>): OpeningRow {
  const date = b.asOfDate as Date | string;
  return {
    id: Number(b.id),
    entityId: Number(b.entityId),
    partyId: Number(b.partyId),
    projectId: b.projectId == null ? null : Number(b.projectId),
    balanceTt: String(b.balanceTt),
    balanceHd: String(b.balanceHd),
    asOfDate: (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10),
    note: (b.note as string | null) ?? null,
  };
}

export function LedgerOpeningGrid({
  initialData,
  entities,
  partyOptions,
  projects,
  partyLabel,
  defaults,
  actions,
  canCreate,
  canEdit,
  canDelete,
  requireProject = false,
}: Props) {
  const router = useRouter();
  const [newRowProjectId, setNewRowProjectId] = useState<number | null>(null);

  const columns = useMemo<DataGridColumn<OpeningRow>[]>(
    () => [
      // entityId/partyId/projectId: plain integer FKs (no Prisma join); sort by option name via kind:"select" + options
      { id: "entityId", title: "Chủ thể", kind: "select", width: 160, options: entities, sortable: true, filterable: true, filterKind: "select" },
      { id: "partyId", title: partyLabel, kind: "select", width: 180, options: partyOptions, sortable: true, filterable: true, filterKind: "select" },
      { id: "projectId", title: "Dự án", kind: "select", width: 160, options: projects, sortable: true, filterable: true, filterKind: "select" },
      { id: "asOfDate", title: "Ngày đầu kỳ", kind: "date", width: 120, sortable: true, filterable: true, filterKind: "date" },
      { id: "balanceTt", title: "Số dư TT", kind: "currency", width: 140, sortable: true, filterable: true, filterKind: "number" },
      { id: "balanceHd", title: "Số dư HĐ", kind: "currency", width: 140, sortable: true, filterable: true, filterKind: "number" },
      { id: "note", title: "Ghi chú", kind: "text", width: 200, sortable: true, filterable: true, filterKind: "text" },
    ],
    [entities, partyOptions, projects, partyLabel],
  );

  const handlers: DataGridHandlers<OpeningRow> = {
    ...(canEdit ? { onCellEdit: async (rowId: number, col: string, value: unknown) => {
      const updated = unwrapActionResult(await actions.patch(rowId, { [col]: value }), "row");
      router.refresh();
      return dbObToRow(updated as Record<string, unknown>);
    }, onBulkPaste: async (patches: Array<Partial<OpeningRow>>) => {
      const result = unwrapActionResult(await actions.bulkUpsert(
        patches.map((p) => {
          // Dòng dán mới thiếu công trình lấy "Công trình cho dòng mới" (server vẫn kiểm bắt buộc).
          const row = p as Record<string, unknown> & { id?: number };
          return requireProject && !row.id && row.projectId == null && newRowProjectId != null
            ? { ...row, projectId: newRowProjectId }
            : row;
        }),
      ), "rows");
      router.refresh();
      return (result as Record<string, unknown>[]).map(dbObToRow);
    } } : {}),
    ...(canCreate ? { onAddRow: async (template: Partial<OpeningRow>) => {
      const projectId = template.projectId ?? newRowProjectId;
      if (requireProject && projectId == null) {
        toast.error(NEW_ROW_PROJECT_REQUIRED_MESSAGE);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const stub: Record<string, unknown> = {
        entityId: defaults.entityId,
        partyId: defaults.partyId,
        projectId: projectId ?? null,
        balanceTt: "0",
        balanceHd: "0",
        asOfDate: today,
        note: null,
        ...(template as Record<string, unknown>),
      };
      try {
        const result = unwrapActionResult(await actions.bulkUpsert([stub]), "rows") as Record<string, unknown>[];
        router.refresh();
        return dbObToRow(result[0]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi tạo dòng — chọn Chủ thể & đối tác trước");
        throw err;
      }
    } } : {}),
    ...(canDelete ? { onDeleteRows: async (ids: number[]) => {
      unwrapActionResult(await actions.deleteMany(ids));
      router.refresh();
    } } : {}),
  };

  const grid = (
    <DataGrid<OpeningRow>
      columns={columns}
      rows={initialData}
      handlers={handlers}
      height={500}
    />
  );
  if (!requireProject || !canCreate) return grid;
  return (
    <div className="space-y-2">
      <NewRowProjectSelect projects={projects} value={newRowProjectId} onChange={setNewRowProjectId} />
      {grid}
    </div>
  );
}
