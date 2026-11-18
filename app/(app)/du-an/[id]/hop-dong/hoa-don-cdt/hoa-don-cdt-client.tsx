"use client";

/**
 * Bảng sổ hóa đơn xuất CĐT: dòng nhập ở đầu bảng, dòng tổng ở cuối (chưa VAT, VAT, tổng). Sửa một dòng
 * ngay trên bảng; xóa có xác nhận. Mọi thao tác ghi xong thì tải lại dữ liệu của trang.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCdtInvoice, softDeleteCdtInvoice, updateCdtInvoice } from "@/lib/du-an/cdt-invoice-service";
import { formatDate, formatNumber } from "@/lib/utils/format";

export interface CdtInvoiceRow {
  id: number;
  /** amountVnd + vatVnd, tính chính xác ở server. */
  total: string;
  invoiceDate: string;
  invoiceSymbol: string | null;
  invoiceNo: string;
  amountVnd: string;
  vatVnd: string;
  acceptanceBatch: string | null;
  note: string | null;
}

interface Draft {
  invoiceDate: string;
  invoiceSymbol: string;
  invoiceNo: string;
  amountVnd: string;
  vatVnd: string;
  acceptanceBatch: string;
  note: string;
}

const EMPTY: Draft = { invoiceDate: "", invoiceSymbol: "", invoiceNo: "", amountVnd: "", vatVnd: "", acceptanceBatch: "", note: "" };

/** Chỉ để xem trước tổng của dòng đang nhập; tổng của sổ tính chính xác ở server. */
const previewTotal = (d: Draft) => (Number(d.amountVnd) || 0) + (Number(d.vatVnd) || 0);

function toDraft(r: CdtInvoiceRow): Draft {
  return {
    invoiceDate: r.invoiceDate,
    invoiceSymbol: r.invoiceSymbol ?? "",
    invoiceNo: r.invoiceNo,
    amountVnd: r.amountVnd,
    vatVnd: r.vatVnd,
    acceptanceBatch: r.acceptanceBatch ?? "",
    note: r.note ?? "",
  };
}

interface Props {
  projectId: number;
  rows: CdtInvoiceRow[];
  batches: string[];
  canCreate: boolean;
  canEdit: boolean;
  totals: { amountVnd: string; vatVnd: string; total: string };
}

function DraftCells({ d, set, batchListId }: { d: Draft; set: (k: keyof Draft, v: string) => void; batchListId: string }) {
  return (
    <>
      <TableCell><DateInput value={d.invoiceDate} onChange={(iso) => set("invoiceDate", iso)} aria-label="Ngày HĐ" /></TableCell>
      <TableCell><Input value={d.invoiceSymbol} onChange={(e) => set("invoiceSymbol", e.target.value)} placeholder="1C26TAA" aria-label="Ký hiệu" /></TableCell>
      <TableCell><Input value={d.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} aria-label="Số HĐ" /></TableCell>
      <TableCell><Input type="number" step="any" value={d.amountVnd} onChange={(e) => set("amountVnd", e.target.value)} aria-label="Giá trị chưa VAT" /></TableCell>
      <TableCell><Input type="number" step="any" value={d.vatVnd} onChange={(e) => set("vatVnd", e.target.value)} aria-label="VAT" /></TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(previewTotal(d))}</TableCell>
      <TableCell><Input list={batchListId} value={d.acceptanceBatch} onChange={(e) => set("acceptanceBatch", e.target.value)} aria-label="Đợt nghiệm thu" /></TableCell>
      <TableCell><Input value={d.note} onChange={(e) => set("note", e.target.value)} aria-label="Ghi chú" /></TableCell>
    </>
  );
}

