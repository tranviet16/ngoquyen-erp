"use client";

/**
 * Form tạo / sửa hợp đồng dự án (trong hộp thoại). Dùng chung cho danh mục và màn chi tiết.
 * Hộp thoại luôn gửi đủ form; service tự suy khóa đối tác từ loại đối tác. Ô để trống gửi `null`.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import {
  QuickCreateOption,
  toNamedOption,
  useLocalQuickCreate,
  useOptionsWithCreated,
  useQuickCreatePick,
} from "@/components/master-data/quick-create/quick-create-provider";
import { createContract, updateContract } from "@/lib/du-an/contract-service";
import {
  CONTRACT_DOC_TYPES,
  CONTRACT_DOC_TYPE_LABELS,
  CONTRACT_PARTY_KINDS,
  CONTRACT_PARTY_KIND_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  type ContractDocType,
  type ContractPartyKind,
  type ContractStatus,
} from "@/lib/du-an/contract-labels";
import type { ContractFormValues, Option } from "@/lib/du-an/contract-form-values";

export interface ContractFormProps {
  mode: "create" | "edit";
  projectId: number;
  /** Bắt buộc khi `mode = "edit"`. */
  contractId?: number;
  initialValues: ContractFormValues;
  supplierOptions: Option[];
  contractorOptions: Option[];
  /** Tên CĐT ghi ở thông tin dự án (null: dự án chưa ghi). */
  ownerInvestor: string | null;
  onSaved: (id: number) => void;
}

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function parseMoney(text: string): number | null {
  const t = text.trim();
  return t === "" ? null : Number(t);
}

