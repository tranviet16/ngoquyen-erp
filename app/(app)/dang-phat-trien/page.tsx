import Link from "next/link";
import { Construction } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULE_KEYS } from "@/lib/acl/modules";
import type { ModuleKey } from "@/lib/acl/modules";
import { MODULE_LABELS } from "@/lib/acl/module-labels";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const moduleLabel =
    m && (MODULE_KEYS as readonly string[]).includes(m)
      ? MODULE_LABELS[m as ModuleKey]
      : null;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-8 text-center">
      <Construction className="size-16 text-muted-foreground/50" aria-hidden="true" />
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold">Tính năng đang phát triển</h1>
        <p className="text-muted-foreground">
          {moduleLabel ? (
            <>
              Module <span className="font-semibold text-foreground">{moduleLabel}</span> đang
              được hoàn thiện và chưa mở truy cập.
            </>
          ) : (
            "Khu vực này đang được hoàn thiện và chưa mở truy cập."
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Bạn có thể quay lại sau khi tính năng được bật trong cấu hình hệ thống.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
        Về Dashboard
      </Link>
    </div>
  );
}
