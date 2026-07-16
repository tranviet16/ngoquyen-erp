"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODULE_KEYS } from "@/lib/acl/modules";
import type { ModuleAvailabilityStatus, ModuleKey } from "@/lib/acl";
import { updateModuleAvailability } from "./availability-actions";
import { ReleaseStatusSwitchRow } from "./release-status-switch-row";

const PROTECTED_MODULES = new Set<ModuleKey>(["dashboard", "admin.permissions"]);

interface ReleaseStatusCardProps {
  initialStatuses: Readonly<Record<ModuleKey, ModuleAvailabilityStatus>>;
  moduleLabels: Record<ModuleKey, string>;
}

export function ReleaseStatusCard({
  initialStatuses,
  moduleLabels,
}: ReleaseStatusCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [draft, setDraft] = useState(initialStatuses);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const changes = useMemo(
    () => MODULE_KEYS.filter((key) => draft[key] !== statuses[key]),
    [draft, statuses],
  );
  const disabling = changes.filter(
    (key) => statuses[key] === "ready" && draft[key] === "development",
  );
  const developmentCount = MODULE_KEYS.filter(
    (key) => statuses[key] === "development",
  ).length;

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
    setConfirming(false);
    setError(null);
    if (nextOpen) setDraft(statuses);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateModuleAvailability(
          changes.map((moduleKey) => ({
            moduleKey,
            status: draft[moduleKey],
            previousStatus: statuses[moduleKey],
          })),
        );
        setStatuses(draft);
        setOpen(false);
        setConfirming(false);
        router.refresh();
      } catch (cause) {
        setConfirming(false);
        setError(cause instanceof Error ? cause.message : "Không thể lưu trạng thái module");
      }
    });
  }

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Trạng thái phát hành</CardTitle>
          <CardDescription>
            {developmentCount === 0
              ? "Tất cả module đang được phát hành."
              : `${developmentCount} module đang trong quá trình phát triển.`}
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              className="min-h-11 px-3"
              onClick={() => handleOpenChange(true)}
            >
              <Settings2 aria-hidden="true" />
              Quản lý trạng thái
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
            {MODULE_KEYS.length - developmentCount} phát hành
          </span>
          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
            {developmentCount} đang phát triển
          </span>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-2xl"
        >
          <DialogHeader className="safe-top max-sm:px-1 max-sm:pt-2">
            <DialogTitle>Trạng thái phát hành module</DialogTitle>
            <DialogDescription>
              Module đang phát triển vẫn hiện với người có quyền nhưng không tải dữ liệu nghiệp vụ.
            </DialogDescription>
          </DialogHeader>

          <div className="overscroll-contain overflow-y-auto sm:max-h-[60vh]">
            {confirming ? (
              <div className="space-y-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4">
                <div>
                  <p className="font-semibold">Xác nhận chuyển sang đang phát triển</p>
                  <p className="mt-1 text-muted-foreground">
                    Người dùng sẽ không thể truy cập các module sau cho tới khi được phát hành lại:
                  </p>
                </div>
                <ul className="space-y-2" aria-label="Module sẽ bị chặn">
                  {disabling.map((key) => (
                    <li key={key} className="flex items-center gap-2 font-medium">
                      <CircleDot className="size-4 text-amber-600" aria-hidden="true" />
                      {moduleLabels[key]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {MODULE_KEYS.map((key) => {
                  const locked = PROTECTED_MODULES.has(key);
                  return (
                    <ReleaseStatusSwitchRow
                      key={key}
                      label={moduleLabels[key]}
                      status={draft[key]}
                      locked={locked}
                      disabled={isPending}
                      onToggle={() =>
                          setDraft((current) => ({
                            ...current,
                            [key]: current[key] === "ready" ? "development" : "ready",
                          }))
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
            {isPending ? "Đang lưu thay đổi…" : changes.length > 0 ? `${changes.length} thay đổi chưa lưu` : "Không có thay đổi"}
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="safe-bottom max-sm:m-0 max-sm:rounded-none">
            <Button variant="outline" className="min-h-11" disabled={isPending} onClick={() => confirming ? setConfirming(false) : handleOpenChange(false)}>
              {confirming ? "Quay lại" : "Hủy"}
            </Button>
            <Button
              className="min-h-11"
              disabled={isPending || changes.length === 0}
              onClick={() => disabling.length > 0 && !confirming ? setConfirming(true) : save()}
            >
              {confirming ? "Xác nhận và lưu" : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
