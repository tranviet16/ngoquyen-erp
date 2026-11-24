/**
 * Ô chọn có tìm (NCC, đầu mối, Mã nhóm, Dòng DT): chữ gõ không dấu vẫn khớp nhãn có dấu (kể cả đ), không
 * phân biệt hoa thường và khoảng trắng, mỗi từ gõ phải có trong nhãn. Dấu câu giữ nguyên (không dùng
 * `normVtName`). Thêm một lần vẽ tĩnh để chắc ô chọn có móc kiểm thử và hiện nhãn của giá trị đang chọn.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesSearch, searchWords } from "@/components/ui/searchable-select-filter";

// Tên bịa cho test (repo công khai).
const LABELS = ["Thép Mẫu Số Một", "Đá Hộc Mẫu Hai", "Công ty Cát Đông Thử", "Gạch 4 lỗ 8x8x18", "Cửa nhôm 12/3", "Xi măng PCB40"];
const matching = (query: string) => LABELS.filter((l) => matchesSearch(l, query));

describe("matchesSearch", () => {
  it("ignores Vietnamese diacritics, đ and case", () => {
    expect(matching("thep")).toEqual(["Thép Mẫu Số Một"]);
    expect(matching("DA HOC")).toEqual(["Đá Hộc Mẫu Hai"]);
    expect(matching("dong thu")).toEqual(["Công ty Cát Đông Thử"]);
    expect(matching("đông")).toEqual(["Công ty Cát Đông Thử"]);
  });

  it("needs every typed word, in any order, and folds runs of spaces", () => {
    expect(matching("thu   cat")).toEqual(["Công ty Cát Đông Thử"]);
    expect(matching("mau")).toEqual(["Thép Mẫu Số Một", "Đá Hộc Mẫu Hai"]);
    expect(matching("thep hai")).toEqual([]);
    expect(matching("  xi   mang ")).toEqual(["Xi măng PCB40"]);
  });

  it("matches inside words and keeps punctuation as typed", () => {
    expect(matching("8x8")).toEqual(["Gạch 4 lỗ 8x8x18"]);
    expect(matching("12/3")).toEqual(["Cửa nhôm 12/3"]);
    expect(matching("123")).toEqual([]);
  });

  it("matches decomposed input the same as precomposed (Unikey and IME output differ)", () => {
    expect(matchesSearch("Thép Mẫu Số Một", "Thép")).toBe(true);
    expect(matchesSearch("Đá Hộc Mẫu Hai", "Đá")).toBe(true);
  });

  it("an empty or blank query matches every option", () => {
    expect(matching("")).toEqual(LABELS);
    expect(matching("   ")).toEqual(LABELS);
    expect(searchWords("  Đại   Ngàn ")).toEqual(["dai", "ngan"]);
    expect(searchWords("")).toEqual([]);
  });
});

describe("SearchableSelect static render", () => {
  const options = [{ value: "1", label: "Thép Mẫu Số Một" }, { value: "2", label: "Đá Hộc Mẫu Hai" }];
  const render = (value: string, emptyLabel?: string) =>
    renderToStaticMarkup(createElement(SearchableSelect, { name: "ncc", options, value, onChange: () => {}, emptyLabel, placeholder: "— Chọn NCC —" }));

  it("renders a combobox input with its test hooks and the selected label", () => {
    const html = render("2");
    expect(html).toContain('data-searchable-select="ncc"');
    expect(html).toContain('data-searchable-select-input="ncc"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="Đá Hộc Mẫu Hai"');
  });

  it("shows the placeholder (or the empty label) when nothing is chosen, and keeps the popup closed", () => {
    expect(render("")).toContain('placeholder="— Chọn NCC —"');
    expect(render("")).not.toContain("data-searchable-select-popup");
    expect(render("9")).not.toContain('value="Thép Mẫu Số Một"');
  });
});
