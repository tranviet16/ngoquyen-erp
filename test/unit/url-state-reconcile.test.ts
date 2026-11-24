import { describe, expect, it } from "vitest";
import { nextLocation, reconcileUrlState, sameUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import type { GridFilters } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { ANH_XA_URL, DAU_MOI_COUNTERPARTY_URL, DAU_MOI_SUPPLIER_URL, HOA_DON_URL } from "@/lib/du-an/dt-hd-tt/screen-links";

const A: GridFilters = { supplierId: { kind: "equals", value: "1" } };
const B: GridFilters = { supplierId: { kind: "equals", value: "2" } };
const C: GridFilters = { invoiceNo: { kind: "text", value: "HĐ 9" } };

describe("reconcileUrlState", () => {
  it("ignores a refresh response that carries an older filter than the live URL", () => {
    // Người dùng vừa đổi A → B (URL đã ghi B); kết quả refresh gửi lúc URL còn A về sau.
    expect(reconcileUrlState(B, A, B)).toEqual({ state: B, changed: false });
  });

  it("adopts new server props only when they equal the live URL, and signals the selection clear", () => {
    // Điều hướng thật tới C: props mới = URL đang hiện.
    expect(reconcileUrlState(A, C, C)).toEqual({ state: C, changed: true });
  });

  it("does not signal a change when the adopted props equal the current state", () => {
    expect(reconcileUrlState(B, B, B)).toEqual({ state: B, changed: false });
    // Cùng nội dung, khác thứ tự khóa / đối tượng mới.
    const current: GridFilters = { ...A, ...C };
    const incoming: GridFilters = { invoiceNo: { kind: "text", value: "HĐ 9" }, supplierId: { kind: "equals", value: "1" } };
    expect(reconcileUrlState(current, incoming, { ...incoming })).toEqual({ state: current, changed: false });
  });

  it("keeps the newest filter through a burst of out-of-order refreshes", () => {
    // Người dùng đổi A → B → C (URL đang hiện là C); các refresh gửi lúc A, lúc B, lúc C về lần lượt.
    const live = C;
    let state: GridFilters = C;
    for (const incoming of [A, B, C]) state = reconcileUrlState(state, incoming, live).state;
    expect(state).toEqual(C);
  });
});

describe("sameUrlState", () => {
  it("compares content, not key order", () => {
    expect(sameUrlState({ tab: "hd", status: "chua_gan" }, { status: "chua_gan", tab: "hd" })).toBe(true);
    expect(sameUrlState({ tab: "hd" }, { tab: "tt" })).toBe(false);
  });
});

describe("codecs used by the page clients", () => {
  it("parse what they write, so state and URL never drift", () => {
    const filters: GridFilters = { ...B, mapping: { kind: "text", value: "chưa gán" } };
    expect(HOA_DON_URL.parse(`?${HOA_DON_URL.write(filters, "?filter.junk=1")}`)).toEqual(filters);
    const anhXa = { tab: "tt" as const, status: "thieu_he_so" as const, q: "Thép & co", key: "thep|kg" };
    expect(ANH_XA_URL.parse(`?${ANH_XA_URL.write(anhXa, "")}`)).toEqual(anhXa);
  });

  it("Đầu mối: each grid parses only its own columns from the shared URL", () => {
    const live = "?filter.actual=chua-chot&filter.counterpartyId=0&filter.name=x";
    expect(DAU_MOI_COUNTERPARTY_URL.parse(live)).toEqual({ name: { kind: "text", value: "x" }, actual: { kind: "equals", value: "chua-chot" } });
    expect(DAU_MOI_SUPPLIER_URL.parse(live)).toEqual({ counterpartyId: { kind: "equals", value: "0" } });
    // Lưới NCC bỏ lọc của nó: tham số của lưới đầu mối còn nguyên.
    const next = DAU_MOI_SUPPLIER_URL.write({}, live);
    expect(DAU_MOI_COUNTERPARTY_URL.parse(next)).toEqual(DAU_MOI_COUNTERPARTY_URL.parse(live));
    expect(DAU_MOI_SUPPLIER_URL.parse(next)).toEqual({});
  });
});

describe("nextLocation", () => {
  it("keeps the path and the hash, and skips a write when the query is unchanged", () => {
    expect(nextLocation("/du-an/4/dt-hd-tt/dau-moi", "?filter.name=x", "#ncc", "filter.counterpartyId=0")).toBe(
      "/du-an/4/dt-hd-tt/dau-moi?filter.counterpartyId=0#ncc",
    );
    expect(nextLocation("/p", "?a=1", "", "a=1")).toBeNull();
    expect(nextLocation("/p", "?a=1", "", "")).toBe("/p");
  });
});
