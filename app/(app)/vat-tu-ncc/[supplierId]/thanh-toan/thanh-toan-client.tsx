"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput, isoToDmy } from "@/components/ui/date-input";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";
import {
  createMaterialTransactionAction,
  patchMaterialTransactionAction,
  softDeleteMaterialTransactionAction,
} from "@/lib/cong-no-vt/material-ledger-actions";
import { transactionSchema, type TransactionInput } from "@/lib/cong-no-vt/schemas";
import type { ActionResult } from "@/lib/vat-tu-ncc/action-result";
import { TRANSACTION_TYPE_LABELS } from "@/lib/ledger/transaction-classification";
import { formatDate, formatNumber } from "@/lib/utils/format";

type PaymentType = "thanh_toan" | "thue_hd";

export type PaymentTxRow = {
  id: number;
  date: string;
  transactionType: PaymentType;
  entityId: number;
  projectId: number | null;
  amountTt: string;
  amountHd: string;
  totalTt: number;
  totalHd: number;
  invoiceNo: string | null;
  invoiceDate: string | null;
  content: string | null;
  /** Dòng sinh từ đợt thanh toán — chỉ xem. */
  fromRound: boolean;
  /** Ngày ghi sổ ≤ mốc chuyển đổi hoặc rơi vào kỳ NCC đã ký — chỉ xem (server cũng từ chối). */
  locked: boolean;
  /** Lý do khoá để hiển thị: giai đoạn chuyển đổi từ Excel hoặc kỳ đã ký. */
  lockReason: "cutover" | "signed" | null;
};

interface Props {
  supplierId: number;
  /** Công trình của cặp (từ `?projectId=`) — mọi dòng ghi vào cặp này. */
  projectId: number;
  currentDebt: number;
  rows: PaymentTxRow[];
  entities: { id: number; name: string }[];
  projects: { id: number; code: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  /** Mốc chuyển đổi (YYYY-MM-DD, bao gồm) khi đã có run chuyển đổi được commit: ngày ≤ mốc không ghi được. */
  cutoverDate: string | null;
  /** Admin: được xác nhận để ghi / sửa / xoá trong kỳ đã ký / giai đoạn chuyển đổi (server kiểm lại). */
  canOverrideLocked?: boolean;
}

/** Lỗi khoá kỳ mà admin được phép xác nhận để vẫn ghi / sửa / xoá. */
const isLockedRefusal = (r: ActionResult) => !r.ok && (r.code === "signed_period" || r.code === "cutover_locked");

const LOCK_CONFIRM_TAIL =
  "Công nợ, báo cáo và bảng đối chiếu đã ký của kỳ này và các kỳ sau sẽ được cập nhật theo " +
  "(có ghi lại người sửa).";

type FormInput = z.input<typeof transactionSchema>;

const TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: "thanh_toan", label: "Chuyển khoản" },
  { value: "thue_hd", label: TRANSACTION_TYPE_LABELS.thue_hd },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Nội dung tự sinh: thuế HĐ theo số + ngày hoá đơn, chuyển khoản theo ngày ghi sổ. */
