"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deliverySchema, type DeliveryInput } from "@/lib/vat-tu-ncc/schemas";

type ItemOption = { id: number; code: string; name: string; unit: string };
type ProjectOption = { id: number; code: string; name: string };

interface Props {
  supplierId: number;
  items: ItemOption[];
  projects: ProjectOption[];
  defaultValues?: Partial<DeliveryInput>;
  onSubmit: (d: DeliveryInput) => Promise<void>;
}

export function DeliveryForm({ supplierId, items, projects, defaultValues, onSubmit }: Props) {
  const form = useForm<DeliveryInput>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      supplierId,
      date: new Date().toISOString().split("T")[0],
      itemId: items[0]?.id ?? 0,
      qty: 1,
      unit: items[0]?.unit ?? "",
      ...defaultValues,
    },
  });

  const watchItemId = form.watch("itemId");
  useEffect(() => {
    const item = items.find((i) => i.id === Number(watchItemId));
    if (item) form.setValue("unit", item.unit);
  }, [watchItemId, items, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem><FormLabel>Ngày</FormLabel><FormControl>
              <Input type="date" {...field} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="projectId" render={({ field }) => (
            <FormItem><FormLabel>Dự án (tùy chọn)</FormLabel><FormControl>
              <select
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">-- Không chọn --</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <FormField control={form.control} name="itemId" render={({ field }) => (
          <FormItem><FormLabel>Vật tư</FormLabel><FormControl>
            <select
              value={field.value}
              onChange={(e) => field.onChange(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {items.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
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
    </Form>
  );
}
