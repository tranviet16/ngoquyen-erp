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
};

interface Props {
  projectId: number;
  initialSettings: SettingsRow | null;
}

export function CaiDatClient({ projectId, initialSettings }: Props) {
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
    },
  });

  async function onSubmit(data: SettingsInput) {
    await upsertSettings(data);
    startTransition(() => router.refresh());
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Cài Đặt Dự Án</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
