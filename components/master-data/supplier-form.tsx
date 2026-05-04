"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supplierSchema } from "@/lib/master-data/schemas";

type SupplierFormValues = z.input<typeof supplierSchema>;
type SupplierOutput = z.infer<typeof supplierSchema>;

interface SupplierFormProps {
  defaultValues?: Partial<SupplierFormValues>;
  onSubmit: (data: SupplierOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function SupplierForm({ defaultValues, onSubmit, isSubmitting }: SupplierFormProps) {
  const form = useForm<SupplierFormValues, unknown, SupplierOutput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      taxCode: "",
      phone: "",
      address: "",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên nhà cung cấp</FormLabel>
              <FormControl>
                <Input placeholder="Nhập tên nhà cung cấp" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="taxCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mã số thuế</FormLabel>
              <FormControl>
                <Input placeholder="Mã số thuế (tùy chọn)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Điện thoại</FormLabel>
              <FormControl>
                <Input placeholder="Số điện thoại (tùy chọn)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Địa chỉ</FormLabel>
              <FormControl>
                <Input placeholder="Địa chỉ (tùy chọn)" {...field} />
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
