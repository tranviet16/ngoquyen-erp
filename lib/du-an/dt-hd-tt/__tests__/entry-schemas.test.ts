import { describe, expect, it } from "vitest";
import {
  INVOICE_PATCH_KEYS, invoiceLineSchema, mergeInvoicePatch, mergeReceiptPatch, paymentSchema, readPatch, RECEIPT_PATCH_KEYS,
  receiptCreateSchema, receiptUpdateSchema, resolveAmount, resolveInvoiceAmounts, type InvoiceLineInput,
} from "../entry-schemas";
import { INVALID_DATE_MESSAGE, parseDateCell, parseNumberCell } from "../entry-cell-parse";

const invoice = { projectId: 4, supplierId: 7, invoiceNo: "00000232", itemName: "Bê tông M300", unit: "m³", qty: 10, unitPrice: 1_250_000 };

describe("sổ Hóa đơn — schema + tính tiền", () => {
  it("thành tiền trống → SL × đơn giá; VAT trống → thành tiền × VAT %", () => {
    const data = invoiceLineSchema.parse({ ...invoice, vatPct: 0.08 });
    const { amountVnd, vatVnd } = resolveInvoiceAmounts(data);
    expect(amountVnd.toFixed(2)).toBe("12500000.00");
    expect(vatVnd.toFixed(2)).toBe("1000000.00");
  });

  it("giữ số đã nhập tay (thành tiền, tiền VAT) thay vì tính lại", () => {
    const data = invoiceLineSchema.parse({ ...invoice, amountVnd: 12_499_999, vatPct: 0.08, vatVnd: 999_999 });
    const { amountVnd, vatVnd } = resolveInvoiceAmounts(data);
    expect(amountVnd.toNumber()).toBe(12_499_999);
    expect(vatVnd.toNumber()).toBe(999_999);
  });

  it("không có VAT % và tiền VAT → VAT = 0; thành tiền tính từ đơn giá đã làm tròn như khi lưu", () => {
    const data = invoiceLineSchema.parse({ ...invoice, qty: 3, unitPrice: 333.335 });
    expect(data.unitPrice).toBe(333.34);
    const { amountVnd, vatVnd } = resolveInvoiceAmounts(data);
    expect(amountVnd.toFixed(2)).toBe("1000.02");
    expect(vatVnd.toNumber()).toBe(0);
  });

  it("SL làm tròn 4 chữ số, VAT % làm tròn 4 chữ số trước khi tính tiền VAT", () => {
    const data = invoiceLineSchema.parse({ ...invoice, qty: 1.23456, unitPrice: 100, vatPct: 0.083333 });
    expect(data.qty).toBe(1.2346);
    expect(data.vatPct).toBe(0.0833);
    const { amountVnd, vatVnd } = resolveInvoiceAmounts(data);
    expect(amountVnd.toFixed(2)).toBe("123.46");
    expect(vatVnd.toFixed(2)).toBe("10.28"); // 123,46 × 0,0833 = 10,284…
  });

  it("SL × đơn giá vượt cột lưu → báo lỗi tiếng Việt, không để Postgres báo lỗi chung", () => {
    const data = invoiceLineSchema.parse({ ...invoice, qty: 1e12, unitPrice: 1e6 });
    expect(() => resolveInvoiceAmounts(data)).toThrow(/vượt giới hạn lưu/);
  });

  it("chuẩn hóa chữ: cắt khoảng trắng, ĐVT trống → '', ghi chú trống → null, ngày trống → null", () => {
    const data = invoiceLineSchema.parse({ ...invoice, invoiceNo: "  0001 ", unit: null, note: "  ", invoiceDate: null });
    expect(data.invoiceNo).toBe("0001");
    expect(data.unit).toBe("");
    expect(data.note).toBeNull();
    expect(data.invoiceDate).toBeNull();
  });

  it("từ chối: thiếu cả thành tiền lẫn SL × đơn giá, số HĐ trống, NCC không hợp lệ, ngày sai, VAT % > 100", () => {
    expect(invoiceLineSchema.safeParse({ ...invoice, qty: null }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, invoiceNo: "   " }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, supplierId: 0 }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, invoiceDate: "2026-02-30" }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, invoiceDate: "17/11/2026" }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, vatPct: 8 }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...invoice, amountVnd: Number.NaN }).success).toBe(false);
  });

  it("nhận ngày ISO có thật", () => {
    expect(invoiceLineSchema.parse({ ...invoice, invoiceDate: "2026-11-17" }).invoiceDate).toBe("2026-11-17");
  });
});

