"use client";

import { useRouter } from "next/navigation";
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

interface ExtendedUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export function Topbar() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 sticky top-0 z-10">
      <SidebarTrigger className="-ml-1" />
      <div className="flex-1" />
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted transition-colors">
          <span className="hidden sm:inline-block">
            {user?.name ?? user?.email ?? "Nguoi dung"}
          </span>
          {user?.role && (
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              [{user.role}]
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
            Dang xuat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