function buildContent(type: PaymentType, date: string, invoiceNo?: string | null, invoiceDate?: string | null) {
  if (type === "thue_hd") return `Thuế HĐ: ${invoiceNo?.trim() ?? ""} ngày ${isoToDmy(invoiceDate)}`;
  return `CK ngày ${isoToDmy(date)}`;
}

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function ThanhToanClient({
  supplierId,
  projectId,
  currentDebt,
  rows,
  entities,
  projects,
  canCreate,
  canEdit,
  cutoverDate,
  canOverrideLocked = false,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.code])), [projects]);

  const emptyValues = (): FormInput => ({
    date: todayIso(),
    transactionType: "thanh_toan",
    entityId: entities[0]?.id ?? 0,
    partyId: supplierId,
    projectId,
    amountTt: "0",
    amountHd: "0",
    invoiceNo: "",
    invoiceDate: "",
  });

  const form = useForm<FormInput, unknown, TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: emptyValues(),
  });
  const { register, handleSubmit, control, setValue, reset, setError, formState: { errors } } = form;
  const type = useWatch({ control, name: "transactionType" }) as PaymentType;
  const date = useWatch({ control, name: "date" });
  const watchedInvoiceNo = useWatch({ control, name: "invoiceNo" });
  const watchedInvoiceDate = useWatch({ control, name: "invoiceDate" });

  const sortColumns = useMemo(() => ({
    date: { accessor: (r: PaymentTxRow) => r.date, kind: "date" as const },
    type: { accessor: (r: PaymentTxRow) => TRANSACTION_TYPE_LABELS[r.transactionType], kind: "text" as const },
    entity: { accessor: (r: PaymentTxRow) => entityMap.get(r.entityId) ?? "", kind: "text" as const },
    project: { accessor: (r: PaymentTxRow) => (r.projectId ? projectMap.get(r.projectId) ?? "" : ""), kind: "text" as const },
    tt: { accessor: (r: PaymentTxRow) => r.totalTt, kind: "currency" as const },
    hd: { accessor: (r: PaymentTxRow) => r.totalHd, kind: "currency" as const },
    invoiceNo: { accessor: (r: PaymentTxRow) => r.invoiceNo, kind: "text" as const },
    invoiceDate: { accessor: (r: PaymentTxRow) => r.invoiceDate, kind: "date" as const },
    content: { accessor: (r: PaymentTxRow) => r.content, kind: "text" as const },
    source: { accessor: (r: PaymentTxRow) => (r.fromRound ? "Đợt thanh toán" : "Nhập tay"), kind: "text" as const },
    locked: { accessor: (r: PaymentTxRow) => (r.locked ? 1 : 0), kind: "number" as const },
  }), [entityMap, projectMap]);
  const { sort, sortedRows, toggleSort } = useSortableRows(rows, sortColumns);

  function resetForm() {
    setEditingId(null);
    reset(emptyValues());
  }

  function startEdit(r: PaymentTxRow) {
    setEditingId(r.id);
    reset({
      date: r.date,
      transactionType: r.transactionType,
      entityId: r.entityId,
      partyId: supplierId,
      projectId: r.projectId ?? projectId,
      amountTt: r.amountTt,
      amountHd: r.amountHd,
      invoiceNo: r.invoiceNo ?? "",
      invoiceDate: r.invoiceDate ?? "",
    });
  }

  const onValid = async (data: TransactionInput) => {
    if (data.transactionType === "thue_hd" && !data.invoiceDate) {
      setError("invoiceDate", { message: "Thuế hoá đơn bắt buộc có ngày hoá đơn" });
      return;
    }
    const payload: TransactionInput = {
      ...data,
      partyId: supplierId,
      invoiceNo: data.invoiceNo?.trim() || null,
      invoiceDate: data.invoiceDate || null,
      content: buildContent(data.transactionType as PaymentType, data.date, data.invoiceNo, data.invoiceDate),
    };
    setSaving(true);
    try {
      // Action trả { ok, … }: lỗi khoá kỳ / mốc chuyển đổi hiện trên toast cả ở bản production.
      const save = (overrideLocked: boolean): Promise<ActionResult> =>
        editingId != null
          ? patchMaterialTransactionAction(
              editingId,
              {
                date: payload.date,
                transactionType: payload.transactionType,
                entityId: payload.entityId,
                projectId: payload.projectId,
                amountTt: payload.amountTt,
                amountHd: payload.amountHd,
                invoiceNo: payload.invoiceNo,
                invoiceDate: payload.invoiceDate,
                content: payload.content,
              },
              { overrideLocked },
            )
          : createMaterialTransactionAction(payload, { overrideLocked });
      let result = await save(false);
      // Ngày thuộc kỳ đã ký / giai đoạn chuyển đổi: admin xác nhận thì ghi lại với cờ bỏ qua khoá.
      if (canOverrideLocked && isLockedRefusal(result) && !result.ok) {
        const verb = editingId != null ? "sửa" : "ghi";
        if (!window.confirm(`${result.message}\n\nBạn là admin: vẫn ${verb} dòng này? ${LOCK_CONFIRM_TAIL}`)) {
          toast.info(`Đã huỷ ${verb} trong kỳ khoá.`);
          return;
        }
        result = await save(true);
      }
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(editingId != null ? "Đã cập nhật" : "Đã ghi sổ");
      resetForm();
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  async function handleDelete(r: PaymentTxRow) {
    // Dòng trong kỳ khoá (chỉ admin thấy nút Xóa): hỏi một lần rồi xoá với cờ bỏ qua khoá.
    const question = r.locked
      ? `Dòng này thuộc ${r.lockReason === "cutover" ? "giai đoạn đã chuyển đổi từ Excel" : "kỳ NCC đã ký"}.\n\n` +
        `Bạn là admin: vẫn xóa khỏi sổ cái? ${LOCK_CONFIRM_TAIL}`
      : "Xóa giao dịch này khỏi sổ cái?";
    if (!confirm(question)) return;
    try {
      const result = await softDeleteMaterialTransactionAction(r.id, { overrideLocked: r.locked && canOverrideLocked });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Đã xóa");
      if (editingId === r.id) resetForm();
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const showForm = canCreate || (canEdit && editingId != null);
  const isTax = type === "thue_hd";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Thanh toán và thuế hoá đơn</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ghi chuyển khoản và thuế hoá đơn của NCC vào sổ cái công nợ vật tư. Thuế hoá đơn làm tăng nợ; kỳ đã ký
            {canOverrideLocked ? " chỉ admin ghi/sửa được (có hỏi xác nhận)." : " không ghi/sửa được."}
          </p>
        </div>
        <div className="rounded-md border px-4 py-2 text-right">
          <div className="text-xs text-muted-foreground">Nợ hiện tại</div>
          <div className="text-lg font-semibold tabular-nums">{formatNumber(currentDebt)} đ</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit(onValid)} className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <Label>Loại</Label>
              <select className={SELECT_CLASS} {...register("transactionType")}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Ngày ghi sổ</Label>
              <DateInput value={date ?? ""} onChange={(v) => setValue("date", v, { shouldValidate: true })} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div>
              <Label>Chủ thể</Label>
              <select className={SELECT_CLASS} {...register("entityId", { valueAsNumber: true })}>
                <option value={0}>-- Chọn --</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {errors.entityId && <p className="text-xs text-destructive">{errors.entityId.message}</p>}
            </div>
            <div>
              <Label>Công trình</Label>
              <select
                className={SELECT_CLASS}
                {...register("projectId", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
              </select>
              {errors.projectId && <p className="text-xs text-destructive">{errors.projectId.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <Label>Số tiền TT</Label>
              <Input type="number" min={0} step="any" {...register("amountTt")} />
              {errors.amountTt && <p className="text-xs text-destructive">{errors.amountTt.message}</p>}
            </div>
            <div>
              <Label>Số tiền HĐ</Label>
              <Input type="number" min={0} step="any" {...register("amountHd")} />
              {errors.amountHd && <p className="text-xs text-destructive">{errors.amountHd.message}</p>}
            </div>
            <div>
              <Label>Số HĐ{isTax ? " (bắt buộc)" : ""}</Label>
              <Input type="text" {...register("invoiceNo")} />
              {errors.invoiceNo && <p className="text-xs text-destructive">{errors.invoiceNo.message}</p>}
            </div>
            <div>
              <Label>Ngày HĐ{isTax ? " (bắt buộc)" : ""}</Label>
              <DateInput
                value={watchedInvoiceDate ?? ""}
                onChange={(v) => setValue("invoiceDate", v, { shouldValidate: true })}
              />
              {errors.invoiceDate && <p className="text-xs text-destructive">{errors.invoiceDate.message}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                Nội dung: {buildContent(type, date, watchedInvoiceNo, watchedInvoiceDate)}
              </p>
              {cutoverDate && (
                <p className={date && date <= cutoverDate ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {canOverrideLocked
                    ? `Ngày ghi sổ tới hết ${isoToDmy(cutoverDate)} thuộc giai đoạn đã chuyển đổi từ Excel — chỉ admin ghi/sửa được, sẽ hỏi xác nhận.`
                    : `Ngày ghi sổ phải sau ${isoToDmy(cutoverDate)} — giai đoạn tới mốc đã chuyển đổi từ Excel, không ghi/sửa được.`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {editingId != null && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  <X className="size-4" aria-hidden="true" />
                  Hủy
                </Button>
              )}
              <Button type="submit" disabled={saving}>
                {editingId != null ? <Save className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                {saving ? "Đang lưu…" : editingId != null ? "Lưu" : "Ghi sổ"}
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <SortableTableHead column="date" label="Ngày" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="type" label="Loại" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="entity" label="Chủ thể" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="project" label="Công trình" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="tt" label="TT" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="hd" label="HĐ" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="invoiceNo" label="Số HĐ" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="invoiceDate" label="Ngày HĐ" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="content" label="Nội dung" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="source" label="Nguồn" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="locked" label="Khoá" sort={sort} onToggle={toggleSort} className="font-medium" />
              <th className="px-3 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có giao dịch thanh toán hoặc thuế hoá đơn nào của NCC này.
              </td></tr>
            )}
            {sortedRows.map((r) => {
              // Dòng nhập tay; dòng trong kỳ khoá chỉ admin sửa/xoá được (có hỏi xác nhận).
              const manual = !r.fromRound && (!r.locked || canOverrideLocked);
              return (
                <tr key={r.id} className={editingId === r.id ? "border-t bg-muted/40" : "border-t"}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{TRANSACTION_TYPE_LABELS[r.transactionType]}</td>
                  <td className="px-3 py-2">{entityMap.get(r.entityId) ?? `#${r.entityId}`}</td>
                  <td className="px-3 py-2">{r.projectId ? projectMap.get(r.projectId) ?? `#${r.projectId}` : ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatNumber(r.totalTt)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatNumber(r.totalHd)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.invoiceNo ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.invoiceDate ? formatDate(r.invoiceDate) : ""}</td>
                  <td className="px-3 py-2 max-w-64 truncate">{r.content ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.fromRound ? "Đợt thanh toán" : "Nhập tay"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.lockReason === "cutover" ? "Đã chuyển đổi" : r.locked ? "Kỳ đã ký" : ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit && manual && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>Sửa</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>Xóa</Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
