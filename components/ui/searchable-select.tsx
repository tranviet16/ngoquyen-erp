"use client";

/**
 * Ô chọn có tìm trên Combobox của Base UI, cho danh sách dài (NCC, đầu mối, Mã nhóm, Dòng DT):
 *   - gõ để lọc, bỏ dấu tiếng Việt và đ (`matchesSearch`); mục khớp đầu tiên được tô sẵn;
 *   - danh sách vẽ trong Portal, nên không bị bảng / khung cuộn bao quanh cắt mất;
 *   - chỉ cần bàn phím: ↓ mở danh sách, ↑ / ↓ chọn mục, Enter chọn mục đang tô, Esc đóng;
 *   - Enter khi danh sách đang mở KHÔNG BAO GIỜ gửi form bao quanh (Base UI chỉ chặn khi có mục
 *     đang tô; `guardEnter` chặn cả khi không có mục nào khớp). Danh sách đóng thì Enter gửi form như
 *     mọi ô nhập khác.
 * Không có ô "tạo mới": danh mục mới do quản trị tạo ở trang danh mục.
 * Móc kiểm thử: `data-searchable-select` (vỏ), `-input`, `-popup`, `-option` (giá trị của mục).
 */

import { useMemo, type KeyboardEvent } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch, type SearchableOption } from "./searchable-select-filter";

export type { SearchableOption } from "./searchable-select-filter";

interface Props {
  /** Tên của ô cho móc kiểm thử (`data-searchable-select`). */
  name: string;
  options: readonly SearchableOption[];
  /** Giá trị đang chọn; "" = chưa chọn / lựa chọn trống. */
  value: string;
  onChange: (value: string) => void;
  /** Lựa chọn trống đứng đầu danh sách (vd. "(không gắn)"); không có = ô bắt buộc chọn một mục. */
  emptyLabel?: string;
  placeholder?: string;
  /** Chỉ báo cho trình đọc màn hình; form tự kiểm khi gửi (input ẩn `required` sẽ chặn gửi mà không báo gì). */
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}

const sameOption = (a: SearchableOption, b: SearchableOption) => a.value === b.value;
const optionMatches = (option: SearchableOption, query: string) => matchesSearch(option.label, query);

/** Enter khi danh sách đang mở: chặn gửi form (chạy trước xử lý của Base UI — props người dùng gộp sau cùng). */
function guardEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
  if (e.currentTarget.getAttribute("aria-expanded") === "true") e.preventDefault();
}

export function SearchableSelect({ name, options, value, onChange, emptyLabel, placeholder, required, autoFocus, className, ...aria }: Props) {
  const items: readonly SearchableOption[] = emptyLabel === undefined ? options : [{ value: "", label: emptyLabel }, ...options];
  const selectedLabel = value === "" ? undefined : options.find((o) => o.value === value)?.label;
  // Giữ nguyên đối tượng khi giá trị / nhãn không đổi: Base UI ghi lại ô nhập mỗi lần `value` đổi đối
  // tượng, nên dựng lại ở mỗi lần cha vẽ lại (vd. refresh sau "Thêm dòng") sẽ xóa chữ đang gõ.
  const selected = useMemo(() => (selectedLabel === undefined ? null : { value, label: selectedLabel }), [value, selectedLabel]);

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(next: SearchableOption | null) => onChange(next?.value ?? "")}
      filter={optionMatches}
      isItemEqualToValue={sameOption}
      autoHighlight
    >
      <div className={cn("relative", className)} data-searchable-select={name}>
        <Combobox.Input
          aria-label={aria["aria-label"]}
          aria-required={required || undefined}
          placeholder={placeholder ?? emptyLabel}
          autoFocus={autoFocus}
          onKeyDown={guardEnter}
          data-searchable-select-input={name}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent pr-7 pl-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <ChevronsUpDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50 outline-none">
          <Combobox.Popup
            data-searchable-select-popup={name}
            className="max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-56 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <Combobox.Empty className="px-2 py-1.5 text-muted-foreground empty:hidden">Không có lựa chọn nào khớp</Combobox.Empty>
            <Combobox.List>
              {(option: SearchableOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  data-searchable-select-option={option.value}
                  className="cursor-default rounded-md px-2 py-1.5 select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium"
                >
                  {option.label}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
