import { Check } from "lucide-react";
import type { ModuleAvailabilityStatus } from "@/lib/acl";
import { cn } from "@/lib/utils";

interface ReleaseStatusSwitchRowProps {
  label: string;
  status: ModuleAvailabilityStatus;
  locked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function ReleaseStatusSwitchRow({
  label,
  status,
  locked,
  disabled,
  onToggle,
}: ReleaseStatusSwitchRowProps) {
  const ready = status === "ready";
  return (
    <div className="flex min-h-16 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {locked ? "Module cốt lõi · Luôn phát hành" : ready ? "Phát hành" : "Đang phát triển"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ready}
        aria-label={`${label}: ${ready ? "Phát hành" : "Đang phát triển"}`}
        disabled={locked || disabled}
        onClick={onToggle}
        className={cn(
          "relative flex min-h-11 w-14 shrink-0 items-center rounded-full border p-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-55",
          ready ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-full bg-background shadow-sm transition-transform",
            ready && "translate-x-3",
          )}
        >
          {ready ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
        </span>
      </button>
    </div>
  );
}