describe("sổ Thực tế nhập — đầu mối bắt buộc ở dòng mới", () => {
  const receipt = { projectId: 4, itemName: "Cát vàng", unit: "m3", qty: 2, unitPrice: 560_000 };

  it("dòng mới thiếu đầu mối bị từ chối; sửa dòng cũ chưa có đầu mối thì được", () => {
    expect(receiptCreateSchema.safeParse(receipt).success).toBe(false);
    expect(receiptCreateSchema.safeParse({ ...receipt, counterpartyId: 3 }).success).toBe(true);
    expect(receiptUpdateSchema.parse(receipt).counterpartyId).toBeNull();
  });

  it("thành tiền gồm VAT trống → KL × đơn giá", () => {
    expect(resolveAmount(receiptCreateSchema.parse({ ...receipt, counterpartyId: 3 })).toNumber()).toBe(1_120_000);
    expect(resolveAmount(receiptCreateSchema.parse({ ...receipt, counterpartyId: 3, amountVnd: 1_100_000 })).toNumber()).toBe(1_100_000);
    expect(receiptCreateSchema.safeParse({ ...receipt, counterpartyId: 3, unitPrice: null }).success).toBe(false);
  });
});

describe("sổ Chi thực tế", () => {
  const payment = { projectId: 4, content: "Tạm ứng tổ nề", section: "II" as const };

  it("CK / TM trống → 0, đầu mối / NCC trống → null", () => {
    const data = paymentSchema.parse({ ...payment, bankVnd: 5_000_000 });
    expect(data).toMatchObject({ bankVnd: 5_000_000, cashVnd: 0, counterpartyId: null, supplierId: null, date: null });
  });

  it("mục phải là I–IV, nội dung không trống", () => {
    expect(paymentSchema.safeParse({ ...payment, section: "V" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, section: "" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, content: " " }).success).toBe(false);
  });
});

