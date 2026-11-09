"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signReconciliationAction } from "@/lib/vat-tu-ncc/reconciliation-actions";

export function SignReconButton({ reconciliationId }: { reconciliationId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSign() {
    if (
      !confirm(
        "Xác nhận NCC đã ký bảng đối chiếu này? Số liệu sẽ được đông cứng và kỳ bị khóa ghi (phiếu, phát sinh, thanh toán trong kỳ).",
      )
    )
      return;
    startTransition(async () => {
      try {
        // Action trả { ok, … }: thông điệp nghiệp vụ (phiếu chưa chốt, kỳ đã ký…) không bị ẩn ở production.
        const result = await signReconciliationAction(reconciliationId);
        if (!result.ok) {
          toast.error("Lỗi: " + result.message);
          return;
        }
        toast.success("Đã ký và khóa kỳ");
        router.refresh();
      } catch (err) {
        toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  return (
    <Button onClick={handleSign} disabled={pending}>
      {pending ? "Đang ký…" : "NCC đã ký — khóa kỳ"}
    </Button>
  );
}
