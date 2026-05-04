"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { contractorSchema } from "@/lib/master-data/schemas";

type ContractorFormValues = z.input<typeof contractorSchema>;
type ContractorOutput = z.infer<typeof contractorSchema>;

interface ContractorFormProps {
  defaultValues?: Partial<ContractorFormValues>;
  onSubmit: (data: ContractorOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function ContractorForm({ defaultValues, onSubmit, isSubmitting }: ContractorFormProps) {
  const form = useForm<ContractorFormValues, unknown, ContractorOutput>({
    resolver: zodResolver(contractorSchema),
    defaultValues: {
      name: "",
      leader: "",
      contact: "",
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
              <FormLabel>Tên đội thi công</FormLabel>
              <FormControl>
                <Input placeholder="Nhập tên đội thi công" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="leader"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trưởng nhóm</FormLabel>
              <FormControl>
                <Input placeholder="Tên trưởng nhóm (tùy chọn)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Liên hệ</FormLabel>
              <FormControl>
                <Input placeholder="Số điện thoại / email (tùy chọn)" {...field} />
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
