import { describe, it, expect } from "vitest";
import type { DetailRow } from "@/lib/cong-no-vt/balance-report-service";
import {
  PIVOT_AMOUNT_KEYS,
  UNASSIGNED_PROJECT_LABEL,
  buildProjectPivot,
  parseProjectDebtQuery,
  pivotColumnMode,
  pivotColumns,
  zeroAmounts,
  type PivotAmounts,
  type ProjectPivot,
} from "@/lib/cong-no-vt/project-debt-pivot";

/** Dòng DetailRow như queryDetailReport trả: Cuối kỳ = Đầu kỳ + PS tăng − PS giảm cho TT và HĐ. */
function row(
  entity: [number, string],
  party: [number, string],
  project: [number, string] | null,
  tt: [number, number, number],
  hd: [number, number, number] = [0, 0, 0],
): DetailRow {
  return {
    entityId: entity[0],
    entityName: entity[1],
    partyId: party[0],
    partyName: party[1],
    projectId: project?.[0] ?? null,
    projectName: project?.[1] ?? null,
    openingTt: String(tt[0]),
    phatSinhTt: String(tt[1]),
    daTraTt: String(tt[2]),
    cuoiKyTt: String(tt[0] + tt[1] - tt[2]),
    openingHd: String(hd[0]),
    phatSinhHd: String(hd[1]),
    daTraHd: String(hd[2]),
    cuoiKyHd: String(hd[0] + hd[1] - hd[2]),
  };
}

const CTY_A: [number, string] = [1, "Cty A"];
const CTY_B: [number, string] = [2, "Cty B"];
const NAM_HUONG: [number, string] = [10, "Nam Hương"];
const QUANG_MINH: [number, string] = [20, "Quang Minh"];
const BE_TONG: [number, string] = [30, "Bê tông HP"];
const TRAI_CHUOI: [number, string] = [100, "Trại Chuối"];
const DCX: [number, string] = [200, "DCX"];

const ROWS: DetailRow[] = [
  row(CTY_A, NAM_HUONG, TRAI_CHUOI, [59_868_420, 17_000_000, 5_000_000], [50_000_000, 1_000_000, 0]),
  row(CTY_B, NAM_HUONG, DCX, [0, 3_000_000, 1_000_000], [0, 2_000_000, 2_000_000]),
  row(CTY_B, QUANG_MINH, DCX, [159_360_000, 20_000_000, 30_000_000], [150_000_000, 0, 30_000_000]),
  row(CTY_A, BE_TONG, TRAI_CHUOI, [480_583_111, 28_980_000, 0]),
  // Dữ liệu cũ: cùng cặp Bê tông × Trại Chuối nhưng ghi dưới Chủ thể khác → vẫn gộp một dòng con.
  row(CTY_B, BE_TONG, TRAI_CHUOI, [1_000, 0, 500]),
  // Phòng thủ: dòng chưa gán công trình.
  row(CTY_A, QUANG_MINH, null, [-2_000, 0, 0]),
];

function sum(list: PivotAmounts[]): PivotAmounts {
  const acc = zeroAmounts();
  for (const a of list) for (const k of PIVOT_AMOUNT_KEYS) acc[k] += a[k];
  return acc;
}

function allNodes(pivot: ProjectPivot): PivotAmounts[] {
  return [pivot.total, ...pivot.groups.flatMap((g) => [g.amounts, ...g.children.map((c) => c.amounts)])];
}

