"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reconciliationSchema, type ReconciliationInput } from "@/lib/vat-tu-ncc/schemas";
import { checkReconciliationRange } from "@/lib/vat-tu-ncc/reconciliation-service";

interface Props {
  supplierId: number;
  defaultValues?: Partial<ReconciliationInput>;
  onSubmit: (d: ReconciliationInput) => Promise<void>;
}

/**
 * Kỳ đối chiếu chỉ cần khoảng kỳ + ghi chú — số tiền dẫn xuất từ sổ cái,
 * xem/ký ở trang chi tiết kỳ. Biên kỳ được điền sẵn theo kỳ gợi ý và kiểm tra
 * sớm với server (liền kề kỳ gần nhất, không chồng kỳ đã ký, sau mốc số dư ban đầu);
 * server vẫn kiểm lại khi lưu.
 */
export function ReconciliationForm({ supplierId, defaultValues, onSubmit }: Props) {
  const form = useForm<ReconciliationInput>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      supplierId,
      ...defaultValues,
    },
  });
  const [periodFrom, periodTo] = useWatch({ control: form.control, name: ["periodFrom", "periodTo"] });
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const hasDefaultRange = !!(defaultValues?.periodFrom || defaultValues?.periodTo);

  // Tạo mới: điền sẵn kỳ gợi ý tiếp theo.
  useEffect(() => {
    if (hasDefaultRange) return;
    let cancelled = false;
    checkReconciliationRange(supplierId)
      .then(({ suggestedRange }) => {
        if (cancelled || form.getValues("periodFrom") || form.getValues("periodTo")) return;
        form.setValue("periodFrom", suggestedRange.from);
        form.setValue("periodTo", suggestedRange.to);
      })
      .catch(() => {
        // Không gợi ý được thì để người dùng tự nhập; lỗi thật sẽ hiện khi kiểm biên/lưu.
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, hasDefaultRange, form]);

  // Kiểm biên kỳ mỗi khi đủ hai ngày.
  useEffect(() => {
    if (!periodFrom || !periodTo) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setChecking(true);
      checkReconciliationRange(supplierId, { from: periodFrom, to: periodTo })
        .then(({ error }) => {
          if (!cancelled) setBoundsError(error);
        })
        .catch((err: unknown) => {
          if (!cancelled) setBoundsError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supplierId, periodFrom, periodTo]);

  async function handleSubmit(data: ReconciliationInput) {
    try {
      await onSubmit(data);
    } catch (err) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    }
  }

  const rangeIncomplete = !periodFrom || !periodTo;
  const shownBoundsError = rangeIncomplete ? null : boundsError;
  const rootError = form.formState.errors.root?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
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

        {shownBoundsError && (
          <p className="text-sm text-destructive" role="alert">{shownBoundsError}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Kỳ chuẩn: 27 tháng trước → 26 tháng này; kỳ mới bắt đầu ngay sau kỳ gần nhất. Số dư/phát
          sinh/thanh toán được tính tự động từ sổ công nợ vật tư — xem và ký tại trang chi tiết kỳ.
        </p>

        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem><FormLabel>Ghi chú</FormLabel><FormControl>
            <Input {...field} value={field.value ?? ""} />
          </FormControl><FormMessage /></FormItem>
        )} />

        {rootError && <p className="text-sm text-destructive" role="alert">{rootError}</p>}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={checking || !!shownBoundsError || form.formState.isSubmitting}>
            Lưu
          </Button>
        </div>
      </form>
    </Form>
  );
}
