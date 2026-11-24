"use client";

/**
 * Trạng thái lọc của một màn sống trên URL. Ba quy tắc giữ việc của người dùng:
 *   - Khi gắn vào trang, đọc URL ĐANG HIỆN (`window.location.search`); props server chỉ là bản cho lần
 *     render đầu. Back / Forward dựng lại cây lúc đến trang (search cũ), còn URL đã được ghi mới hơn.
 *   - Props server mới chỉ được nhận khi chúng bằng URL đang hiện (điều hướng thật). Kết quả refresh
 *     mang search lúc gửi yêu cầu — có thể cũ hơn bộ lọc vừa đổi — nên bị bỏ qua. `reconcileUrlState`
 *     là nơi duy nhất quyết định việc này.
 *   - Mỗi thay đổi nhận từ ngoài vào báo `changed` để trang bỏ chọn / đóng ô đang mở (lưới tự bỏ chọn
 *     khi bộ lọc điều khiển đổi).
 * Ghi lại URL bằng `history.replaceState` (Next 16 đồng bộ vào router), giữ nguyên neo `#`.
 * Không bao giờ đặt `key` cho client theo bộ lọc URL: đổi key xóa trắng các ô form đang gõ.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalJson } from "@/lib/du-an/dt-hd-tt/grid-url-codec";

/** Đọc / ghi trạng thái của một màn từ query. `write` trả query mới đầy đủ (không có "?"). */
export interface UrlCodec<S> {
  parse: (search: string) => S;
  write: (state: S, liveSearch: string) => string;
}

/** Hai trạng thái bằng nhau theo nội dung (khóa không phụ thuộc thứ tự, bỏ trường undefined). */
export function sameUrlState<S>(a: S, b: S): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export interface Reconciled<S> {
  state: S;
  /** Trạng thái vừa đổi vì nhận từ ngoài vào → bỏ chọn dòng / đóng ô đang mở. */
  changed: boolean;
}

/**
 * `current`: trạng thái client đang giữ; `incoming`: đọc từ props server mới; `live`: đọc từ URL đang
 * hiện. Chỉ nhận `incoming` khi nó bằng `live` (điều hướng thật, hoặc refresh gửi sau lần ghi URL cuối);
 * khác thì đó là kết quả refresh cũ hơn bộ lọc hiện tại → giữ nguyên.
 */
export function reconcileUrlState<S>(current: S, incoming: S, live: S, same: (a: S, b: S) => boolean = sameUrlState): Reconciled<S> {
  if (!same(incoming, live) || same(incoming, current)) return { state: current, changed: false };
  return { state: incoming, changed: true };
}

/** URL mới khi query đổi (giữ đường dẫn và neo); null nếu query không đổi. */
export function nextLocation(pathname: string, liveSearch: string, hash: string, query: string): string | null {
  if (query === liveSearch.replace(/^\?/, "")) return null;
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function replaceQuery(query: string): void {
  const { pathname, search, hash } = window.location;
  const url = nextLocation(pathname, search, hash, query);
  if (url !== null) window.history.replaceState(null, "", url);
}

/**
 * `initial`: trạng thái server đọc từ `searchParams` của lần tải / refresh này. `codec` phải ổn định
 * (khai báo ngoài component). `onAdopt` chạy khi trạng thái đổi vì nhận từ URL / props.
 */
export function useUrlState<S>(initial: S, codec: UrlCodec<S>, onAdopt?: (state: S) => void): [S, (next: S) => void] {
  const [state, setState] = useState<S>(initial);
  const stateRef = useRef(state);
  const adoptRef = useRef(onAdopt);
  const seeded = useRef(false);
  useEffect(() => {
    adoptRef.current = onAdopt;
  }, [onAdopt]);

  const adopt = useCallback((next: S) => {
    stateRef.current = next;
    setState(next);
    adoptRef.current?.(next);
  }, []);

  // Gắn vào trang: nhận URL đang hiện rồi chuẩn hóa URL (bỏ tham số lạ). Props server mới (refresh /
  // điều hướng): qua reconcileUrlState. Chạy trong microtask để không setState đồng bộ trong effect.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const liveSearch = window.location.search;
      const live = codec.parse(liveSearch);
      if (!seeded.current) {
        seeded.current = true;
        if (!sameUrlState(live, stateRef.current)) adopt(live);
        replaceQuery(codec.write(live, liveSearch));
        return;
      }
      const result = reconcileUrlState(stateRef.current, initial, live);
      if (result.changed) adopt(result.state);
    });
    return () => {
      active = false;
    };
  }, [initial, codec, adopt]);

  const update = useCallback(
    (next: S) => {
      const query = codec.write(next, window.location.search);
      // Giữ đúng dạng URL đọc lại được, để trạng thái và URL không lệch nhau.
      const stored = codec.parse(`?${query}`);
      stateRef.current = stored;
      setState(stored);
      replaceQuery(query);
    },
    [codec],
  );

  return [state, update];
}
