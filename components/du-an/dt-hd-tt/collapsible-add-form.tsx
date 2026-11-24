"use client";

/**
 * Form thêm dòng của các sổ nhập liệu DT-HĐ-TT: hai hàng ô (~110 px thay vì một phần ba màn hình), thu
 * gọn được. Trạng thái thu gọn nhớ theo từng sổ trong `localStorage`; không đọc / ghi được (trình duyệt
 * chặn, chế độ riêng tư) thì form mở như mặc định và nút thu gọn vẫn chạy trong phiên. Server luôn vẽ
 * form mở. Nút "Thu gọn" đứng cuối hàng hai, sau nút gửi, để Tab đi qua các ô không bị chen ngang.
 * Sổ giữ trạng thái form và cách giữ lại ô sau "Thêm dòng"; component này chỉ lo bố cục và thu gọn.
 * Móc kiểm thử: `data-add-form` (tên sổ), `data-collapsed`, `data-add-form-toggle`, `data-add-form-submit`.
 */

import { useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Chiều cao lưới của các sổ dưới form này: lấp phần còn lại của cửa sổ thay vì cố định 560 px. */
export const BOOK_GRID_HEIGHT = "calc(100dvh - 18rem)";

const STORAGE_PREFIX = "dt-hd-tt.add-form-collapsed.";

type FlagStorage = Pick<Storage, "getItem" | "setItem">;
const browserStorage = (): FlagStorage => window.localStorage;

/** Bản nhớ trong phiên: thắng `localStorage` sau lần bấm đầu tiên, nên nút chạy cả khi không ghi được. */
const session = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** Form của sổ `name` đang thu gọn? Không đọc được → false (mở). */
export function readAddFormCollapsed(name: string, storage: () => FlagStorage = browserStorage): boolean {
  const inSession = session.get(name);
  if (inSession !== undefined) return inSession;
  try {
    return storage().getItem(STORAGE_PREFIX + name) === "1";
  } catch {
    return false;
  }
}

/** Ghi trạng thái thu gọn; lỗi ghi `localStorage` bị nuốt (chỉ mất phần nhớ qua lần tải sau). */
export function writeAddFormCollapsed(name: string, collapsed: boolean, storage: () => FlagStorage = browserStorage): void {
  session.set(name, collapsed);
  try {
    storage().setItem(STORAGE_PREFIX + name, collapsed ? "1" : "0");
  } catch {
    // Không lưu được qua lần tải sau; trong phiên vẫn theo `session`.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ô của form: nhãn nhỏ trên, ô nhập dưới. */
export function AddFormField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-0.5 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface Props {
  /** Tên sổ: khóa nhớ thu gọn và móc kiểm thử. */
  name: string;
  /** Tên form (nhãn trợ năng và dòng hiện khi thu gọn). */
  title: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  saving: boolean;
  firstRow: ReactNode;
  secondRow: ReactNode;
}

export function CollapsibleAddForm({ name, title, onSubmit, submitLabel, saving, firstRow, secondRow }: Props) {
  const collapsed = useSyncExternalStore(subscribe, () => readAddFormCollapsed(name), () => false);
  const toggle = () => writeAddFormCollapsed(name, !collapsed);

  if (collapsed) {
    return (
      <div data-add-form={name} data-collapsed="true" className="flex items-center justify-between gap-2 rounded border px-3 py-1">
        <span className="text-sm text-muted-foreground">{title} — đã thu gọn</span>
        <Button type="button" size="sm" variant="outline" aria-expanded={false} data-add-form-toggle onClick={toggle}>
          Mở form
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={title} data-add-form={name} data-collapsed="false" className="space-y-1.5 rounded border p-2">
      <div className="flex flex-wrap items-end gap-2">{firstRow}</div>
      <div className="flex flex-wrap items-end gap-2">
        {secondRow}
        <Button type="submit" disabled={saving} className="h-8" data-add-form-submit>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" className="h-8" aria-expanded data-add-form-toggle onClick={toggle}>
          Thu gọn
        </Button>
      </div>
    </form>
  );
}
