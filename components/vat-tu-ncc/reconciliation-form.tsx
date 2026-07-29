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

/**
 * Kỳ đối chiếu chỉ cần khoảng kỳ + ghi chú — số tiền dẫn xuất từ sổ cái,
 * xem/ký ở trang chi tiết kỳ.
 */
export function ReconciliationForm({ supplierId, defaultValues, onSubmit }: Props) {
  const form = useForm<ReconciliationInput>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      supplierId,
      ...defaultValues,
    },
  });

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

        <p className="text-xs text-muted-foreground">
          Kỳ chuẩn: 27 tháng trước → 26 tháng này. Số dư/phát sinh/thanh toán được tính tự động
          từ sổ công nợ vật tư — xem và ký tại trang chi tiết kỳ.
        </p>

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
