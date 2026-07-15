import { describe, expect, it } from "vitest";
import { resolveJournalCategoryId, suggestJournalLabel } from "@/lib/tai-chinh/journal-auto-label";

describe("suggestJournalLabel", () => {
  it("labels construction revenue from SOP-like content", () => {
    expect(suggestJournalLabel({ description: "Nộp tiền XD lô 123" })).toMatchObject({
      entryType: "thu",
      costBehavior: "variable",
      categoryName: "Thu nhập xây dựng",
    });
  });

  it("labels material expense", () => {
    expect(suggestJournalLabel({ description: "Trả tiền vật tư xi măng" })).toMatchObject({
      entryType: "chi",
      costBehavior: "variable",
      categoryName: "Chi phí vật tư",
    });
  });

  it("labels insurance income before generic insurance expense", () => {
    expect(suggestJournalLabel({ description: "Thu tiền BHXH tháng 12" })).toMatchObject({
      entryType: "thu",
      costBehavior: "fixed",
      categoryName: "Thu nộp bảo hiểm",
    });
  });

  it("labels salary expense as fixed", () => {
    expect(suggestJournalLabel({ description: "TT lương bảo vệ tháng 12" })).toMatchObject({
      entryType: "chi",
      costBehavior: "fixed",
      categoryName: "Chi phí lương",
    });
  });

  it("labels transfer when both accounts are present", () => {
    expect(suggestJournalLabel({
      description: "Điều chuyển nội bộ",
      fromAccountId: 1,
      toAccountId: 2,
    })).toMatchObject({
      entryType: "chuyen_khoan",
      costBehavior: "transfer",
      categoryName: null,
    });
  });

  it("labels workbook cash movement text as transfer", () => {
    expect(suggestJournalLabel({ description: "Thanh: Rút tiền từ NH Công thương HP" })).toMatchObject({
      entryType: "chuyen_khoan",
      costBehavior: "transfer",
      categoryName: null,
    });
  });

  it("labels rent income from workbook wording", () => {
    expect(suggestJournalLabel({ description: "Cửa hàng Vitchimart nộp tiền thuê VP T9/2025" })).toMatchObject({
      entryType: "thu",
      costBehavior: "fixed",
      categoryName: "Thu nhập cho thuê",
    });
  });

  it("labels guarantee fee reimbursement as fee collection", () => {
    expect(suggestJournalLabel({ description: "Nộp phí bảo lãnh Tạm ứng CT Cống hộp Tiên Lãng" })).toMatchObject({
      entryType: "thu",
      costBehavior: "variable",
      categoryName: "Thu hộ nộp phí",
    });
  });

  it("keeps workbook-provided fee collection category", () => {
    expect(suggestJournalLabel({
      description: "Nộp phí bảo lãnh Tạm ứng CT Cống hộp Tiên Lãng",
      entryTypeLabel: "Thu nhập biến đổi",
      categoryName: "Thu hộ nộp phí",
    })).toMatchObject({
      entryType: "thu",
      costBehavior: "variable",
      categoryName: "Thu hộ nộp phí",
    });
  });

  it("labels construction loan like workbook", () => {
    expect(suggestJournalLabel({ description: "Xuân: Vay tiền thi công - CT Cống hộp Tiên Lãng" })).toMatchObject({
      entryType: "chi",
      costBehavior: "variable",
      categoryName: "Vay thi công",
    });
  });

  it("honors workbook category when provided by import", () => {
    expect(suggestJournalLabel({
      description: "Một dòng có nhãn đã tính trong Excel",
      entryTypeLabel: "Chi phí cố định",
      categoryName: "Chi phí QLDN",
    })).toMatchObject({
      entryType: "chi",
      costBehavior: "fixed",
      categoryName: "Chi phí QLDN",
    });
  });
});

describe("resolveJournalCategoryId", () => {
  it("matches categories accent-insensitively", () => {
    expect(resolveJournalCategoryId("Chi phí vật tư", [{ id: 7, name: "Chi phi vat tu" }])).toBe(7);
  });
});
