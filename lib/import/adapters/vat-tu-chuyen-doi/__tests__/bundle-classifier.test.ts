import { describe, expect, it } from "vitest";
import { classifyBundle } from "../bundle-classifier";
import { IssueSink } from "../parse-issues";
import { folderFromPath, supplierHintFromFileName } from "../source-names";
import { workbookBuffer } from "./fixture-builders";

const enc = (s: string) => new TextEncoder().encode(s);
const main = () => workbookBuffer({ "Cài Đặt": [[1]], "Nhập Liệu": [[1]], "Số Dư Ban Đầu": [[1]] });
const tracking = () => workbookBuffer({ SGV: [[null]], "Vật tư ngày": [[1]], "Đối chiếu công nợ": [[1]] });
const csv = () => enc("TT,Tên công ty\n,,Số,Ngày,Giá trị,,Tổng phát sinh\n");

describe("classifyBundle", () => {
  it("phân loại file tổng, CSV, file theo dõi; bỏ qua .claude/ và file lạ", () => {
    const sink = new IssueSink();
    const r = classifyBundle(
      [
        { path: "Quản Lý Công Nợ/Quản Lý Công Nợ Vật Tư.xlsx", buffer: main() },
        { path: "Quản Lý Công Nợ/Tong Cong No - Tổng công nợ đến 26.7.26.csv", buffer: csv() },
        { path: "Quản Lý Công Nợ\\Theo Dõi Vật Tư\\Trại Chuối\\Bê tông Hải Phòng.xlsx", buffer: tracking() },
        { path: "Quản Lý Công Nợ/.claude/agent-memory/MEMORY.md", buffer: enc("# memory") },
        { path: "Quản Lý Công Nợ/ghi chu.txt", buffer: enc("x") },
        { path: "Quản Lý Công Nợ/Theo Dõi Vật Tư/Trại Chuối/khac.xlsx", buffer: workbookBuffer({ Sheet1: [[1]] }) },
        { path: "Quản Lý Công Nợ/khac.csv", buffer: enc("a,b\n1,2") },
      ],
      sink,
    );
    expect(sink.blockingErrors).toEqual([]);
    expect(r.main?.path).toBe("Quản Lý Công Nợ/Quản Lý Công Nợ Vật Tư.xlsx");
    expect(r.csv?.path).toBe("Quản Lý Công Nợ/Tong Cong No - Tổng công nợ đến 26.7.26.csv");
    expect(r.tracking.map((t) => t.path)).toEqual(["Quản Lý Công Nợ/Theo Dõi Vật Tư/Trại Chuối/Bê tông Hải Phòng.xlsx"]);
    expect(r.skipped.map((s) => s.path).sort()).toEqual([
      "Quản Lý Công Nợ/.claude/agent-memory/MEMORY.md",
      "Quản Lý Công Nợ/Theo Dõi Vật Tư/Trại Chuối/khac.xlsx",
      "Quản Lý Công Nợ/ghi chu.txt",
      "Quản Lý Công Nợ/khac.csv",
    ]);
  });

  it("phải có đúng 1 file tổng và tối đa 1 CSV", () => {
    const none = new IssueSink();
    classifyBundle([{ path: "Theo Dõi Vật Tư/Trại Chuối/a.xlsx", buffer: tracking() }], none);
    expect(none.blockingErrors.map((e) => e.code)).toEqual(["bundle-main-count"]);

    const many = new IssueSink();
    const r = classifyBundle(
      [
        { path: "a.xlsx", buffer: main() },
        { path: "b.xlsx", buffer: main() },
        { path: "a.csv", buffer: csv() },
        { path: "b.csv", buffer: csv() },
      ],
      many,
    );
    expect(many.blockingErrors.map((e) => e.code)).toEqual(["bundle-main-count", "bundle-csv-count"]);
    expect(r.main).toBeNull();
    expect(r.csv).toBeNull();
  });

  it("file Excel hỏng là lỗi chặn", () => {
    const sink = new IssueSink();
    classifyBundle([{ path: "x/hong.xlsx", buffer: enc("not a zip") }, { path: "m.xlsx", buffer: main() }], sink);
    expect(sink.blockingErrors.map((e) => e.code)).toEqual(["xlsx-unreadable"]);
  });
});

describe("gợi ý NCC và công trình từ đường dẫn", () => {
  it.each([
    ["Theo Dõi Vật Tư/Dải Cây Xanh/Bê tông Hải Phòng - DCX.xlsx", "Bê tông Hải Phòng", "Dải Cây Xanh"],
    ["Theo Dõi Vật Tư/Mầm Non TC1/Thiết bị điện Việt Đức HP( MN).xlsx", "Thiết bị điện Việt Đức HP", "Mầm Non TC1"],
    ["Theo Dõi Vật Tư/Mầm Non TC2/Lộc Tài - MN2.xlsx", "Lộc Tài", "Mầm Non TC2"],
    ["Theo Dõi Vật Tư/Trại Chuối/Quang Minh cát,gạch hết 30.4.26.xlsx", "Quang Minh cát,gạch", "Trại Chuối"],
    ["Theo Dõi Vật Tư/Trại Chuối/Quang Minh cát,gạch đến 26.5.26.xlsx", "Quang Minh cát,gạch", "Trại Chuối"],
    ["Theo Dõi Vật Tư/Trại Chuối/Thép Hiệu Trần ( chú Hiếu ).xlsx", "Thép Hiệu Trần", "Trại Chuối"],
  ])("%s", (path, supplier, folder) => {
    expect(supplierHintFromFileName(path)).toBe(supplier);
    expect(folderFromPath(path)).toBe(folder);
  });
});
