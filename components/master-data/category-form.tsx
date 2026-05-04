"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { categorySchema } from "@/lib/master-data/schemas";

// Use the input type (before defaults are applied) for form values
type CategoryFormValues = z.input<typeof categorySchema>;
type CategoryOutput = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  defaultValues?: Partial<CategoryFormValues>;
  onSubmit: (data: CategoryOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function CategoryForm({ defaultValues, onSubmit, isSubmitting }: CategoryFormProps) {
  const form = useForm<CategoryFormValues, unknown, CategoryOutput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: "",
      name: "",
      sortOrder: 0,
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mã hạng mục</FormLabel>
                <FormControl>
                  <Input placeholder="VD: 1.ChuanBi" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sortOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Thứ tự</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên hạng mục</FormLabel>
              <FormControl>
                <Input placeholder="Nhập tên hạng mục" {...field} />
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
