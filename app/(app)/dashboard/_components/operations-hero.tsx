import Link from "next/link";
import { Building2, Download, HardHat, PackageCheck, Plus, WalletCards } from "lucide-react";
import type { Shortcut } from "./empty-fallback";

export function OperationsHero({
  userName,
  today,
  pendingForms,
  shortcuts,
  scopeLabel,
}: {
  userName: string | null | undefined;
  today: string;
  pendingForms: number;
  shortcuts: Shortcut[];
  scopeLabel: string;
}) {
  return (
    <section className="nq-panel overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="p-5 md:p-6">
          <div className="nq-kicker">
            <HardHat className="size-3.5" aria-hidden="true" />
            Trung tâm điều hành xây dựng
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-normal text-foreground md:text-[32px]">
                Kiểm soát dự án, vật tư, công nợ và dòng tiền trong ngày
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Xin chào, {userName}. Hôm nay <span className="capitalize">{today}</span>.
                <span className="ml-2 inline-flex rounded border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {scopeLabel}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tai-chinh/bao-cao-thanh-khoan"
                className="nq-action-link border bg-card text-foreground hover:bg-secondary"
              >
                <Download className="size-4" />
                Báo cáo
              </Link>
              <Link
                href="/tai-chinh/nhat-ky"
                className="nq-action-link bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Plus className="size-4" />
                Giao dịch
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t bg-secondary/42 p-5 lg:border-l lg:border-t-0">
          <div className="grid gap-3 text-sm">
            {[
              {
                icon: Building2,
                label: "Dự án",
                value: shortcuts.some((s) => s.href === "/du-an") ? "Đang mở" : "Theo quyền",
              },
              { icon: PackageCheck, label: "Vật tư", value: "Theo NCC" },
              { icon: WalletCards, label: "Tài chính", value: `${pendingForms} phiếu chờ` },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-md border bg-card/72 p-3">
                  <span className="grid size-9 place-items-center rounded-md bg-accent/12 text-accent">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="truncate font-semibold">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
