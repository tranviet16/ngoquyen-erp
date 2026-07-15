import Link from "next/link";
import {
  Bell,
  Building2,
  ClipboardList,
  KanbanSquare,
  Package,
  TrendingUp,
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
      <div className="nq-panel p-8 text-center text-sm text-muted-foreground">
        Không có việc cần xử lý.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Không có việc cần xử lý. Truy cập nhanh:
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {shortcuts.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            <Link
              key={s.href}
              href={s.href}
              className="nq-card flex items-center gap-3 p-4 transition-colors hover:border-primary/35 hover:bg-secondary/45"
            >
              <Icon className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
