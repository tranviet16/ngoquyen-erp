"use client";

import { useMemo, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, SelectOption } from "@/components/data-grid";

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

export interface OpeningActions {
  patch: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  bulkUpsert: (rows: Array<Record<string, unknown> & { id?: number }>) => Promise<unknown[]>;
  deleteMany: (ids: number[]) => Promise<void>;
}

interface Props {
  initialData: OpeningRow[];
  entities: SelectOption[];
  partyOptions: SelectOption[];
  projects: SelectOption[];
  partyLabel: string;
  defaults: { entityId: number; partyId: number };
  actions: OpeningActions;
  role?: string;
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
  role,
}: Props) {
  const router = useRouter();

  const columns = useMemo<DataGridColumn<OpeningRow>[]>(
    () => [
      { id: "entityId", title: "Chủ thể", kind: "select", width: 160, options: entities },
      { id: "partyId", title: partyLabel, kind: "select", width: 180, options: partyOptions },
      { id: "projectId", title: "Dự án", kind: "select", width: 160, options: projects },
      { id: "asOfDate", title: "Ngày đầu kỳ", kind: "date", width: 120 },
      { id: "balanceTt", title: "Số dư TT", kind: "currency", width: 140 },
      { id: "balanceHd", title: "Số dư HĐ", kind: "currency", width: 140 },
      { id: "note", title: "Ghi chú", kind: "text", width: 200 },
    ],
    [entities, partyOptions, projects, partyLabel],
  );

  const handlers: DataGridHandlers<OpeningRow> = {
    onCellEdit: async (rowId, col, value) => {
      const updated = await actions.patch(rowId, { [col]: value });
      router.refresh();
      return dbObToRow(updated as Record<string, unknown>);
    },
    onBulkPaste: async (patches) => {
      const result = await actions.bulkUpsert(
        patches.map((p) => p as Record<string, unknown> & { id?: number }),
      );
      router.refresh();
      return (result as Record<string, unknown>[]).map(dbObToRow);
    },
    onAddRow: async (template) => {
      const today = new Date().toISOString().slice(0, 10);
      const stub: Record<string, unknown> = {
        entityId: defaults.entityId,
        partyId: defaults.partyId,
        projectId: null,
        balanceTt: "0",
        balanceHd: "0",
        asOfDate: today,
        note: null,
        ...(template as Record<string, unknown>),
      };
      try {
        const result = await actions.bulkUpsert([stub]);
        router.refresh();
        return dbObToRow(result[0] as Record<string, unknown>);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi tạo dòng — chọn Chủ thể & đối tác trước");
        throw err;
      }
    },
    onDeleteRows: async (ids) => {
      await actions.deleteMany(ids);
      router.refresh();
    },
  };

  return (
    <DataGrid<OpeningRow>
      columns={columns}
      rows={initialData}
      handlers={handlers}
      height={500}
      role={role}
    />
  );
}
