"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deliverySchema, type DeliveryInput } from "@/lib/vat-tu-ncc/schemas";
import { resolveQuote, type QuoteLike } from "@/lib/vat-tu-ncc/quote-resolver";
import { formatDate, formatNumber } from "@/lib/utils/format";
import {
  QuickCreateOption,
  useLocalQuickCreate,
  useOptionsWithCreated,
  useQuickCreatePick,
} from "@/components/master-data/quick-create/quick-create-provider";
import type { QuickCreatedRecord } from "@/lib/master-data/quick-create-types";

type ItemOption = { id: number; code: string; name: string; unit: string };
type ProjectOption = { id: number; code: string; name: string };

const toItemOption = (r: QuickCreatedRecord): ItemOption => ({ id: r.id, code: r.code ?? "", name: r.name, unit: r.unit ?? "" });
const toProjectOption = (r: QuickCreatedRecord): ProjectOption => ({ id: r.id, code: r.code ?? "", name: r.name });

/** Mức báo giá đã tải sẵn của NCC (đơn giá dạng số, ngày hiệu lực dạng Date). */
type QuoteOption = QuoteLike;

interface Props {
  supplierId: number;
  /** create: tự điền đơn giá theo báo giá; edit: chỉ gợi ý, không ghi đè giá đang có. */
  mode: "create" | "edit";
  quotes: QuoteOption[];
  items: ItemOption[];
  projects: ProjectOption[];
  defaultValues?: Partial<DeliveryInput>;
  /** Trang đang xem một cặp NCC × công trình: công trình cố định, không đổi được trong form. */
  lockedProjectId?: number;
  onSubmit: (d: DeliveryInput) => Promise<void>;
}

export function DeliveryForm({ supplierId, mode, quotes, items: baseItems, projects: baseProjects, defaultValues, lockedProjectId, onSubmit }: Props) {
  const items = useOptionsWithCreated("item", baseItems, toItemOption);
  const projects = useOptionsWithCreated("project", baseProjects, toProjectOption);
  // Form nằm trong hộp thoại Thêm/Sửa phiếu → hộp thoại "Tạo mới" phải là hộp thoại con của nó.
  const localQuickCreate = useLocalQuickCreate();
  const pickQuickCreate = useQuickCreatePick(localQuickCreate.request);
  const form = useForm<DeliveryInput>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      supplierId,
      date: new Date().toISOString().split("T")[0],
      itemId: items[0]?.id ?? 0,
      qty: 1,
      unit: items[0]?.unit ?? "",
      ...defaultValues,
      ...(lockedProjectId != null ? { projectId: lockedProjectId } : {}),
    },
  });

  const watchItemId = useWatch({ control: form.control, name: "itemId" });
  useEffect(() => {
    const item = items.find((i) => i.id === Number(watchItemId));
    if (item) form.setValue("unit", item.unit);
  }, [watchItemId, items, form]);

  const watchDate = useWatch({ control: form.control, name: "date" });
  const watchUnitPrice = useWatch({ control: form.control, name: "unitPrice" });
  const unitPriceDirty = !!form.formState.dirtyFields.unitPrice;

  const suggestedQuote = useMemo(() => {
    const day = new Date(watchDate);
    if (Number.isNaN(day.getTime())) return null;
    return resolveQuote(quotes, Number(watchItemId), day);
  }, [quotes, watchItemId, watchDate]);

  // Chỉ ở form tạo: khi vật tư/ngày đổi và người dùng chưa tự gõ đơn giá thì điền theo báo giá hiệu lực.
  // Không có báo giá hiệu lực → để trống (không lấy giá phiếu cũ).
  useEffect(() => {
    if (mode !== "create" || unitPriceDirty) return;
    form.setValue("unitPrice", suggestedQuote?.unitPrice, { shouldDirty: false });
  }, [mode, unitPriceDirty, suggestedQuote, form]);

  const showHint =
    suggestedQuote != null && (mode === "edit" || unitPriceDirty) && watchUnitPrice !== suggestedQuote.unitPrice;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem><FormLabel>Ngày</FormLabel><FormControl>
              <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="projectId" render={({ field }) => (
            <FormItem><FormLabel>Công trình</FormLabel><FormControl>
              <select
                value={field.value ?? ""}
                onChange={(e) => {
                  if (pickQuickCreate(e.target.value, "project", (r) => field.onChange(r.id))) return;
                  field.onChange(e.target.value ? Number(e.target.value) : undefined);
                }}
                disabled={lockedProjectId != null}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm disabled:opacity-70"
              >
                <option value="">-- Chọn công trình --</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                <QuickCreateOption />
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <FormField control={form.control} name="itemId" render={({ field }) => (
          <FormItem><FormLabel>Vật tư</FormLabel><FormControl>
            <select
              value={field.value}
              onChange={(e) => {
                if (pickQuickCreate(e.target.value, "item", (r) => field.onChange(r.id), { itemType: "material" })) return;
                field.onChange(Number(e.target.value));
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {items.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
              <QuickCreateOption />
            </select>
          </FormControl><FormMessage /></FormItem>
        )} />

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="qty" render={({ field }) => (
            <FormItem><FormLabel>Số lượng</FormLabel><FormControl>
              <Input type="number" step="0.0001" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unit" render={({ field }) => (
            <FormItem><FormLabel>Đơn vị</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <FormField control={form.control} name="unitPrice" render={({ field }) => (
          <FormItem><FormLabel>Đơn giá (tùy chọn)</FormLabel><FormControl>
            <Input
              type="number" min={0} step="any"
              name={field.name} ref={field.ref} onBlur={field.onBlur}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </FormControl>
            {showHint && suggestedQuote && (
              <p className="text-xs text-muted-foreground">
                Gợi ý: {formatNumber(suggestedQuote.unitPrice)} (báo giá từ {formatDate(suggestedQuote.effectiveFrom)}){" "}
                <button
                  type="button"
                  className="font-medium text-primary underline"
                  onClick={() => form.setValue("unitPrice", suggestedQuote.unitPrice, { shouldDirty: true })}
                >
                  Dùng
                </button>
              </p>
            )}
            <FormMessage /></FormItem>
        )} />

        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="cbVatTu" render={({ field }) => (
            <FormItem><FormLabel>Cán bộ VT</FormLabel><FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="chiHuyCt" render={({ field }) => (
            <FormItem><FormLabel>Chỉ huy CT</FormLabel><FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="keToan" render={({ field }) => (
            <FormItem><FormLabel>Kế toán</FormLabel><FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem><FormLabel>Ghi chú</FormLabel><FormControl>
            <Input {...field} value={field.value ?? ""} />
          </FormControl><FormMessage /></FormItem>
        )} />

        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
      {/* Ngoài <form>: submit của form tạo danh mục không được lan lên form phiếu. */}
      {localQuickCreate.element}
    </Form>
  );
}
