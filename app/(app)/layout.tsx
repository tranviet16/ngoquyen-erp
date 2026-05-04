import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/rbac";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";

/**
 * Defense-in-depth: middleware.ts is the primary auth gate. This layout
 * performs a server-side session check as a second layer so that even if
 * middleware is misconfigured, unauthenticated requests cannot reach any
 * (app) route group page.
 *
 * RBAC: `hasRole(role, "viewer")` passes for every valid role, blocking only
 * users with no role at all. Stricter per-route role checks (e.g. requireRole
 * for "admin" segments) should be added in those segments' layouts or page
 * components using `requireRole()` from lib/rbac.ts.
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

  // Require at least the lowest role — any user with no role is denied.
  if (!hasRole(session.user.role, "viewer")) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Topbar />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
