/**
 * Hai khối "phải sửa gì" của Tổng quan (Server Component):
 *   - Việc cần làm: mỗi việc một dòng (số đếm hoặc ô tiền của báo cáo) + nút đi sửa, link dựng bằng
 *     `screenHref` — màn đã sẵn sàng thì mở đúng bộ lọc, chưa sẵn sàng thì mở trang trần. Việc bằng 0 đã
 *     bị ẩn ở `buildOverviewTodos`. Hook: `data-todo` (mã việc) + `data-todo-count` (khi có số đếm).
 *   - Kiểm tổng: một dòng "n/n khớp" trong `<details>`; mở ra thấy số khớp theo báo cáo và mỗi dòng lệch
 *     kèm Δ (= thực tế − kỳ vọng, như dòng đối soát của bản in) và link nơi sửa.
 * Icon lucide, không emoji.
 */

import Link from "next/link";
import { ChevronRight, CircleAlert, CircleCheck, ListTodo } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CheckGroup, OverviewCheck } from "@/lib/du-an/dt-hd-tt/overview";
import { linkHref, type OverviewTodo } from "@/lib/du-an/dt-hd-tt/overview-todos";
import { CollapsibleSection, moneyOrZero } from "./report-bits";

const LINK = "inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline";
const CHECK_GROUPS: readonly CheckGroup[] = ["DT-HĐ", "DT-TT", "HĐ-TT"];

export function TongQuanTodos({ projectId, todos }: { projectId: number; todos: OverviewTodo[] }) {
  return (
    <section className="space-y-2" data-section="viec-can-lam">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ListTodo className="size-4 text-muted-foreground" aria-hidden="true" />
        Việc cần làm
      </h3>
      {todos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4" aria-hidden="true" />
          Không còn việc nào cần làm.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {todos.map((t) => (
            <li
              key={t.id}
              data-todo={t.id}
              data-todo-count={t.count ?? undefined}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                {t.count !== null && <span className="min-w-6 text-right font-semibold tabular-nums">{t.count}</span>}
                <span>{t.label}</span>
                {t.amount && (
                  <span className="text-muted-foreground">
                    · <span className="tabular-nums">{moneyOrZero(t.amount.value)}</span> ({t.amount.basis})
                  </span>
                )}
              </span>
              <Link href={linkHref(projectId, t.link)} className={LINK}>
                {t.action}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CheckLine({ projectId, c }: { projectId: number; c: OverviewCheck }) {
  const delta = c.check.actual - c.check.expected;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-xs" data-check-failing={c.group}>
      <span className="flex items-start gap-1.5 text-red-700 dark:text-red-300">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium">{c.group}</span>
          {c.scope && ` · ${c.scope}`}: {c.check.label} — lệch <span className="tabular-nums">{moneyOrZero(delta)}</span>
        </span>
      </span>
      <Link href={linkHref(projectId, c.fix)} className={LINK}>
        Xem ở {c.group}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function TongQuanChecks({ projectId, checks }: { projectId: number; checks: OverviewCheck[] }) {
  const ok = checks.filter((c) => c.check.ok).length;
  const failing = checks.filter((c) => !c.check.ok);
  const allOk = failing.length === 0;
  return (
    <section data-section="kiem-tong" data-checks-ok={ok} data-checks-total={checks.length}>
      <CollapsibleSection
        title={
          <span className="inline-flex items-center gap-1.5">
            {allOk ? (
              <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            ) : (
              <CircleAlert className="size-4 text-red-600 dark:text-red-300" aria-hidden="true" />
            )}
            Kiểm tổng: {ok}/{checks.length} khớp
          </span>
        }
        summary={allOk ? "mọi dòng đối soát của ba báo cáo" : `${failing.length} dòng lệch`}
      >
        <div className="space-y-2 rounded-lg border bg-card px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {CHECK_GROUPS.map((g) => {
              const group = checks.filter((c) => c.group === g);
              const groupOk = group.filter((c) => c.check.ok).length;
              return (
                <StatusBadge
                  key={g}
                  tone={groupOk === group.length ? "success" : "danger"}
                  label={`${g}: ${groupOk}/${group.length} khớp`}
                />
              );
            })}
          </div>
          {!allOk && (
            <ul className="divide-y">
              {failing.map((c, i) => (
                <CheckLine key={`${c.group}-${i}`} projectId={projectId} c={c} />
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>
    </section>
  );
}
