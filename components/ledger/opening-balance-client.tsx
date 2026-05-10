"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import type { OpeningBalanceInput } from "@/lib/cong-no-vt/schemas";

export interface BalanceRow {
  id: number;
  entityId: number;
  entityName: string;
  partyId: number;
  partyName: string;
  projectId: number | null;
  balanceTt: string;
  balanceHd: string;
  asOfDate: string;
  note: string | null;
}

export interface LookupOption { id: number; name: string; }

interface Props {
  initialData: BalanceRow[];
  entities: LookupOption[];
  partyOptions: LookupOption[];
  partyLabel: string;
  onSet: (data: OpeningBalanceInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<void>;
}

function fmt(s: string): string {
  const n = Number(s);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

export function OpeningBalanceClient({ initialData, entities, partyOptions, partyLabel, onSet, onDelete }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BalanceRow | null>(null);
  const [, startTransition] = useTransition();

  function refresh() { startTransition(() => router.refresh()); }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>Thêm số dư ban đầu</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 text-left">Chủ thể</th>
              <th className="p-2 text-left">{partyLabel}</th>
              <th className="p-2 text-left">Ngày</th>
              <th className="p-2 text-right">Số dư TT</th>
              <th className="p-2 text-right">Số dư HĐ</th>
              <th className="p-2 text-left">Ghi chú</th>
              <th className="p-2 w-[120px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Không có dữ liệu</td></tr>
            ) : (
              initialData.map((row) => (
                <tr key={row.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">{row.entityName}</td>
                  <td className="p-2">{row.partyName}</td>
                  <td className="p-2">{row.asOfDate}</td>
                  <td className="p-2 text-right">{fmt(row.balanceTt)}</td>
                  <td className="p-2 text-right">{fmt(row.balanceHd)}</td>
                  <td className="p-2 text-muted-foreground">{row.note ?? ""}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditTarget(row)}>Sửa</Button>
                      <DeleteConfirmDialog
                        itemName={`${row.entityName} / ${row.partyName}`}
                        onConfirm={async () => { await onDelete(row.id); refresh(); }}
                        trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ObForm open={createOpen} onOpenChange={setCreateOpen} entities={entities} partyOptions={partyOptions} partyLabel={partyLabel}
        onSubmit={async (d) => { await onSet(d); setCreateOpen(false); refresh(); }} />

      {editTarget && (
        <ObForm open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} entities={entities} partyOptions={partyOptions} partyLabel={partyLabel}
          defaultValues={editTarget}
          onSubmit={async (d) => { await onSet(d); setEditTarget(null); refresh(); }} />
      )}
    </div>
  );
}

interface ObFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: LookupOption[];
  partyOptions: LookupOption[];
  partyLabel: string;
  defaultValues?: Partial<BalanceRow>;
  onSubmit: (data: OpeningBalanceInput) => Promise<void>;
}

function ObForm({ open, onOpenChange, entities, partyOptions, partyLabel, defaultValues, onSubmit }: ObFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<OpeningBalanceInput>({
    entityId: defaultValues?.entityId ?? 0,
    partyId: defaultValues?.partyId ?? 0,
    projectId: defaultValues?.projectId ?? null,
    balanceTt: defaultValues?.balanceTt ?? "0",
    balanceHd: defaultValues?.balanceHd ?? "0",
    asOfDate: defaultValues?.asOfDate ?? today,
    note: defaultValues?.note ?? null,
  });

  function set<K extends keyof OpeningBalanceInput>(key: K, value: OpeningBalanceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.entityId || !form.partyId) { toast.error(`Vui lòng chọn Chủ thể và ${partyLabel}`); return; }
    setLoading(true);
    try {
      await onSubmit(form);
      toast.success("Đã lưu");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CrudDialog title={defaultValues?.id ? "Sửa số dư ban đầu" : "Thêm số dư ban đầu"} open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Chủ thể</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={form.entityId} onChange={(e) => set("entityId", Number(e.target.value))}>
              <option value={0}>-- Chọn --</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label>{partyLabel}</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={form.partyId} onChange={(e) => set("partyId", Number(e.target.value))}>
              <option value={0}>-- Chọn --</option>
              {partyOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ngày đầu kỳ</Label>
            <DateInput value={form.asOfDate} onChange={(v) => set("asOfDate", v)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Số dư TT (VND)</Label>
            <Input type="number" min="0" value={form.balanceTt} onChange={(e) => set("balanceTt", e.target.value)} />
          </div>
          <div>
            <Label>Số dư HĐ (VND)</Label>
            <Input type="number" min="0" value={form.balanceHd} onChange={(e) => set("balanceHd", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Ghi chú</Label>
          <Input value={form.note ?? ""} onChange={(e) => set("note", e.target.value || null)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Hủy</Button>
          <Button type="submit" disabled={loading}>{loading ? "Đang lưu..." : "Lưu"}</Button>
        </div>
      </form>
    </CrudDialog>
  );
}
