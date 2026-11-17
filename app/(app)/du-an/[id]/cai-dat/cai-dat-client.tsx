"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { settingsSchema, type SettingsInput } from "@/lib/du-an/schemas";
import { upsertSettings } from "@/lib/du-an/settings-service";

type SettingsRow = {
  projectId: number;
  vatPct: unknown;
  normYellowThreshold: unknown;
  normRedThreshold: unknown;
  contractWarningDays: number;
  managementFeePct: unknown;
  teamSharePct: unknown;
  generalCostPct?: unknown;
  tempHousingPct?: unknown;
  unmeasuredPct?: unknown;
  presumptiveIncomePct?: unknown;
};

/** Tỷ lệ Phần III báo cáo DT-TT — nhập dạng 0–1 như các tỷ lệ khác. */
const PHAN_III_RATES = [
  { name: "generalCostPct", label: "Chi phí chung (× chi phí trực tiếp T)", fallback: 0.07 },
  { name: "tempHousingPct", label: "Nhà tạm để ở và điều hành (× T)", fallback: 0.01 },
  { name: "unmeasuredPct", label: "Việc không xác định được khối lượng (× T)", fallback: 0.03 },
  { name: "presumptiveIncomePct", label: "Thu nhập chịu thuế tính trước (× (T + gián tiếp))", fallback: 0.06 },
] as const;

interface Props {
  projectId: number;
  initialSettings: SettingsRow | null;
  canEdit: boolean;
}

export function CaiDatClient({ projectId, initialSettings, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      projectId,
      vatPct: Number(initialSettings?.vatPct ?? 0.1),
      normYellowThreshold: Number(initialSettings?.normYellowThreshold ?? 0.8),
      normRedThreshold: Number(initialSettings?.normRedThreshold ?? 0.95),
      contractWarningDays: Number(initialSettings?.contractWarningDays ?? 90),
      managementFeePct: Number(initialSettings?.managementFeePct ?? 0.05),
      teamSharePct: Number(initialSettings?.teamSharePct ?? 0.85),
      ...Object.fromEntries(
        PHAN_III_RATES.map((r) => [r.name, Number(initialSettings?.[r.name] ?? r.fallback)]),
      ) as Pick<SettingsInput, (typeof PHAN_III_RATES)[number]["name"]>,
    },
  });

  async function onSubmit(data: SettingsInput) {
    if (!canEdit) return;
    await upsertSettings(data);
    startTransition(() => router.refresh());
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Cài Đặt Dự Án</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <fieldset disabled={!canEdit || isPending} className="space-y-4">
          <FormField control={form.control} name="vatPct" render={({ field }) => (
            <FormItem>
              <FormLabel>Thuế VAT (%)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" max="1" {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Giá trị 0–1, ví dụ: 0.1 = 10%</p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="normYellowThreshold" render={({ field }) => (
            <FormItem>
              <FormLabel>Ngưỡng cảnh báo vàng định mức</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" max="1" {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Ví dụ: 0.8 = cảnh báo khi dùng &gt;80%</p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="normRedThreshold" render={({ field }) => (
            <FormItem>
              <FormLabel>Ngưỡng cảnh báo đỏ định mức</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" max="1" {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Ví dụ: 0.95 = cảnh báo đỏ khi dùng &gt;95%</p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="contractWarningDays" render={({ field }) => (
            <FormItem>
              <FormLabel>Cảnh báo hợp đồng sắp hết hạn (ngày)</FormLabel>
              <FormControl>
                <Input type="number" min="0" {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value))} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="managementFeePct" render={({ field }) => (
            <FormItem>
              <FormLabel>Phí quản lý giao khoán (%)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" max="1" {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="teamSharePct" render={({ field }) => (
            <FormItem>
              <FormLabel>Tỷ lệ đội nhận (%)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" max="1" {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <h3 className="pt-2 text-sm font-semibold">Phần III báo cáo DT-TT (tỷ lệ dự toán)</h3>
          {PHAN_III_RATES.map((rate) => (
            <FormField key={rate.name} control={form.control} name={rate.name} render={({ field }) => (
              <FormItem>
                <FormLabel>{rate.label}</FormLabel>
                <FormControl>
                  <Input type="number" step="0.001" min="0" max="1" {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          ))}

          <div className="flex justify-end pt-2">
            {canEdit && <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>}
          </div>
          </fieldset>
        </form>
      </Form>
    </div>
  );
}
