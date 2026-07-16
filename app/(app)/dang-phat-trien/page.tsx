import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Construction } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { isModuleInDevelopment } from "@/lib/acl/module-availability";
import { MODULE_LABELS } from "@/lib/acl/module-labels";
import { MODULE_KEYS } from "@/lib/acl/modules";
import type { ModuleKey } from "@/lib/acl/modules";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function SyntheticModuleShell() {
  return (
    <div aria-hidden="true" inert className="absolute inset-0 overflow-hidden bg-background p-4 sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="h-8 w-48 rounded-lg bg-muted" />
          <div className="h-11 w-28 rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 rounded-xl border bg-card" />
          <div className="h-28 rounded-xl border bg-card" />
          <div className="h-28 rounded-xl border bg-card" />
        </div>
        <div className="flex-1 rounded-xl border bg-card p-4">
          <div className="mb-5 h-6 w-40 rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-10 rounded-lg bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function DevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  if (!m || !(MODULE_KEYS as readonly string[]).includes(m)) {
    redirect("/forbidden");
  }

  const moduleKey = m as ModuleKey;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const entitled = await canAccessEntitlement(session.user.id, moduleKey, {
    minLevel: "read",
    scope: "module",
  });
  if (!entitled) {
    const params = new URLSearchParams({ m: moduleKey, need: "read" });
    redirect(`/forbidden?${params.toString()}`);
  }
  if (!(await isModuleInDevelopment(moduleKey))) redirect("/dashboard");

  const moduleLabel = MODULE_LABELS[moduleKey];

  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden">
      <SyntheticModuleShell />
      <div className="safe-top safe-bottom absolute inset-0 z-10 grid place-items-center bg-background/55 p-4 backdrop-blur-md">
        <section
          role="status"
          aria-labelledby="development-title"
          className="w-full max-w-md rounded-2xl border bg-card/95 p-6 text-center shadow-xl"
        >
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300">
            <Construction className="size-7" aria-hidden="true" />
          </span>
          <h1 id="development-title" className="mt-4 font-heading text-xl font-semibold">
            Module đang phát triển
          </h1>
          <p className="mt-2 text-muted-foreground">
            <span className="font-semibold text-foreground">{moduleLabel}</span> chưa sẵn sàng để sử dụng.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Màn hình phía sau chỉ là giao diện minh họa và không chứa dữ liệu nghiệp vụ.
          </p>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }), "mt-6 min-h-11 px-4")}
          >
            Về Dashboard
          </Link>
        </section>
      </div>
    </div>
  );
}
