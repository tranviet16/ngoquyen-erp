"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { QuickCreateKind, QuickCreatedRecord } from "@/lib/master-data/quick-create-types";
import { QuickCreateDialog, type QuickCreateRequestOptions } from "./quick-create-dialog";

/** Giá trị `<option>` "+ Tạo mới…" — không bao giờ được lưu làm khoá ngoại. */
export const QUICK_CREATE_VALUE = "__quick_create__";
export const QUICK_CREATE_OPTION_LABEL = "+ Tạo mới…";

type Request = (kind: QuickCreateKind, opts?: QuickCreateRequestOptions) => Promise<QuickCreatedRecord | null>;

interface QuickCreateContextValue {
  /** Người dùng được tạo danh mục tại chỗ (admin) — ô chọn chỉ hiện "+ Tạo mới…" khi true. */
  enabled: boolean;
  /** Mở hộp thoại tạo (đặt ở layout); trả bản ghi đã tạo / đã chọn, hoặc null khi huỷ. */
  request: Request;
  /** Bản ghi tạo trong phiên này — để các ô chọn hiện ngay mà không chờ tải lại trang. */
  created: readonly QuickCreatedRecord[];
  addCreated: (record: QuickCreatedRecord) => void;
}

const QuickCreateContext = createContext<QuickCreateContextValue>({
  enabled: false,
  request: async () => null,
  created: [],
  addCreated: () => {},
});

type Pending = { kind: QuickCreateKind; opts: QuickCreateRequestOptions };

/**
 * Trạng thái một hộp thoại "Tạo mới": `request` mở hộp thoại, `element` là hộp thoại cần render.
 * Promise của `request` chỉ resolve SAU commit — bản ghi mới đã vào `created` và các ô chọn đã có
 * lựa chọn đó khi nơi gọi chọn id mới.
 */
function useQuickCreateDialogHost(enabled: boolean, addCreated: (record: QuickCreatedRecord) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const settledRef = useRef<{ record: QuickCreatedRecord | null } | null>(null);
  const resolverRef = useRef<((record: QuickCreatedRecord | null) => void) | null>(null);

  const request = useCallback<Request>(
    (kind, opts = {}) =>
      new Promise((resolve) => {
        if (!enabled) {
          resolve(null);
          return;
        }
        resolverRef.current?.(null); // một hộp thoại mỗi lúc: yêu cầu cũ coi như huỷ
        resolverRef.current = resolve;
        setPending({ kind, opts });
      }),
    [enabled],
  );

  const handleDone = useCallback(
    (record: QuickCreatedRecord | null) => {
      if (record) addCreated(record);
      settledRef.current = { record };
      setPending(null);
    },
    [addCreated],
  );

  // setPending(null) luôn gây một lần render → resolve ở effect sau commit đó.
  useEffect(() => {
    const settled = settledRef.current;
    if (!settled) return;
    settledRef.current = null;
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(settled.record);
  });

  const element = pending ? <QuickCreateDialog kind={pending.kind} opts={pending.opts} onDone={handleDone} /> : null;
  return { request, element };
}

/** Đặt một lần ở layout app: hộp thoại "Tạo mới" dùng chung + danh sách bản ghi vừa tạo. */
export function QuickCreateProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [created, setCreated] = useState<QuickCreatedRecord[]>([]);
  const addCreated = useCallback((record: QuickCreatedRecord) => {
    setCreated((list) => (list.some((r) => r.kind === record.kind && r.id === record.id) ? list : [...list, record]));
  }, []);
  const host = useQuickCreateDialogHost(enabled, addCreated);
  const value = useMemo(
    () => ({ enabled, request: host.request, created, addCreated }),
    [enabled, host.request, created, addCreated],
  );

  return (
    <QuickCreateContext.Provider value={value}>
      {children}
      {host.element}
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate() {
  return useContext(QuickCreateContext);
}

/**
 * Hộp thoại "Tạo mới" riêng cho ô chọn nằm TRONG một hộp thoại khác: nơi gọi render `element`
 * bên trong cây của hộp thoại đó (ngoài thẻ `<form>` của mình — sự kiện submit của React lan theo
 * cây component), để hộp thoại mới là hộp thoại con và bấm vào nó không đóng hộp thoại cha.
 */
export function useLocalQuickCreate() {
  const { enabled, addCreated } = useQuickCreate();
  return useQuickCreateDialogHost(enabled, addCreated);
}

/**
 * Danh sách lựa chọn của server + bản ghi loại `kind` vừa tạo trong phiên (chưa có trong danh sách).
 * `toOption` trả null để loại bản ghi không thuộc danh sách này (vd. vật tư nhân công ở sổ vật tư);
 * truyền hàm ổn định (khai báo ngoài component hoặc useCallback) để không tính lại mỗi lần render.
 */
export function useOptionsWithCreated<T extends { id: number | string }>(
  kind: QuickCreateKind,
  base: readonly T[],
  toOption: (record: QuickCreatedRecord) => T | null,
): T[] {
  const { created } = useQuickCreate();
  return useMemo(() => {
    const ids = new Set(base.map((o) => String(o.id)));
    const extra: T[] = [];
    for (const record of created) {
      if (record.kind !== kind || ids.has(String(record.id))) continue;
      const option = toOption(record);
      if (option) extra.push(option);
    }
    return extra.length > 0 ? [...base, ...extra] : (base as T[]);
  }, [kind, base, created, toOption]);
}

/** Lựa chọn {id, name} — dạng dùng cho lưới và phần lớn ô chọn. */
export const toNamedOption = (record: QuickCreatedRecord) => ({ id: record.id, name: record.name });

/** Mục "+ Tạo mới…" cuối một `<select>` thường; không hiện khi người dùng không được tạo. */
export function QuickCreateOption({ label = QUICK_CREATE_OPTION_LABEL }: { label?: string }) {
  const { enabled } = useQuickCreate();
  return enabled ? <option value={QUICK_CREATE_VALUE}>{label}</option> : null;
}

/**
 * Cho `onChange` của một `<select>`: nếu người dùng chọn "+ Tạo mới…" thì mở hộp thoại, gọi
 * `onCreated` với bản ghi mới (hoặc `onCancel`), và trả true để nơi gọi bỏ qua giá trị sentinel.
 * `request` mặc định là hộp thoại ở layout; ô chọn trong hộp thoại truyền `useLocalQuickCreate().request`.
 */
export function useQuickCreatePick(request?: Request) {
  const { request: shared } = useQuickCreate();
  const open = request ?? shared;
  return useCallback(
    (
      value: string,
      kind: QuickCreateKind,
      onCreated: (record: QuickCreatedRecord) => void,
      opts?: QuickCreateRequestOptions & { onCancel?: () => void },
    ): boolean => {
      if (value !== QUICK_CREATE_VALUE) return false;
      void open(kind, opts).then((record) => (record ? onCreated(record) : opts?.onCancel?.()));
      return true;
    },
    [open],
  );
}
