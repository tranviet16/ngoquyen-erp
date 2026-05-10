"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reconciliationSchema, type ReconciliationInput } from "@/lib/vat-tu-ncc/schemas";

interface Props {
  supplierId: number;
  defaultValues?: Partial<ReconciliationInput>;
  onSubmit: (d: ReconciliationInput) => Promise<void>;
}

export function ReconciliationForm({ supplierId, defaultValues, onSubmit }: Props) {
  const form = useForm<ReconciliationInput>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      supplierId,
      openingBalance: 0,
      totalIn: 0,
      totalPaid: 0,
      signedBySupplier: false,
      ...defaultValues,
    },
  });

  const openingBalance = form.watch("openingBalance") ?? 0;
  const totalIn = form.watch("totalIn") ?? 0;
  const totalPaid = form.watch("totalPaid") ?? 0;
  const closingBalance = Number(openingBalance) + Number(totalIn) - Number(totalPaid);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="periodFrom" render={({ field }) => (
            <FormItem><FormLabel>Từ ngày</FormLabel><FormControl>
              <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="periodTo" render={({ field }) => (
            <FormItem><FormLabel>Đến ngày</FormLabel><FormControl>
              <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="openingBalance" render={({ field }) => (
            <FormItem><FormLabel>Số dư đầu kỳ</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="totalIn" render={({ field }) => (
            <FormItem><FormLabel>Tổng phát sinh</FormLabel><FormControl>
              <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="totalPaid" render={({ field }) => (
            <FormItem><FormLabel>Tổng thanh toán</FormLabel><FormControl>
              <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="rounded-md bg-muted px-4 py-2 text-sm">
          Số dư cuối kỳ (tính): <strong>{closingBalance.toLocaleString("vi-VN")} ₫</strong>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="signedBySupplier" render={({ field }) => (
            <FormItem className="flex items-center gap-2 pt-5">
              <FormControl>
                <input type="checkbox" checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
              </FormControl>
              <FormLabel className="!mt-0">NCC đã ký</FormLabel>
            </FormItem>
          )} />
          <FormField control={form.control} name="signedDate" render={({ field }) => (
            <FormItem><FormLabel>Ngày ký</FormLabel><FormControl>
              <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
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