describe("buildProjectPivot", () => {
  it.each(["ncc", "cong-trinh"] as const)("Σ dòng con = tổng nhóm, Σ nhóm = tổng chung (%s)", (groupBy) => {
    const pivot = buildProjectPivot(ROWS, groupBy);
    for (const g of pivot.groups) {
      expect(sum(g.children.map((c) => c.amounts))).toEqual(g.amounts);
    }
    expect(sum(pivot.groups.map((g) => g.amounts))).toEqual(pivot.total);
  });

  it("hai chiều xoay có cùng tổng chung, bằng tổng các dòng đầu vào", () => {
    const byNcc = buildProjectPivot(ROWS, "ncc");
    const byProject = buildProjectPivot(ROWS, "cong-trinh");
    expect(byNcc.total).toEqual(byProject.total);
    expect(byNcc.total.openingTt).toBe(59_868_420 + 159_360_000 + 480_583_111 + 1_000 - 2_000);
    expect(byNcc.total.cuoiKyHd).toBe(51_000_000 + 0 + 120_000_000);
  });

  it.each(["ncc", "cong-trinh"] as const)("mọi nút: Đầu kỳ + PS tăng − PS giảm = Cuối kỳ (%s)", (groupBy) => {
    for (const a of allNodes(buildProjectPivot(ROWS, groupBy))) {
      expect(a.openingTt + a.phatSinhTt - a.daTraTt).toBe(a.cuoiKyTt);
      expect(a.openingHd + a.phatSinhHd - a.daTraHd).toBe(a.cuoiKyHd);
    }
  });

  it("chế độ Toàn bộ: chuyển sang + LH − Đã trả = Còn nợ ở mọi nút, theo đúng nhãn cột", () => {
    const cols = pivotColumns("cumulative");
    const key = (label: string, side: "tt" | "hd") => cols.find((c) => c.label === label && c.side === side)!.key;
    for (const side of ["tt", "hd"] as const) {
      const [carried, lh, paid, owed] = ["Số dư chuyển sang", "LH lũy kế", "Đã trả lũy kế", "Còn nợ"].map((l) =>
        key(l, side),
      );
      for (const a of allNodes(buildProjectPivot(ROWS, "cong-trinh"))) {
        expect(a[carried] + a[lh] - a[paid]).toBe(a[owed]);
      }
    }
  });

  it("nhóm NCC → công trình, sắp theo tên và gộp Chủ thể của cùng cặp", () => {
    const pivot = buildProjectPivot(ROWS, "ncc");
    expect(pivot.groups.map((g) => g.name)).toEqual(["Bê tông HP", "Nam Hương", "Quang Minh"]);
    const beTong = pivot.groups[0];
    expect(beTong.children).toHaveLength(1);
    expect(beTong.children[0]).toMatchObject({ key: "ct:100", id: 100, name: "Trại Chuối" });
    expect(beTong.children[0].amounts.openingTt).toBe(480_583_111 + 1_000);
    expect(beTong.children[0].amounts.cuoiKyTt).toBe(509_563_111 + 500);
  });

  it("nhóm công trình → NCC, đặt nhóm chưa gán công trình cuối cùng", () => {
    const pivot = buildProjectPivot(ROWS, "cong-trinh");
    expect(pivot.groups.map((g) => g.name)).toEqual(["DCX", "Trại Chuối", UNASSIGNED_PROJECT_LABEL]);
    const last = pivot.groups[2];
    expect(last).toMatchObject({ key: "ct:none", id: null });
    expect(last.children.map((c) => c.name)).toEqual(["Quang Minh"]);
    expect(pivot.groups[1].children.map((c) => c.name)).toEqual(["Bê tông HP", "Nam Hương"]);
  });

  it("dòng chưa gán công trình là dòng con cuối trong nhóm NCC", () => {
    const qm = buildProjectPivot(ROWS, "ncc").groups.find((g) => g.name === "Quang Minh")!;
    expect(qm.children.map((c) => c.name)).toEqual(["DCX", UNASSIGNED_PROJECT_LABEL]);
  });

  it("trả bảng rỗng với tổng 0 khi không có dòng", () => {
    expect(buildProjectPivot([], "ncc")).toEqual({ groupBy: "ncc", groups: [], total: zeroAmounts() });
  });

  it("ném lỗi khi số tiền không phải số nguyên an toàn", () => {
    const bad = { ...ROWS[0], phatSinhTt: "12.5" };
    expect(() => buildProjectPivot([bad], "ncc")).toThrow(/Số tiền không hợp lệ/);
    const huge = { ...ROWS[0], openingTt: "90071992547409930" };
    expect(() => buildProjectPivot([huge], "ncc")).toThrow(/vượt giới hạn/);
  });
});

describe("pivotColumns / pivotColumnMode", () => {
  it("cửa sổ có cận dưới dùng Đầu kỳ / PS tăng / PS giảm / Cuối kỳ cho TT rồi HĐ", () => {
    expect(pivotColumnMode("2026-01-01")).toBe("window");
    const cols = pivotColumns("window");
    expect(cols.map((c) => c.label)).toEqual([
      "Đầu kỳ", "PS tăng", "PS giảm", "Cuối kỳ", "Đầu kỳ", "PS tăng", "PS giảm", "Cuối kỳ",
    ]);
    expect(cols.map((c) => c.side)).toEqual(["tt", "tt", "tt", "tt", "hd", "hd", "hd", "hd"]);
    expect(cols.map((c) => c.key)).toEqual([...PIVOT_AMOUNT_KEYS]);
  });

  it("không cận dưới (Toàn bộ / Đến hết) dùng nhãn lũy kế", () => {
    expect(pivotColumnMode(null)).toBe("cumulative");
    expect(pivotColumnMode(undefined)).toBe("cumulative");
    expect(pivotColumns("cumulative").slice(0, 4).map((c) => c.label)).toEqual([
      "Số dư chuyển sang", "LH lũy kế", "Đã trả lũy kế", "Còn nợ",
    ]);
  });
});

describe("parseProjectDebtQuery", () => {
  it("nhận cửa sổ hợp lệ, bỏ trùng Chủ thể", () => {
    expect(
      parseProjectDebtQuery({ from: "2026-01-01", to: "2026-12-31", groupBy: "cong-trinh", entityIds: [2, 2, 1] }),
    ).toEqual({ from: "2026-01-01", to: "2026-12-31", groupBy: "cong-trinh", entityIds: [2, 1] });
    expect(parseProjectDebtQuery({ groupBy: "ncc" })).toEqual({ from: null, to: null, groupBy: "ncc", entityIds: [] });
  });

  it.each([
    [{ from: "2026-13-40", to: null, groupBy: "ncc" }, /YYYY-MM-DD/],
    [{ from: "2026-06-01", to: "2026-05-01", groupBy: "ncc" }, /Từ ngày/],
    [{ from: null, to: null, groupBy: "chu-the" }, /Kiểu nhóm/],
    [{ from: null, to: null }, /Kiểu nhóm/],
    [{ from: null, to: null, groupBy: "ncc", entityIds: ["1"] }, /Chủ thể/],
    [{ from: null, to: null, groupBy: "ncc", entityIds: [0] }, /Chủ thể/],
    [{ from: null, to: null, groupBy: "ncc", entityIds: "1" }, /Chủ thể/],
    [{ groupBy: "ncc", entityIds: Array.from({ length: 201 }, (_, i) => i + 1) }, /tối đa/],
    [null, /Tham số/],
    [[1], /Tham số/],
  ])("từ chối %j", (input, message) => {
    const r = parseProjectDebtQuery(input);
    expect("error" in r && r.error).toMatch(message);
  });
});
