import { Prisma } from "@prisma/client";
import type { TransactionType } from "./transaction-classification";

export type { TransactionType };

export type LedgerType = "material" | "labor";

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
  transactionTypes?: readonly TransactionType[];
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

export interface MonthlyByPartyRow {
  partyId: number;
  partyName: string;
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
  layHangTt: Prisma.Decimal;
  layHangHd: Prisma.Decimal;
  thanhToanTt: Prisma.Decimal;
  thanhToanHd: Prisma.Decimal;
  closingTt: Prisma.Decimal;
  closingHd: Prisma.Decimal;
}

export interface CurrentBalance {
  tt: Prisma.Decimal;
  hd: Prisma.Decimal;
}

export interface MatrixCell {
  openTt: number;
  openHd: number;
  layTt: number;
  layHd: number;
  traTt: number;
  traHd: number;
  closeTt: number;
  closeHd: number;
}

export interface MatrixRow {
  partyId: number;
  partyName: string;
  // Keyed by entityId
  cells: Record<string, MatrixCell>;
  // Per-row totals across all entities (8 metrics)
  totals: MatrixCell;
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
