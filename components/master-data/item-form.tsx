"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { itemSchema } from "@/lib/master-data/schemas";

type ItemFormValues = z.input<typeof itemSchema>;
type ItemOutput = z.infer<typeof itemSchema>;

interface ItemFormProps {
  defaultValues?: Partial<ItemFormValues>;
  onSubmit: (data: ItemOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function ItemForm({ defaultValues, onSubmit, isSubmitting }: ItemFormProps) {
  const form = useForm<ItemFormValues, unknown, ItemOutput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      code: "",
      name: "",
      unit: "",
      type: "material",
      note: "",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mã vật tư</FormLabel>
              <FormControl>
                <Input placeholder="VD: MAT-001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên vật tư / hạng mục</FormLabel>
              <FormControl>
                <Input placeholder="Nhập tên vật tư" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Đơn vị tính</FormLabel>
              <FormControl>
                <Input placeholder="VD: m3, tấn, cái, công" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loại</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="material">Vật liệu</option>
                  <option value="labor">Nhân công</option>
                  <option value="machine">Máy móc</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ghi chú</FormLabel>
              <FormControl>
                <Input placeholder="Ghi chú (tùy chọn)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
