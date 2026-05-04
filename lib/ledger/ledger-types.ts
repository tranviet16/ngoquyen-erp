import { Prisma } from "@prisma/client";

export type LedgerType = "material" | "labor";
export type TransactionType = "lay_hang" | "thanh_toan" | "dieu_chinh";

export interface LedgerTransactionInput {
  date: string; // ISO date string
  transactionType: TransactionType;
  entityId: number;
  partyId: number;
  projectId?: number | null;
  itemId?: number | null;
  // TT
  amountTt: string; // Decimal string
  vatPctTt?: string; // Decimal string, default "0"
  // HĐ
  amountHd: string; // Decimal string
  vatPctHd?: string; // Decimal string, default "0"
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  content?: string | null;
  status?: string;
  note?: string | null;
}

export interface LedgerTransactionFilter {
  entityId?: number;
  partyId?: number;
  projectId?: number;
  dateFrom?: string;
  dateTo?: string;
  transactionType?: TransactionType;
  page?: number;
  pageSize?: number;
}

export interface SummaryRow {
  entityId: number;
  partyId: number;
  projectId: number | null;
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
  layHangTt: Prisma.Decimal;
  layHangHd: Prisma.Decimal;
  thanhToanTt: Prisma.Decimal;
  thanhToanHd: Prisma.Decimal;
  dieuChinhTt: Prisma.Decimal;
  dieuChinhHd: Prisma.Decimal;
  balanceTt: Prisma.Decimal;
  balanceHd: Prisma.Decimal;
}

export interface MonthlyReportRow {
  month: number;
  year: number;
  entityId: number;
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
  layHangTt: Prisma.Decimal;
  layHangHd: Prisma.Decimal;
  thanhToanTt: Prisma.Decimal;
  thanhToanHd: Prisma.Decimal;
  dieuChinhTt: Prisma.Decimal;
  dieuChinhHd: Prisma.Decimal;
  closingTt: Prisma.Decimal;
  closingHd: Prisma.Decimal;
}

export interface CurrentBalance {
  tt: Prisma.Decimal;
  hd: Prisma.Decimal;
}

export interface MatrixRow {
  partyId: number;
  partyName: string;
  // Keyed by entityId: { tt, hd }
  cells: Record<string, { tt: Prisma.Decimal; hd: Prisma.Decimal }>;
  totalTt: Prisma.Decimal;
  totalHd: Prisma.Decimal;
}

export interface OpeningBalanceInput {
  entityId: number;
  partyId: number;
  projectId?: number | null;
  balanceTt: string;
  balanceHd: string;
  asOfDate: string;
  note?: string | null;
}
