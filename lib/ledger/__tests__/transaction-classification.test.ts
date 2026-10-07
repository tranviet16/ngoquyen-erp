import { describe, it, expect } from "vitest";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  DEBT_INCREASE_TYPES,
  PERIOD_LOCKED_TYPES,
  AUTO_GENERATED_GUARD,
  increaseSql,
  decreaseSql,
  typeInSql,
  isPeriodLockedType,
} from "@/lib/ledger/transaction-classification";

const text = (s: { sql: string }) => s.sql.replace(/\s+/g, " ");

describe("transaction-classification", () => {
  it("labels cover every type", () => {
    for (const t of TRANSACTION_TYPES) expect(TRANSACTION_TYPE_LABELS[t]).toBeTruthy();
  });

  it("thue_hd increases debt and is period-locked; dieu_chinh is not locked", () => {
    expect(DEBT_INCREASE_TYPES).toContain("thue_hd");
    expect(PERIOD_LOCKED_TYPES).toContain("thue_hd");
    expect(isPeriodLockedType("dieu_chinh")).toBe(false);
    expect(isPeriodLockedType("thue_hd")).toBe(true);
  });

  it("increaseSql includes thue_hd, decreaseSql does not", () => {
    expect(text(increaseSql("totalTt"))).toContain("'thue_hd'");
    expect(text(increaseSql("totalHd"))).toContain('"totalHd"');
    expect(text(decreaseSql("totalTt"))).not.toContain("'thue_hd'");
    expect(text(decreaseSql("totalTt"))).toContain("'thanh_toan'");
  });

  it("typeInSql renders an IN list and rejects empty / unknown types", () => {
    expect(text(typeInSql(DEBT_INCREASE_TYPES))).toBe(`"transactionType" IN ('lay_hang','thue_hd')`);
    expect(() => typeInSql([])).toThrow();
    expect(() => typeInSql(["bad" as never])).toThrow();
  });

  it("rejects non-whitelisted amount columns", () => {
    expect(() => increaseSql("totalTt; DROP" as never)).toThrow();
    expect(() => decreaseSql("amountTt" as never)).toThrow();
  });

  it("guards auto-generated rows", () => {
    expect(() => AUTO_GENERATED_GUARD.assertManualEditable({ paymentRoundItemId: 5 })).toThrow();
    expect(() => AUTO_GENERATED_GUARD.assertManualEditable({ deliveryId: 9 })).toThrow();
    expect(() => AUTO_GENERATED_GUARD.assertManualEditable({ paymentRoundItemId: null, deliveryId: null })).not.toThrow();
  });
});
