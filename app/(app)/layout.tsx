import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";

/**
 * Defense-in-depth: middleware.ts is the primary auth gate. This layout
 * performs a server-side session check as a second layer so that even if
 * middleware is misconfigured, unauthenticated requests cannot reach any
 * (app) route group page.
 *
 * RBAC: this layout only blocks users with no role at all. Per-module access
 * checks are enforced in each segment's layout via requireModuleAccess() and
 * in write paths via requireRoleModuleAccess() from lib/acl.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.user) {
    redirect("/login");
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true },
  });
  if (!activeUser?.isActive) {
    redirect("/login");
  }

  // Any user with no role at all is denied.
  if (!session.user.role) {
    redirect("/login");
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "17rem" } as React.CSSProperties}>
      <div className="nq-app-shell flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="nq-main flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