export function ContractForm({ mode, projectId, contractId, initialValues, supplierOptions, contractorOptions, ownerInvestor, onSaved }: ContractFormProps) {
  const [v, setV] = useState<ContractFormValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const suppliers = useOptionsWithCreated("supplier", supplierOptions, toNamedOption);
  const contractors = useOptionsWithCreated("contractor", contractorOptions, toNamedOption);
  // Form nằm trong hộp thoại → hộp thoại "Tạo mới" là hộp thoại con, render ngoài <form>.
  const localQuickCreate = useLocalQuickCreate();
  const pickQuickCreate = useQuickCreatePick(localQuickCreate.request);

  const set = <K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) => setV((s) => ({ ...s, [key]: value }));
  const isContract = v.docType === "contract";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const partyKind = isContract && v.partyKind !== "" ? v.partyKind : null;
    const input = {
      projectId,
      docName: v.docName,
      docType: v.docType,
      status: v.status,
      partyKind,
      supplierId: partyKind === "ncc" ? v.supplierId : null,
      contractorId: partyKind === "doi_thi_cong" ? v.contractorId : null,
      // Đối tác có mã: để service tự điền tên đối tác.
      partyName: partyKind === null ? v.partyName || null : null,
      valueVnd: parseMoney(v.valueVnd),
      valueTtVnd: isContract ? parseMoney(v.valueTtVnd) : null,
      signedDate: v.signedDate || null,
      expiryDate: v.expiryDate || null,
      storage: v.storage || null,
      note: v.note || null,
    };
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await createContract(input);
        if (!res.ok) return void toast.error(res.message);
        toast.success("Đã thêm hợp đồng");
        onSaved(res.id);
      } else {
        const res = await updateContract(contractId!, input);
        if (!res.ok) return void toast.error(res.message);
        toast.success("Đã lưu hợp đồng");
        onSaved(contractId!);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="docName">Tên tài liệu *</Label>
          <Input id="docName" required value={v.docName} onChange={(e) => set("docName", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="docType">Loại *</Label>
            <select id="docType" className={SELECT_CLASS} value={v.docType} onChange={(e) => set("docType", e.target.value as ContractDocType)}>
              {CONTRACT_DOC_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_DOC_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status">Trạng thái</Label>
            <select id="status" className={SELECT_CLASS} value={v.status} onChange={(e) => set("status", e.target.value as ContractStatus)}>
              {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        {isContract ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="partyKind">Đối tác của hợp đồng</Label>
              <select
                id="partyKind"
                className={SELECT_CLASS}
                value={v.partyKind}
                // Đổi loại đối tác: xóa khóa cũ trên form.
                onChange={(e) => setV((s) => ({ ...s, partyKind: e.target.value as ContractPartyKind | "", supplierId: null, contractorId: null }))}
              >
                {CONTRACT_PARTY_KINDS.map((k) => <option key={k} value={k}>{CONTRACT_PARTY_KIND_LABELS[k]}</option>)}
                <option value="">Khác (chưa gắn danh mục)</option>
              </select>
            </div>
            <div className="space-y-1">
              {v.partyKind === "ncc" && (
                <>
                  <Label htmlFor="supplierId">NCC *</Label>
                  <select
                    id="supplierId"
                    required
                    className={SELECT_CLASS}
                    value={v.supplierId ?? ""}
                    onChange={(e) => {
                      if (pickQuickCreate(e.target.value, "supplier", (r) => set("supplierId", r.id))) return;
                      set("supplierId", e.target.value ? Number(e.target.value) : null);
                    }}
                  >
                    <option value="">-- Chọn NCC --</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <QuickCreateOption />
                  </select>
                </>
              )}
              {v.partyKind === "doi_thi_cong" && (
                <>
                  <Label htmlFor="contractorId">Đội thi công *</Label>
                  <select
                    id="contractorId"
                    required
                    className={SELECT_CLASS}
                    value={v.contractorId ?? ""}
                    onChange={(e) => {
                      if (pickQuickCreate(e.target.value, "contractor", (r) => set("contractorId", r.id))) return;
                      set("contractorId", e.target.value ? Number(e.target.value) : null);
                    }}
                  >
                    <option value="">-- Chọn đội --</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <QuickCreateOption />
                  </select>
                </>
              )}
              {v.partyKind === "cdt" && (
                <>
                  <Label>Chủ đầu tư</Label>
                  <p className="pt-2 text-sm">
                    {ownerInvestor ? `CĐT: ${ownerInvestor}` : (
                      <span className="text-amber-700 dark:text-amber-300">Dự án chưa ghi tên CĐT — sửa ở thông tin dự án.</span>
                    )}
                  </p>
                </>
              )}
              {v.partyKind === "" && (
                <>
                  <Label htmlFor="partyName">Tên đối tác</Label>
                  <Input id="partyName" value={v.partyName} onChange={(e) => set("partyName", e.target.value)} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="partyName">Đối tác / cơ quan</Label>
            <Input id="partyName" value={v.partyName} onChange={(e) => set("partyName", e.target.value)} />
          </div>
        )}

        {isContract ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="valueVnd">Giá trị theo DT (VND)</Label>
              <Input id="valueVnd" type="number" step="any" value={v.valueVnd} onChange={(e) => set("valueVnd", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="valueTtVnd">Giá trị theo TT (VND)</Label>
              <Input id="valueTtVnd" type="number" step="any" min={0} value={v.valueTtVnd} onChange={(e) => set("valueTtVnd", e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="valueVnd">Giá trị (VND)</Label>
            <Input id="valueVnd" type="number" step="any" value={v.valueVnd} onChange={(e) => set("valueVnd", e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="signedDate">Ngày ký</Label>
            <DateInput id="signedDate" value={v.signedDate} onChange={(iso) => set("signedDate", iso)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expiryDate">Ngày hết hạn</Label>
            <DateInput id="expiryDate" value={v.expiryDate} onChange={(iso) => set("expiryDate", iso)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="storage">Nơi lưu bản giấy</Label>
          <Input id="storage" value={v.storage} onChange={(e) => set("storage", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">Ghi chú</Label>
          <Input id="note" value={v.note} onChange={(e) => set("note", e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</Button>
        </div>
      </form>
      {/* Ngoài <form>: submit của form tạo danh mục không được lan lên form hợp đồng. */}
      {localQuickCreate.element}
    </>
  );
}
