"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, LogOut, Search, Settings, User as UserIcon } from "lucide-react";
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
  title?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  ketoan: "Kế toán",
  canbo_vt: "Cán bộ vật tư",
  chihuy_ct: "Cán bộ kỹ thuật",
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
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const { data: session } = useSession();
  const showBack = pathname !== "/dashboard" && pathname !== "/";
  const user = session?.user as ExtendedUser | undefined;
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : null;
  const positionLabel = user?.title || roleLabel;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/tim-kiem?q=${encodeURIComponent(q)}`);
    setQuery("");
  }

  return (
    <header className="nq-topbar sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-5">
      <SidebarTrigger className="-ml-1 size-9 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />
      <div className="h-4 w-px bg-border shrink-0" aria-hidden="true" />
      {showBack && (
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          aria-label="Quay lại"
          title="Quay lại"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>
      <form
        onSubmit={handleSearch}
        className="hidden h-9 w-[320px] items-center gap-2 rounded-md border bg-card/80 px-2.5 text-left text-xs text-muted-foreground transition-colors focus-within:border-primary/45 focus-within:bg-card lg:flex"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Tìm dự án, NCC, phiếu phối hợp..."
          aria-label="Tìm kiếm"
        />
      </form>
      <div className="hidden h-4 w-px bg-border lg:block" aria-hidden="true" />
      <div className="flex items-center gap-1 shrink-0">
        <ThemeToggle />
        <NotificationBell />
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Cài đặt"
          title="Cài đặt"
        >
          <Settings className="size-4" aria-hidden="true" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-10 items-center gap-2 rounded-md border bg-card/72 py-1 pl-1.5 pr-2 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Tài khoản"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              {initialsOf(user?.name, user?.email)}
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight text-left min-w-0">
              <span className="text-sm font-medium truncate max-w-[160px]">
                {user?.name ?? user?.email ?? "Người dùng"}
              </span>
              {positionLabel && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {positionLabel}
                </span>
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium truncate">{user?.name ?? "Người dùng"}</span>
                <span className="text-xs font-normal text-muted-foreground truncate">{user?.email}</span>
                {positionLabel && (
                  <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {positionLabel}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/ho-so")}
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
