"use client";

import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { Breadcrumb } from "./breadcrumb";

interface ExtendedUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  ketoan: "Kế toán",
  thukho: "Thủ kho",
  giamsat: "Giám sát",
  viewer: "Người xem",
};

function initialsOf(name?: string, email?: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Topbar() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as ExtendedUser | undefined;
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : null;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-4 sticky top-0 z-20 supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <div className="h-5 w-px bg-border shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <Breadcrumb />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <ThemeToggle />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-md pl-1.5 pr-2 py-1 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Tài khoản"
          >
            <span className="inline-flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {initialsOf(user?.name, user?.email)}
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight text-left min-w-0">
              <span className="text-sm font-medium truncate max-w-[160px]">
                {user?.name ?? user?.email ?? "Người dùng"}
              </span>
              {roleLabel && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {roleLabel}
                </span>
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium truncate">{user?.name ?? "Người dùng"}</span>
                <span className="text-xs font-normal text-muted-foreground truncate">{user?.email}</span>
                {roleLabel && (
                  <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {roleLabel}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/master-data")}
              className="cursor-pointer gap-2"
            >
              <UserIcon className="size-4" aria-hidden="true" />
              <span>Tài khoản của tôi</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive cursor-pointer gap-2"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
