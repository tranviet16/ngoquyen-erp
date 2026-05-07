/**
 * Adapter: Quản lý Dự án Xây dựng (mẫu).xlsx
 * Target tables: projects, project_categories, project_estimates, project_transactions
 *
 * Strategy: 1 file = 1 project.
 *   - "Dự Toán" sheet → project_estimates (header row contains "Mã Item")
 *   - "Giao Dịch"  sheet → project_transactions (header row contains "Ngày")
 *   - Project code/name parsed from "Cài Đặt" sheet if present, else fallback default.
 * Idempotency: project matched by code; estimate dedup by (projectId, categoryId, itemCode).
 * Bulk insert via $executeRaw bypasses audit middleware (intentional historical migration).
 */

import * as XLSX from "xlsx";
import {
  parseExcelDate,
  num,
  normHeader,
  findHeaderRow,
  buildRowsFromMatrix,
  findLabeledValue,
} from "./excel-utils";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

function findSheet(wb: XLSX.WorkBook, ...hints: string[]): string | null {
  const want = hints.map((h) => normHeader(h));
  for (const n of wb.SheetNames) {
    const norm = normHeader(n);
    for (const w of want) if (norm.includes(w)) return n;
  }
  return null;
}

function readMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
}

const TX_TYPE_MAP: Record<string, string> = {
  "giao vat lieu": "lay_hang",
  "lay hang": "lay_hang",
  "nhan cong": "nhan_cong",
  "may moc": "may_moc",
  "tra tien": "tra_tien",
  "thanh toan": "tra_tien",
  "tra hang": "tra_hang",
};