describe("sửa một phần: gộp vào dòng đang lưu và tính lại tiền", () => {
  const stored: InvoiceLineInput = {
    projectId: 4, supplierId: 7, invoiceNo: "0001", invoiceDate: "2026-11-17", itemName: "Cát vàng", unit: "m3",
    qty: 10, unitPrice: 500_000, amountVnd: 5_000_000, vatPct: 0.08, vatVnd: 400_000, note: null,
  };
  const amounts = (input: InvoiceLineInput) => {
    const r = resolveInvoiceAmounts(invoiceLineSchema.parse(input));
    return { amount: r.amountVnd.toNumber(), vat: r.vatVnd.toNumber() };
  };

  it("hai lần sửa nối tiếp, mỗi lần một ô, không ghi đè nhau", () => {
    const afterQty = mergeInvoicePatch(stored, { qty: 12 }).input;
    const first = amounts(afterQty);
    expect(first).toEqual({ amount: 6_000_000, vat: 480_000 });
    const stored2 = { ...afterQty, amountVnd: first.amount, vatVnd: first.vat };
    const afterPrice = mergeInvoicePatch(stored2, { unitPrice: 520_000 }).input;
    expect(afterPrice.qty).toBe(12);
    expect(amounts(afterPrice)).toEqual({ amount: 6_240_000, vat: 499_200 });
  });

  it("đổi thành tiền trên dòng có VAT % → tính lại tiền VAT", () => {
    const { input, vatHint } = mergeInvoicePatch(stored, { amountVnd: 6_000_000 });
    expect(amounts(input)).toEqual({ amount: 6_000_000, vat: 480_000 });
    expect(vatHint).toBe(false);
  });

  it("xóa VAT % → tiền VAT = 0; đổi VAT % → tính lại", () => {
    expect(amounts(mergeInvoicePatch(stored, { vatPct: null }).input)).toEqual({ amount: 5_000_000, vat: 0 });
    expect(amounts(mergeInvoicePatch(stored, { vatPct: 0.1 }).input)).toEqual({ amount: 5_000_000, vat: 500_000 });
  });

  it("dòng không có VAT % (import chỉ có tiền VAT): đổi SL giữ tiền VAT và nhắc kiểm lại", () => {
    const noPct = { ...stored, vatPct: null, vatVnd: 390_000 };
    const { input, vatHint } = mergeInvoicePatch(noPct, { qty: 12 });
    expect(amounts(input)).toEqual({ amount: 6_000_000, vat: 390_000 });
    expect(vatHint).toBe(true);
  });

  it("tiền VAT gửi kèm thì giữ đúng số gửi; xóa SL thì thành tiền giữ nguyên", () => {
    expect(amounts(mergeInvoicePatch(stored, { vatPct: 0.1, vatVnd: 123 }).input)).toEqual({ amount: 5_000_000, vat: 123 });
    expect(amounts(mergeInvoicePatch(stored, { qty: null }).input)).toEqual({ amount: 5_000_000, vat: 400_000 });
  });

  it("thực tế nhập: đổi KL tính lại thành tiền; đổi ghi chú không đụng tiền", () => {
    const receipt = { projectId: 4, date: null, itemName: "Cát", unit: "m3", qty: 2, unitPrice: 560_000, amountVnd: 1_100_000, counterpartyId: 3, note: null };
    expect(resolveAmount(receiptUpdateSchema.parse(mergeReceiptPatch(receipt, { qty: 3 }))).toNumber()).toBe(1_680_000);
    expect(resolveAmount(receiptUpdateSchema.parse(mergeReceiptPatch(receipt, { note: "x" }))).toNumber()).toBe(1_100_000);
  });

  it("bản sửa chỉ nhận cột sửa được; undefined = không sửa", () => {
    expect(readPatch({ qty: 1, note: undefined }, INVOICE_PATCH_KEYS)).toEqual({ qty: 1 });
    expect(() => readPatch({ projectId: 9 }, INVOICE_PATCH_KEYS)).toThrow(/không sửa được/);
    expect(() => readPatch({ itemKey: "x" }, RECEIPT_PATCH_KEYS)).toThrow(/không sửa được/);
    expect(() => readPatch(null, INVOICE_PATCH_KEYS)).toThrow(/không hợp lệ/);
  });
});

describe("ô ngày / ô số của lưới", () => {
  it("ô trống = xóa; dd/mm/yyyy, yyyy-mm-dd, năm 2 chữ số đọc được", () => {
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("  ")).toBeNull();
    expect(parseDateCell("17/11/2026")).toBe("2026-11-17");
    expect(parseDateCell("7-1-26")).toBe("2026-01-07");
    expect(parseDateCell("2026-11-17")).toBe("2026-11-17");
  });

  it("chữ không phải ngày có thật → báo lỗi, không lưu thành trống", () => {
    for (const text of ["17/11", "17 11 2026", "1/13/2026", "31/02/2026", "abc"]) {
      expect(() => parseDateCell(text), text).toThrow(INVALID_DATE_MESSAGE);
    }
  });

  it("ô số: trống → null, chữ không phải số → báo lỗi", () => {
    expect(parseNumberCell("", "SL")).toBeNull();
    expect(parseNumberCell(null, "SL")).toBeNull();
    expect(parseNumberCell("1 200", "SL")).toBe(1200);
    expect(() => parseNumberCell("abc", "SL")).toThrow("SL không phải số");
  });
});
