"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { estimateSchema, type EstimateInput } from "@/lib/du-an/schemas";

type CategoryOption = { id: number; code: string; name: string };

interface Props {
  projectId: number;
  categories: CategoryOption[];
  defaultValues?: Partial<EstimateInput>;
  onSubmit: (d: EstimateInput) => Promise<void>;
}

export function EstimateForm({ projectId, categories, defaultValues, onSubmit }: Props) {
  const form = useForm<EstimateInput>({
    resolver: zodResolver(estimateSchema),
    defaultValues: { projectId, categoryId: categories[0]?.id ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem><FormLabel>Hạng mục</FormLabel><FormControl>
            <select {...field} onChange={(e) => field.onChange(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="itemCode" render={({ field }) => (
            <FormItem><FormLabel>Mã hàng</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unit" render={({ field }) => (
            <FormItem><FormLabel>Đơn vị</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="itemName" render={({ field }) => (
          <FormItem><FormLabel>Tên vật tư/công việc</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="qty" render={({ field }) => (
            <FormItem><FormLabel>Số lượng</FormLabel><FormControl>
              <Input type="number" step="0.0001" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPrice" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá (VND)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}
