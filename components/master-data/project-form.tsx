"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { projectSchema } from "@/lib/master-data/schemas";

type ProjectFormValues = z.input<typeof projectSchema>;
type ProjectOutput = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  defaultValues?: Partial<ProjectFormValues>;
  onSubmit: (data: ProjectOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function ProjectForm({ defaultValues, onSubmit, isSubmitting }: ProjectFormProps) {
  const form = useForm<ProjectFormValues, unknown, ProjectOutput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      code: "",
      name: "",
      ownerInvestor: "",
      contractValue: "",
      startDate: "",
      endDate: "",
      status: "active",
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
                <FormLabel>Mã dự án</FormLabel>
                <FormControl>
                  <Input placeholder="VD: DA-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trạng thái</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="active">Đang thực hiện</option>
                    <option value="completed">Hoàn thành</option>
                    <option value="paused">Tạm dừng</option>
                  </select>
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
              <FormLabel>Tên dự án</FormLabel>
              <FormControl>
                <Input placeholder="Nhập tên dự án" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ownerInvestor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chủ đầu tư</FormLabel>
              <FormControl>
                <Input placeholder="Tên chủ đầu tư (tùy chọn)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contractValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Giá trị hợp đồng (VND)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ngày khởi công</FormLabel>
                <FormControl>
                  <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ngày hoàn thành dự kiến</FormLabel>
                <FormControl>
                  <DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