export const DuAnXayDungAdapter: ImportAdapter = {
  name: "du-an-xay-dung",
  label: "Quản lý Dự án Xây dựng",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    let rowIdx = 0;

    // Project meta — try Cài Đặt / README sheet, else default.
    let projectCode = "DA001";
    let projectName = "Dự án nhập từ Excel";
    let ownerInvestor: string | undefined;
    let contractValue = 0;

    const settingsSheet = findSheet(wb, "cai dat", "setting", "readme");
    if (settingsSheet) {
      const matrix = readMatrix(wb.Sheets[settingsSheet]);
      projectCode =
        findLabeledValue(matrix, "ma da") ??
        findLabeledValue(matrix, "ma du an") ??
        findLabeledValue(matrix, "code") ??
        projectCode;
      projectName =
        findLabeledValue(matrix, "ten du an") ??
        findLabeledValue(matrix, "du an") ??
        projectName;
      ownerInvestor = findLabeledValue(matrix, "chu dau tu") ?? undefined;
      const cvStr = findLabeledValue(matrix, "gia tri hd") ?? findLabeledValue(matrix, "gia tri hop dong");
      if (cvStr) contractValue = num(cvStr);
    }

    rows.push({
      rowIndex: rowIdx++,
      data: {
        _type: "project",
        code: projectCode,
        name: projectName,
        ownerInvestor,
        contractValue,
      },
    });

    // Estimate sheet — prefer "Dự Toán" (not adjusted) for parse stability.
    const estimateSheetName = wb.SheetNames.find((n) => {
      const norm = normHeader(n);
      return norm.includes("du toan") && !norm.includes("dieu chinh");
    });
    if (estimateSheetName) {
      const matrix = readMatrix(wb.Sheets[estimateSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ma item", "ma vt"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const itemCode = String(r["Mã Item"] ?? r["Mã VT"] ?? "").trim();
          if (!itemCode) continue;
          const categoryCode = String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "HM01").trim();
          if (categoryCode.toLowerCase().startsWith("cộng")) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "estimate",
              categoryCode,
              categoryName: categoryCode,
              itemCode,
              itemName: String(
                r["Tên Hạng Mục / Vật Tư"] ?? r["Tên VT"] ?? r["Tên Vật Tư"] ?? itemCode,
              ).trim(),
              unit: String(r["ĐVT"] ?? "m3").trim(),
              qty: num(r["Khối Lượng DT"] ?? r["KL"] ?? 0),
              unitPrice: num(r["Đơn Giá (VNĐ)"] ?? r["Đơn Giá"] ?? 0),
            },
          });
        }
      }
    }

    // Transaction sheet — "Giao Dịch"
    const txSheetName = findSheet(wb, "giao dich");
    if (txSheetName) {
      const matrix = readMatrix(wb.Sheets[txSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ngay"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const dateVal = parseExcelDate(r["Ngày"] ?? null);
          if (!dateVal) continue;
          const loaiGd = normHeader(r["Loại Giao Dịch"] ?? r["Loại"] ?? "");
          const txType = TX_TYPE_MAP[loaiGd];
          if (!txType) {
            console.warn(`[du-an-xay-dung] Unknown transaction type "${loaiGd}" — skipping row ${rowIdx}`);
            continue;
          }
          const itemCode = String(r["Mã Item"] ?? r["Mã VT"] ?? "").trim();
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "transaction",
              date: dateVal,
              transactionType: txType,
              categoryCode: String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "HM01").trim(),
              itemCode,
              itemName: String(r["Tên Hàng Hóa / Dịch Vụ"] ?? r["Tên VT"] ?? itemCode).trim(),
              partyName: String(r["Nhà CC / Nhà Thầu"] ?? r["NCC/Đội"] ?? "").trim() || undefined,
              qty: num(r["Số Lượng"] ?? r["KL"] ?? 0),
              unit: String(r["ĐVT"] ?? "").trim(),
              unitPriceTt: num(r["Đơn Giá Thực Tế (VNĐ)"] ?? r["ĐG TT"] ?? 0),
              unitPriceHd: num(r["Đơn Giá HĐ (VNĐ)"] ?? r["ĐG HĐ"] ?? 0),
              amountTt: num(r["Thanh Toán Thực Tế (VNĐ)"] ?? 0),
              amountHd: num(r["Thanh Toán HĐ (VNĐ)"] ?? 0),
              invoiceNo: String(r["Số HĐ"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Tiến Độ → project_schedules ──
    const scheduleSheetName = findSheet(wb, "tien do");
    if (scheduleSheetName) {
      const matrix = readMatrix(wb.Sheets[scheduleSheetName]);
      const headerIdx = findHeaderRow(matrix, ["hang muc", "cong viec"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const taskName = String(r["Công Việc"] ?? r["Công việc"] ?? "").trim();
          const categoryCode = String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "").trim();
          if (!taskName || !categoryCode) continue;
          const planStart = parseExcelDate(r["Ngày BĐ KH"] ?? r["Ngày BD KH"]);
          const planEnd = parseExcelDate(r["Ngày HT KH"]);
          if (!planStart || !planEnd) continue;
          const pctRaw = String(r["% Hoàn Thành"] ?? r["% Hoàn thành"] ?? "0").replace(/[^\d.]/g, "");
          const pct = (parseFloat(pctRaw) || 0) / 100;
          const statusVi = normHeader(r["Trạng Thái"] ?? r["Trạng thái"] ?? "");
          const status = statusVi.includes("hoan thanh")
            ? "done"
            : statusVi.includes("dang")
              ? "in_progress"
              : statusVi.includes("tre")
                ? "delayed"
                : "pending";
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "schedule",
              categoryCode,
              taskName,
              planStart,
              planEnd,
              actualStart: parseExcelDate(r["Ngày BĐ TT"] ?? r["Ngày BD TT"]),
              actualEnd: parseExcelDate(r["Ngày HT TT"]),
              pctComplete: pct,
              status,
              note: String(r["Ghi Chú"] ?? r["Ghi chú"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Nghiệm Thu → project_acceptances ──
    const acceptSheetName = findSheet(wb, "nghiem thu");
    if (acceptSheetName) {
      const matrix = readMatrix(wb.Sheets[acceptSheetName]);
      const headerIdx = findHeaderRow(matrix, ["hang muc kiem tra", "kiem tra"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const checkItem = String(r["Hạng Mục Kiểm Tra"] ?? r["Hạng mục Kiểm tra"] ?? "").trim();
          const categoryCode = String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "").trim();
          if (!checkItem || !categoryCode) continue;
          const resultVi = normHeader(r["Kết Quả"] ?? r["Kết quả"] ?? "");
          const result = resultVi.includes("dat")
            ? "pass"
            : resultVi.includes("sua") || resultVi.includes("loi")
              ? "partial"
              : resultVi.includes("khong")
                ? "fail"
                : null;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "acceptance",
              categoryCode,
              checkItem,
              planEnd: parseExcelDate(r["Ngày HT Kế Hoạch"] ?? r["Ngày KH"]),
              actualEnd: parseExcelDate(r["Ngày HT Thực Tế"] ?? r["Ngày TT"]),
              inspector: String(r["Cán Bộ Kiểm Tra"] ?? "").trim() || undefined,
              result,
              defectCount: Math.round(num(r["Điểm Lỗi"] ?? 0)),
              fixRequest: String(r["Yêu Cầu Sửa Chữa"] ?? "").trim() || undefined,
              acceptedAt: parseExcelDate(r["Ngày Nghiệm Thu OK"] ?? r["Ngày OK"]),
              amountCdtVnd: num(r["SL NT CĐT (VNĐ)"] ?? r["SL NT CDT"] ?? 0),
              amountInternalVnd: num(r["SL NT Nội Bộ (VNĐ)"] ?? r["SL NT Noi Bo"] ?? 0),
              acceptanceBatch: String(r["Đợt NT"] ?? "").trim() || undefined,
              note: String(r["Ghi Chú"] ?? r["Ghi chú"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Hợp Đồng → project_contracts ──
    const contractSheetName = findSheet(wb, "hop dong");
    if (contractSheetName) {
      const matrix = readMatrix(wb.Sheets[contractSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ten tai lieu", "tai lieu"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const docName = String(r["Tên Tài Liệu"] ?? r["Tên tài liệu"] ?? "").trim();
          if (!docName) continue;
          const docTypeVi = normHeader(r["Loại"] ?? "");
          const docType = docTypeVi.includes("hop dong")
            ? "contract"
            : docTypeVi.includes("giay phep")
              ? "license"
              : docTypeVi.includes("bao hiem")
                ? "insurance"
                : docTypeVi.includes("nghiem thu")
                  ? "acceptance"
                  : "other";
          const valueRaw = r["Giá Trị HĐ (VNĐ)"] ?? r["Giá Trị HĐ"];
          const value = valueRaw && String(valueRaw).trim() !== "—" ? num(valueRaw) : null;
          const statusVi = normHeader(r["Trạng Thái"] ?? "");
          const status = statusVi.includes("het han")
            ? "expired"
            : statusVi.includes("cham dut")
              ? "terminated"
              : statusVi.includes("cho")
                ? "pending"
                : "active";
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "contract",
              docName,
              docType,
              partyName: String(r["Đối Tác / Bên"] ?? r["Đối tác"] ?? "").trim() || undefined,
              valueVnd: value,
              signedDate: parseExcelDate(r["Ngày Ký"]),
              expiryDate: parseExcelDate(r["Ngày HH / Deadline"] ?? r["Ngày HH"]),
              status,
              storage: String(r["Nơi Lưu Trữ"] ?? "").trim() || undefined,
              note: String(r["Ghi Chú"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Phát Sinh → project_change_orders ──
    const changeSheetName = findSheet(wb, "phat sinh");
    if (changeSheetName) {
      const matrix = readMatrix(wb.Sheets[changeSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ma thay doi", "mo ta thay doi"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const coCode = String(r["Mã Thay Đổi"] ?? "").trim();
          const date = parseExcelDate(r["Ngày"]);
          if (!coCode || !date) continue;
          const statusVi = normHeader(r["Trạng Thái"] ?? "");
          const status = statusVi.includes("duyet") && !statusVi.includes("dang")
            ? "approved"
            : statusVi.includes("tu choi")
              ? "rejected"
              : "pending";
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "change-order",
              date,
              coCode,
              description: String(r["Mô Tả Thay Đổi"] ?? r["Mô tả"] ?? "").trim(),
              reason: String(r["Lý Do"] ?? "").trim() || undefined,
              categoryCode: String(r["Hạng Mục LQ"] ?? "").trim() || undefined,
              itemCode: String(r["Mã Item LQ"] ?? "").trim() || undefined,
              costImpactVnd: num(r["Tác Động Chi Phí (VNĐ)"] ?? r["Tác Động Chi Phí"] ?? 0),
              scheduleImpactDays: Math.round(num(r["Tác Động TĐ (ngày)"] ?? r["Tác Động TĐ"] ?? 0)),
              approvedBy: String(r["Người Duyệt"] ?? "").trim() || undefined,
              status,
              newItemName: String(r["Tên Hạng Mục Phát Sinh"] ?? "").trim() || undefined,
              newUnit: String(r["ĐVT"] ?? "").trim() || undefined,
              newQty: r["Khối Lượng PS"] ? num(r["Khối Lượng PS"]) : null,
              note: String(r["Ghi Chú"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Dòng Tiền 3 Bên → project_3way_cashflows ──
    const cashflowSheetName = findSheet(wb, "dong tien 3 ben", "dong tien");
    if (cashflowSheetName) {
      const matrix = readMatrix(wb.Sheets[cashflowSheetName]);
      const headerIdx = findHeaderRow(matrix, ["chieu gd", "phan loai"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const date = parseExcelDate(r["Ngày"]);
          if (!date) continue;
          const dirVi = normHeader(r["Chiều GD"] ?? "");
          const flowDirection = dirVi.includes("cdt") && dirVi.includes("cong ty")
            ? dirVi.includes("→") || dirVi.startsWith("cdt")
              ? "cdt_to_cty"
              : "cty_to_cdt"
            : dirVi.includes("cong ty") && dirVi.includes("doi")
              ? dirVi.startsWith("cong ty")
                ? "cty_to_doi"
                : "doi_to_cty"
              : "other";
          const catVi = normHeader(r["Phân Loại"] ?? "");
          const category = catVi.includes("tam ung")
            ? "tam_ung"
            : catVi.includes("nop")
              ? "nop_lai"
              : catVi.includes("hoan")
                ? "hoan_ung"
                : "thanh_toan";
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "cashflow",
              date,
              flowDirection,
              category,
              payerName: String(r["Bên Chi"] ?? "").trim(),
              payeeName: String(r["Bên Nhận"] ?? "").trim(),
              amountVnd: num(r["Số Tiền (VNĐ)"] ?? r["Số Tiền"] ?? 0),
              batch: String(r["Đợt / Số CT"] ?? r["Đợt"] ?? "").trim() || undefined,
              refDoc: String(r["Tham Chiếu"] ?? "").trim() || undefined,
              note: String(r["Ghi Chú"] ?? r["Ghi chú"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    // ── Công Nợ → project_supplier_debt_snapshots ──
    const debtSheetName = findSheet(wb, "cong no");
    if (debtSheetName) {
      const matrix = readMatrix(wb.Sheets[debtSheetName]);
      const headerIdx = findHeaderRow(matrix, ["nha cc", "nha thau"]);
      if (headerIdx >= 0) {
        // Resolve column indices positionally — sheet has duplicated headers
        // (Lấy Hàng / Đã TT / Còn Nợ appear twice: HĐ pair first, TT pair second).
        // buildRowsFromMatrix dedupes by overwriting, so we read the matrix directly.
        const headerCells = (matrix[headerIdx] || []).map((h) =>
          String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
        );
        const findAll = (key: string): number[] => {
          const k = key.toLowerCase();
          const idxs: number[] = [];
          headerCells.forEach((h, i) => {
            if (h === k) idxs.push(i);
          });
          return idxs;
        };
        const findFirst = (...keys: string[]): number => {
          for (const k of keys) {
            const idx = headerCells.findIndex((h) => h === k.toLowerCase());
            if (idx >= 0) return idx;
          }
          return -1;
        };
        const layHangCols = findAll("lấy hàng"); // [HĐ, TT]
        const daTtCols = findAll("đã tt"); // [HĐ, TT]
        const conNoCols = findAll("còn nợ"); // [HĐ, TT]
        const cSupplier = findFirst("nhà cc / nhà thầu", "nhà cc");
        const cItem = findFirst("tên hàng / dv", "tên hàng");
        const cQty = findFirst("sl");
        const cUnit = findFirst("đvt");
        const cMa = findFirst("mã");

        const colHd = {
          taken: layHangCols[0] ?? -1,
          paid: daTtCols[0] ?? -1,
          balance: conNoCols[0] ?? -1,
        };
        const colTt = {
          taken: layHangCols[1] ?? -1,
          paid: daTtCols[1] ?? -1,
          balance: conNoCols[1] ?? -1,
        };

        const safeNum = (row: unknown[], col: number): number =>
          col >= 0 ? num(row[col] ?? 0) : 0;
        const safeStr = (row: unknown[], col: number): string =>
          col >= 0 ? String(row[col] ?? "").trim() : "";

        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const row = matrix[i] || [];
          if (row.every((c) => c == null || c === "")) continue;
          const supplierName = safeStr(row, cSupplier);
          if (!supplierName || supplierName.includes("TỔNG") || supplierName.startsWith("🔹"))
            continue;
          const itemName = safeStr(row, cItem);
          const amountTakenHd = safeNum(row, colHd.taken);
          const amountPaidHd = safeNum(row, colHd.paid);
          const balanceHd = safeNum(row, colHd.balance);
          const amountTaken = safeNum(row, colTt.taken);
          const amountPaid = safeNum(row, colTt.paid);
          const balance = safeNum(row, colTt.balance);
          if (
            amountTaken === 0 && amountPaid === 0 && balance === 0 &&
            amountTakenHd === 0 && amountPaidHd === 0 && balanceHd === 0
          )
            continue;
          const qtyVal = cQty >= 0 ? row[cQty] : null;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "debt-snapshot",
              supplierName,
              itemName: itemName || undefined,
              qty: qtyVal != null && qtyVal !== "" ? num(qtyVal) : null,
              unit: safeStr(row, cUnit) || undefined,
              amountTaken,
              amountPaid,
              balance,
              amountTakenHd,
              amountPaidHd,
              balanceHd,
              note: safeStr(row, cMa) || undefined,
            },
          });
        }
      }
    }

    return { rows, conflicts: [], meta: { sheetCount: wb.SheetNames.length, projectCode, projectName } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data._type === "estimate" && !row.data.itemCode) {
        errors.push({ rowIndex: row.rowIndex, field: "itemCode", message: "Mã vật tư rỗng" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, _mapping, tx, importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    type Tx = typeof import("@/lib/prisma")["prisma"];
    const db = tx as Tx;

    const projectRow = data.rows.find((r) => r.data._type === "project");
    if (!projectRow) {
      return {
        rowsTotal: data.rows.length,
        rowsImported: 0,
        rowsSkipped: data.rows.length,
        errors: [{ rowIndex: 0, message: "Không tìm thấy thông tin dự án" }],
      };
    }

    const projectCode = String(projectRow.data.code ?? "DA001");
    let project = await db.project.findFirst({ where: { code: projectCode, deletedAt: null } });
    if (!project) {
      project = await db.project.create({
        data: {
          code: projectCode,
          name: String(projectRow.data.name ?? "Dự án nhập"),
          ownerInvestor: projectRow.data.ownerInvestor as string | undefined,
          contractValue: projectRow.data.contractValue
            ? String(projectRow.data.contractValue)
            : undefined,
        },
      });
      imported++;
    } else {
      skipped++;
    }
    const projectId = project.id;

    const catCache = new Map<string, number>();
    async function getOrCreateCategory(code: string, name: string): Promise<number> {
      if (catCache.has(code)) return catCache.get(code)!;
      const existing = await db.projectCategory.findFirst({
        where: { projectId, code, deletedAt: null },
      });
      if (existing) {
        catCache.set(code, existing.id);
        return existing.id;
      }
      const created = await db.projectCategory.create({
        data: { projectId, code, name, sortOrder: catCache.size },
      });
      catCache.set(code, created.id);
      imported++;
      return created.id;
    }

    for (const row of data.rows.filter((r) => r.data._type === "estimate")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, String(row.data.categoryName ?? catCode));
        const itemCode = String(row.data.itemCode ?? "");
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM project_estimates
          WHERE "projectId" = ${projectId} AND "categoryId" = ${categoryId}
            AND "itemCode" = ${itemCode} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const qty = Number(row.data.qty ?? 0);
        const unitPrice = Number(row.data.unitPrice ?? 0);
        const totalVnd = qty * unitPrice;

        await db.$executeRaw`
          INSERT INTO project_estimates
            ("projectId", "categoryId", "itemCode", "itemName", unit, qty, "unitPrice", "totalVnd", "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${categoryId}, ${itemCode}, ${String(row.data.itemName ?? itemCode)},
             ${String(row.data.unit ?? "")}, ${qty}, ${unitPrice}, ${totalVnd},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    for (const row of data.rows.filter((r) => r.data._type === "transaction")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, catCode);
        const date = row.data.date as Date;
        const itemCode = String(row.data.itemCode ?? "");
        const qty = Number(row.data.qty ?? 0);
        const unitPriceTt = Number(row.data.unitPriceTt ?? 0);
        const unitPriceHd = Number(row.data.unitPriceHd ?? 0);
        const amountTt = row.data.amountTt ? Number(row.data.amountTt) : qty * unitPriceTt;
        const amountHd = row.data.amountHd ? Number(row.data.amountHd) : qty * unitPriceHd;

        await db.$executeRaw`
          INSERT INTO project_transactions
            ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName",
             "partyName", qty, unit, "unitPriceTt", "unitPriceHd",
             "amountTt", "amountHd", "invoiceNo", status, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${date}, ${String(row.data.transactionType ?? "lay_hang")}, ${categoryId}, ${itemCode},
             ${String(row.data.itemName ?? itemCode)},
             ${row.data.partyName ? String(row.data.partyName) : null},
             ${qty}, ${String(row.data.unit ?? "")}, ${unitPriceTt}, ${unitPriceHd},
             ${amountTt}, ${amountHd},
             ${row.data.invoiceNo ? String(row.data.invoiceNo) : null},
             'approved', ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── Schedules ──
    for (const row of data.rows.filter((r) => r.data._type === "schedule")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, catCode);
        await db.$executeRaw`
          INSERT INTO project_schedules
            ("projectId", "categoryId", "taskName", "planStart", "planEnd",
             "actualStart", "actualEnd", "pctComplete", status, note,
             "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${categoryId}, ${String(row.data.taskName ?? "")},
             ${row.data.planStart as Date}, ${row.data.planEnd as Date},
             ${(row.data.actualStart as Date) ?? null}, ${(row.data.actualEnd as Date) ?? null},
             ${Number(row.data.pctComplete ?? 0)}, ${String(row.data.status ?? "pending")},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── Acceptances ──
    for (const row of data.rows.filter((r) => r.data._type === "acceptance")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, catCode);
        await db.$executeRaw`
          INSERT INTO project_acceptances
            ("projectId", "categoryId", "checkItem", "planEnd", "actualEnd",
             inspector, result, "defectCount", "fixRequest", "acceptedAt",
             "amountCdtVnd", "amountInternalVnd", "acceptanceBatch", note,
             "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${categoryId}, ${String(row.data.checkItem ?? "")},
             ${(row.data.planEnd as Date) ?? null}, ${(row.data.actualEnd as Date) ?? null},
             ${row.data.inspector ? String(row.data.inspector) : null},
             ${row.data.result ? String(row.data.result) : null},
             ${Number(row.data.defectCount ?? 0)},
             ${row.data.fixRequest ? String(row.data.fixRequest) : null},
             ${(row.data.acceptedAt as Date) ?? null},
             ${Number(row.data.amountCdtVnd ?? 0)}, ${Number(row.data.amountInternalVnd ?? 0)},
             ${row.data.acceptanceBatch ? String(row.data.acceptanceBatch) : null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── Contracts ──
    for (const row of data.rows.filter((r) => r.data._type === "contract")) {
      try {
        await db.$executeRaw`
          INSERT INTO project_contracts
            ("projectId", "docName", "docType", "partyName", "valueVnd", "signedDate",
             "expiryDate", status, storage, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${String(row.data.docName ?? "")}, ${String(row.data.docType ?? "other")},
             ${row.data.partyName ? String(row.data.partyName) : null},
             ${row.data.valueVnd ? Number(row.data.valueVnd) : null},
             ${(row.data.signedDate as Date) ?? null}, ${(row.data.expiryDate as Date) ?? null},
             ${String(row.data.status ?? "active")},
             ${row.data.storage ? String(row.data.storage) : null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── Change Orders ──
    for (const row of data.rows.filter((r) => r.data._type === "change-order")) {
      try {
        let catId: number | null = null;
        if (row.data.categoryCode) {
          catId = await getOrCreateCategory(String(row.data.categoryCode), String(row.data.categoryCode));
        }
        await db.$executeRaw`
          INSERT INTO project_change_orders
            ("projectId", date, "coCode", description, reason, "categoryId", "itemCode",
             "costImpactVnd", "scheduleImpactDays", "approvedBy", status,
             "newItemName", "newUnit", "newQty", note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${row.data.date as Date}, ${String(row.data.coCode ?? "")},
             ${String(row.data.description ?? "")},
             ${row.data.reason ? String(row.data.reason) : null},
             ${catId}, ${row.data.itemCode ? String(row.data.itemCode) : null},
             ${Number(row.data.costImpactVnd ?? 0)}, ${Number(row.data.scheduleImpactDays ?? 0)},
             ${row.data.approvedBy ? String(row.data.approvedBy) : null},
             ${String(row.data.status ?? "pending")},
             ${row.data.newItemName ? String(row.data.newItemName) : null},
             ${row.data.newUnit ? String(row.data.newUnit) : null},
             ${row.data.newQty != null ? Number(row.data.newQty) : null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── 3-Way Cashflows ──
    for (const row of data.rows.filter((r) => r.data._type === "cashflow")) {
      try {
        await db.$executeRaw`
          INSERT INTO project_3way_cashflows
            ("projectId", date, "flowDirection", category, "payerName", "payeeName",
             "amountVnd", batch, "refDoc", note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${row.data.date as Date},
             ${String(row.data.flowDirection ?? "other")}, ${String(row.data.category ?? "thanh_toan")},
             ${String(row.data.payerName ?? "")}, ${String(row.data.payeeName ?? "")},
             ${Number(row.data.amountVnd ?? 0)},
             ${row.data.batch ? String(row.data.batch) : null},
             ${row.data.refDoc ? String(row.data.refDoc) : null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // ── Supplier debt snapshots ──
    for (const row of data.rows.filter((r) => r.data._type === "debt-snapshot")) {
      try {
        await db.$executeRaw`
          INSERT INTO project_supplier_debt_snapshots
            ("projectId", "supplierName", "itemName", qty, unit, "unitPrice",
             "amountTaken", "amountPaid", balance,
             "amountTakenHd", "amountPaidHd", "balanceHd",
             "asOfDate", note,
             "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${String(row.data.supplierName ?? "")},
             ${row.data.itemName ? String(row.data.itemName) : null},
             ${row.data.qty != null ? Number(row.data.qty) : null},
             ${row.data.unit ? String(row.data.unit) : null},
             ${null},
             ${row.data.amountTaken != null ? Number(row.data.amountTaken) : null},
             ${row.data.amountPaid != null ? Number(row.data.amountPaid) : null},
             ${row.data.balance != null ? Number(row.data.balance) : null},
             ${row.data.amountTakenHd != null ? Number(row.data.amountTakenHd) : null},
             ${row.data.amountPaidHd != null ? Number(row.data.amountPaidHd) : null},
             ${row.data.balanceHd != null ? Number(row.data.balanceHd) : null},
             ${null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
