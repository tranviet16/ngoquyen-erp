"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contractSchema, type ContractInput } from "@/lib/du-an/schemas";

interface Props {
  defaultValues?: Partial<ContractInput>;
  onSubmit: (d: ContractInput) => Promise<void>;
}

export function ContractForm({ defaultValues, onSubmit }: Props) {
  const form = useForm<ContractInput>({
    resolver: zodResolver(contractSchema),
    defaultValues: { docType: "contract", status: "active", projectId: defaultValues?.projectId ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="docName" render={({ field }) => (
          <FormItem><FormLabel>Tên tài liệu</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="docType" render={({ field }) => (
            <FormItem><FormLabel>Loại</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="contract">Hợp đồng</option>
                <option value="license">Giấy phép</option>
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem><FormLabel>Trạng thái</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="active">Hiệu lực</option>
                <option value="expired">Hết hạn</option>
                <option value="terminated">Đã hủy</option>
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="partyName" render={({ field }) => (
          <FormItem><FormLabel>Đối tác</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="valueVnd" render={({ field }) => (
          <FormItem><FormLabel>Giá trị (VND)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="signedDate" render={({ field }) => (
            <FormItem><FormLabel>Ngày ký</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="expiryDate" render={({ field }) => (
            <FormItem><FormLabel>Ngày hết hạn</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="storage" render={({ field }) => (
          <FormItem><FormLabel>Nơi lưu trữ</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="flex justify-end pt-2">
          <Button type="submit">Lưu</Button>
        </div>
      </form>
    </Form>
  );
}
