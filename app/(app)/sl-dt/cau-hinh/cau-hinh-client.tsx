"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import {
  patchMilestoneScore,
  bulkUpsertMilestoneScores,
  deleteMilestoneScores,
} from "./actions";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  newRowTemplate?: Partial<T>;
  height?: number | string;
}) => ReactElement;

interface ScoreRow extends RowWithId {
  milestoneText: string;
  score: number;
  sortOrder: number;
}

interface Props {
  scores: Array<{ id: number; milestoneText: string; score: number; sortOrder: number }>;
}

const columns: DataGridColumn<ScoreRow>[] = [
  { id: "milestoneText", title: "Tên mốc", kind: "text", width: 320 },
  { id: "score", title: "Điểm (0–100)", kind: "number", width: 120 },
  { id: "sortOrder", title: "Thứ tự", kind: "number", width: 100 },
];

export function CauHinhClient({ scores }: Props) {
  const router = useRouter();
  const rows: ScoreRow[] = scores.map((s) => ({
    id: s.id,
    milestoneText: s.milestoneText,
    score: s.score,
    sortOrder: s.sortOrder,
  }));

  const handlers: DataGridHandlers<ScoreRow> = {
    onCellEdit: async (rowId, col, value) => {
      const updated = await patchMilestoneScore(rowId, { [col]: value });
      router.refresh();
      return updated as ScoreRow;
    },
    onBulkPaste: async (patches) => {
      const result = (await bulkUpsertMilestoneScores(
        patches as Array<Record<string, unknown> & { id?: number }>,
      )) as ScoreRow[];
      router.refresh();
      return result;
    },
    onAddRow: async (template) => {
      const result = (await bulkUpsertMilestoneScores([
        { milestoneText: "Mốc mới", score: 0, sortOrder: rows.length, ...template },
      ])) as ScoreRow[];
      router.refresh();
      return result[0];
    },
    onDeleteRows: async (ids) => {
      await deleteMilestoneScores(ids);
      router.refresh();
    },
  };

  return (
    <DataGrid<ScoreRow>
      columns={columns}
      rows={rows}
      handlers={handlers}
      newRowTemplate={{ milestoneText: "Mốc mới", score: 0, sortOrder: rows.length }}
    />
  );
}
