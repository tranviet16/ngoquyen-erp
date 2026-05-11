import Link from "next/link";
import {
  Building2,
  Package,
  TrendingUp,
  KanbanSquare,
  ClipboardList,
  Bell,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Building2,
  Package,
  TrendingUp,
  KanbanSquare,
  ClipboardList,
  Bell,
};

export type Shortcut = { label: string; href: string; icon: keyof typeof ICONS };

export function EmptyFallback({ shortcuts }: { shortcuts: Shortcut[] }) {
  if (shortcuts.length === 0) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 text-center text-sm text-muted-foreground">
        Không có việc cần xử lý.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Không có việc cần xử lý. Truy cập nhanh:
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {shortcuts.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-3 hover:bg-accent"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
