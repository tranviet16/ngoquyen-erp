/**
 * Mục "+ Tạo mới…" trong dropdown của lưới: chỉ hiện ở cột có `onCreateOption` khi ô sửa được,
 * và giá trị sentinel không bao giờ thành giá trị lưu (kể cả khi dán).
 */
import { describe, expect, it } from "vitest";
import { buildCell, CREATE_OPTION_VALUE, isCreateOptionPick, parseCellValue } from "@/components/data-grid/cells";
import type { DataGridColumn } from "@/components/data-grid/types";

type Row = { id: number; partyId: number | null };

const options = [
  { id: 1, name: "Thép Hòa Phát" },
  { id: 2, name: "Xi măng" },
];

const column = (extra: Partial<DataGridColumn<Row>> = {}): DataGridColumn<Row> => ({
  id: "partyId",
  title: "NCC",
  kind: "select",
  options,
  ...extra,
});

const allowedValues = (col: DataGridColumn<Row>) => {
  const cell = buildCell<Row>({ id: 1, partyId: 1 }, col) as unknown as {
    data: { allowedValues: { value: string; label: string }[] };
  };
  return cell.data.allowedValues.map((v) => v.value);
};

const create = async () => null;

describe("lưới: mục Tạo mới trong dropdown", () => {
  it("chỉ thêm mục khi cột có onCreateOption và ô sửa được", () => {
    expect(allowedValues(column())).toEqual(["1", "2"]);
    expect(allowedValues(column({ onCreateOption: create }))).toEqual(["1", "2", CREATE_OPTION_VALUE]);
    expect(allowedValues(column({ onCreateOption: create, readonly: true }))).toEqual(["1", "2"]);
  });

  it("nhận ra lựa chọn Tạo mới từ payload dropdown hoặc giá trị thô", () => {
    const col = column({ onCreateOption: create });
    expect(isCreateOptionPick(col, { value: CREATE_OPTION_VALUE, allowedValues: [] })).toBe(true);
    expect(isCreateOptionPick(col, CREATE_OPTION_VALUE)).toBe(true);
    expect(isCreateOptionPick(col, { value: "1" })).toBe(false);
    expect(isCreateOptionPick(column(), CREATE_OPTION_VALUE)).toBe(false);
  });

  it("sentinel không bao giờ được parse thành khoá ngoại", () => {
    const col = column({ onCreateOption: create });
    expect(parseCellValue(col, { value: CREATE_OPTION_VALUE })).toBeNull();
    expect(parseCellValue(col, CREATE_OPTION_VALUE)).toBeNull();
    expect(parseCellValue(col, { value: "2" })).toBe(2);
  });
});
