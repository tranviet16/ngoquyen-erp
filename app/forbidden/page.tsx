import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <ShieldOff className="size-16 text-muted-foreground/50" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Không có quyền truy cập</h1>
        <p className="text-muted-foreground max-w-sm">
          Bạn không có quyền truy cập vào trang này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
        Về trang chủ
      </Link>
    </div>
  );
}
