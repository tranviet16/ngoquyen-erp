"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import type { PaymentPlanRow } from "@/lib/sl-dt/report-service";
import {
  patchPaymentPlanByLot,
  bulkUpsertPaymentPlans,
  deletePaymentPlansByLot,
} from "./actions";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface Row extends RowWithId {
  lotName: string;
  phaseCode: string;
  estimateValue: number;
  dot1Amount: number;
  dot1Milestone: string | null;
  dot2Amount: number;
  dot2Milestone: string | null;
  dot3Amount: number;
  dot3Milestone: string | null;
  dot4Amount: number;
  dot4Milestone: string | null;
}

interface Props {
  rows: PaymentPlanRow[];
  milestoneOptions: string[];
}

export function PaymentPlanClient({ rows: initial, milestoneOptions }: Props) {
  const router = useRouter();
  const milestoneSelect: SelectOption[] = milestoneOptions.map((m, i) => ({ id: i + 1, name: m }));

  const rows: Row[] = initial.map((r) => ({
    id: r.lotId,
    lotName: r.lotName,
    phaseCode: r.phaseCode,
    estimateValue: r.estimateValue,
    dot1Amount: r.dot1Amount,
    dot1Milestone: r.dot1Milestone,
    dot2Amount: r.dot2Amount,
    dot2Milestone: r.dot2Milestone,
    dot3Amount: r.dot3Amount,
    dot3Milestone: r.dot3Milestone,
    dot4Amount: r.dot4Amount,
    dot4Milestone: r.dot4Milestone,
  }));

  // Milestone select uses the milestone TEXT as id (string-based select)
  const milestoneStringSelect: SelectOption[] = milestoneOptions.map((m) => ({ id: m, name: m }));

  const columns: DataGridColumn<Row>[] = [
    { id: "lotName", title: "Lô", kind: "text", width: 200, readonly: true },
    { id: "phaseCode", title: "G.đoạn", kind: "text", width: 80, readonly: true },
    { id: "estimateValue", title: "Dự toán", kind: "currency", width: 130, readonly: true },
    { id: "dot1Amount", title: "Đợt 1", kind: "currency", width: 110 },
    { id: "dot1Milestone", title: "Mốc 1", kind: "select", width: 160, options: milestoneStringSelect },
    { id: "dot2Amount", title: "Đợt 2", kind: "currency", width: 110 },
    { id: "dot2Milestone", title: "Mốc 2", kind: "select", width: 160, options: milestoneStringSelect },
    { id: "dot3Amount", title: "Đợt 3", kind: "currency", width: 110 },
    { id: "dot3Milestone", title: "Mốc 3", kind: "select", width: 160, options: milestoneStringSelect },
    { id: "dot4Amount", title: "Đợt 4", kind: "currency", width: 110 },
    { id: "dot4Milestone", title: "Mốc 4", kind: "select", width: 160, options: milestoneStringSelect },
  ];
  void milestoneSelect;

  const handlers: DataGridHandlers<Row> = {
    onCellEdit: async (rowId, col, value) => {
      await patchPaymentPlanByLot(rowId, { [col]: value });
      router.refresh();
    },
    onBulkPaste: async (patches) => {
      await bulkUpsertPaymentPlans(
        patches.map((p) => ({ ...p, lotId: (p as Row).id })) as Array<
          Record<string, unknown> & { lotId: number }
        >,
      );
      router.refresh();
    },
    onDeleteRows: async (ids) => {
      await deletePaymentPlansByLot(ids);
      router.refresh();
    },
  };

  return <DataGrid<Row> columns={columns} rows={rows} handlers={handlers} height={600} />;
}
