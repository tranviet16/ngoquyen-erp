import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULE_KEYS, ACCESS_LEVELS } from "@/lib/acl/modules";
import type { AccessLevel, ModuleKey } from "@/lib/acl/modules";
import { MODULE_LABELS, LEVEL_LABELS } from "@/lib/acl/module-labels";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; need?: string }>;
}) {
  const { m, need } = await searchParams;

  const moduleLabel =
    m && (MODULE_KEYS as readonly string[]).includes(m)
      ? MODULE_LABELS[m as ModuleKey]
      : null;
  const levelLabel =
    need && (ACCESS_LEVELS as readonly string[]).includes(need)
      ? LEVEL_LABELS[need as AccessLevel]
      : null;

  const hasContext = moduleLabel !== null && levelLabel !== null;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-8 text-center">
      <ShieldOff className="size-16 text-muted-foreground/50" aria-hidden="true" />
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold">Không có quyền truy cập</h1>
        {hasContext ? (
          <p className="text-muted-foreground">
            Bạn cần quyền <span className="font-semibold text-foreground">{levelLabel}</span>{" "}
            cho module{" "}
            <span className="font-semibold text-foreground">{moduleLabel}</span>.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Bạn không có quyền truy cập vào trang này.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Vui lòng liên hệ quản trị viên để được cấp quyền.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
        Về Dashboard
      </Link>
    </div>
  );
}
