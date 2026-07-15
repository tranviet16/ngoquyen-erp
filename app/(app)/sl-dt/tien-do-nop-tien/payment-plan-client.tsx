"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { PaymentPlanRow } from "@/lib/sl-dt/report-service";
import { cleanHierarchyLabel, hasHierarchyLabel } from "@/lib/sl-dt/hierarchy";
import { deletePaymentPlansByLot, patchPaymentPlanByLot } from "./actions";

interface Props {
  rows: PaymentPlanRow[];
  milestoneOptions: string[];
}

const amountFields = ["dot1Amount", "dot2Amount", "dot3Amount", "dot4Amount"] as const;
const milestoneFields = ["dot1Milestone", "dot2Milestone", "dot3Milestone", "dot4Milestone"] as const;

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value || 0);
}

export function PaymentPlanClient({ rows, milestoneOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function patch(lotId: number, field: string, value: unknown) {
    startTransition(async () => {
      await patchPaymentPlanByLot(lotId, { [field]: value });
      router.refresh();
    });
  }

  function clearPlan(lotId: number) {
    startTransition(async () => {
      await deletePaymentPlansByLot([lotId]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {pending && <div className="text-xs text-muted-foreground">Đang lưu...</div>}
      <div className="overflow-x-auto rounded border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/50">
            <tr>
              <th className="min-w-[220px] border-r px-2 py-2 text-left">Lô</th>
              <th className="min-w-[130px] border-r px-2 py-2 text-right">Dự toán</th>
              {[1, 2, 3, 4].map((n) => (
                <th key={`dot-${n}`} className="min-w-[250px] border-r px-2 py-2 text-left">
                  Đợt {n}
                </th>
              ))}
              <th className="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row, index) => {
              const parts = [];
              const previous = rows[index - 1];
              const phaseChanged = !previous || previous.phaseCode !== row.phaseCode;
              const groupChanged = phaseChanged || previous.groupCode !== row.groupCode;
              if (phaseChanged) {
                if (hasHierarchyLabel(row.phaseCode)) {
                  parts.push(
                    <tr key={`phase-${row.phaseCode}`} className="border-t-[3px] border-slate-500 bg-slate-200 text-sm font-bold text-slate-950 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50">
                      <td colSpan={7} className="px-3 py-2.5">{cleanHierarchyLabel(row.phaseCode)}</td>
                    </tr>,
                  );
                }
              }
              if (groupChanged) {
                if (hasHierarchyLabel(row.groupCode)) {
                  parts.push(
                    <tr key={`group-${row.phaseCode}-${row.groupCode}`} className="border-t border-slate-300 bg-slate-50 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
                      <td colSpan={7} className="border-l-4 border-primary px-3 py-2">{cleanHierarchyLabel(row.groupCode)}</td>
                    </tr>,
                  );
                }
              }

              parts.push(
                <tr key={row.lotId} className="border-t hover:bg-muted/20">
                  <td className="border-r px-2 py-1.5 pl-6 font-medium">{row.lotName}</td>
                  <td className="border-r px-2 py-1.5 text-right tabular-nums">{money(row.estimateValue)}</td>
                  {[0, 1, 2, 3].map((idx) => {
                    const amountField = amountFields[idx];
                    const milestoneField = milestoneFields[idx];
                    return (
                      <td key={amountField} className="border-r px-2 py-1.5">
                        <div className="grid grid-cols-[100px_minmax(120px,1fr)] gap-1">
                          <input
                            type="number"
                            step="any"
                            defaultValue={row[amountField]}
                            disabled={pending}
                            onBlur={(e) => patch(row.lotId, amountField, Number(e.target.value || 0))}
                            className="h-8 rounded border bg-background px-2 text-right tabular-nums"
                          />
                          <select
                            defaultValue={row[milestoneField] ?? ""}
                            disabled={pending}
                            onChange={(e) => patch(row.lotId, milestoneField, e.target.value || null)}
                            className="h-8 rounded border bg-background px-2"
                          >
                            <option value="">-</option>
                            {milestoneOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      title="Xóa kế hoạch nộp tiền của lô"
                      disabled={pending}
                      onClick={() => clearPlan(row.lotId)}
                      className="inline-flex size-8 items-center justify-center rounded border hover:bg-muted disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>,
              );
              return parts;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