export function HoaDonCdtClient({ projectId, rows, batches, canCreate, canEdit, totals }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const toInput = (d: Draft) => ({
    projectId,
    invoiceDate: d.invoiceDate,
    invoiceSymbol: d.invoiceSymbol || null,
    invoiceNo: d.invoiceNo,
    amountVnd: Number(d.amountVnd),
    vatVnd: d.vatVnd.trim() === "" ? 0 : Number(d.vatVnd),
    acceptanceBatch: d.acceptanceBatch || null,
    note: d.note || null,
  });

  async function add() {
    if (!draft.invoiceDate || !draft.invoiceNo.trim() || draft.amountVnd.trim() === "") {
      return void toast.error("Nhập Ngày HĐ, Số HĐ và Giá trị chưa VAT");
    }
    const res = await createCdtInvoice(toInput(draft));
    if (!res.ok) return void toast.error(res.message);
    toast.success("Đã thêm hóa đơn");
    setDraft(EMPTY);
    refresh();
  }

  async function save() {
    if (editId === null) return;
    const res = await updateCdtInvoice(editId, toInput(editDraft));
    if (!res.ok) return void toast.error(res.message);
    toast.success("Đã lưu hóa đơn");
    setEditId(null);
    refresh();
  }

  async function remove(id: number) {
    const res = await softDeleteCdtInvoice(id, projectId);
    if (!res.ok) return void toast.error(res.message);
    toast.success("Đã xóa hóa đơn");
    setDeleteId(null);
    refresh();
  }

  const batchListId = "dot-nghiem-thu";

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Sổ hóa đơn xuất CĐT</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sổ dùng chung cho mọi hợp đồng CĐT của công trình. Hóa đơn điều chỉnh giảm ghi số âm.
        </p>
      </div>
      <datalist id={batchListId}>{batches.map((b) => <option key={b} value={b} />)}</datalist>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày HĐ *</TableHead>
            <TableHead>Ký hiệu</TableHead>
            <TableHead>Số HĐ *</TableHead>
            <TableHead className="text-right">Giá trị chưa VAT *</TableHead>
            <TableHead className="text-right">VAT</TableHead>
            <TableHead className="text-right">Tổng</TableHead>
            <TableHead>Đợt nghiệm thu</TableHead>
            <TableHead>Ghi chú</TableHead>
            {(canCreate || canEdit) && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {canCreate && (
            <TableRow>
              <DraftCells d={draft} set={(k, v) => setDraft((s) => ({ ...s, [k]: v }))} batchListId={batchListId} />
              <TableCell><Button size="sm" disabled={busy} onClick={add}>Thêm</Button></TableCell>
            </TableRow>
          )}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Chưa có hóa đơn xuất CĐT nào.</TableCell></TableRow>
          )}
          {rows.map((r) =>
            editId === r.id ? (
              <TableRow key={r.id}>
                <DraftCells d={editDraft} set={(k, v) => setEditDraft((s) => ({ ...s, [k]: v }))} batchListId={batchListId} />
                <TableCell className="whitespace-nowrap">
                  <Button size="sm" disabled={busy} onClick={save}>Lưu</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Hủy</Button>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={r.id}>
                <TableCell>{formatDate(r.invoiceDate)}</TableCell>
                <TableCell>{r.invoiceSymbol ?? ""}</TableCell>
                <TableCell>{r.invoiceNo}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.amountVnd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.vatVnd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.total)}</TableCell>
                <TableCell>{r.acceptanceBatch ?? ""}</TableCell>
                <TableCell>{r.note ?? ""}</TableCell>
                {(canCreate || canEdit) && (
                  <TableCell className="whitespace-nowrap">
                    {canEdit && deleteId !== r.id && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditId(r.id); setEditDraft(toDraft(r)); }}>Sửa</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(r.id)}>Xóa</Button>
                      </>
                    )}
                    {deleteId === r.id && (
                      <>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(r.id)}>Xác nhận xóa</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>Hủy</Button>
                      </>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ),
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell colSpan={3}>Tổng ({rows.length} hóa đơn)</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(totals.amountVnd)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(totals.vatVnd)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(totals.total)}</TableCell>
            <TableCell colSpan={(canCreate || canEdit) ? 3 : 2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
