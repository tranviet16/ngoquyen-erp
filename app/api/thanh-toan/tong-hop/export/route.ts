import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { aggregateMonth, type AggregateRow } from "@/lib/payment/payment-service";

interface PivotRow {
  supplierName: string;
  ctyQlDeNghi: number;
  ctyQlDuyet: number;
  giaoKhoanDeNghi: number;
  giaoKhoanDuyet: number;
}

function pivotize(rows: AggregateRow[]): PivotRow[] {
  const m = new Map<number, PivotRow>();
  for (const r of rows) {
    let p = m.get(r.supplierId);
    if (!p) {
      p = {
        supplierName: r.supplierName,
        ctyQlDeNghi: 0,
        ctyQlDuyet: 0,
        giaoKhoanDeNghi: 0,
        giaoKhoanDuyet: 0,
      };
      m.set(r.supplierId, p);
    }
    if (r.projectScope === "cty_ql") {
      p.ctyQlDeNghi += r.soDeNghi;
      p.ctyQlDuyet += r.soDuyet;
    } else {
      p.giaoKhoanDeNghi += r.soDeNghi;
      p.giaoKhoanDuyet += r.soDuyet;
    }
  }
  return [...m.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "vi"));
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const rows = await aggregateMonth(month);
  const pivot = pivotize(rows);

  const aoa: (string | number)[][] = [
    [`TỔNG HỢP THANH TOÁN THÁNG ${month}`],
    [],
    ["STT", "Đơn vị TT", "Công trình Cty QL", "", "Công trình giao khoán", "", "Tổng TT lần này"],
    ["", "", "Số đề nghị TT", "Số duyệt TT", "Số đề nghị TT", "Số duyệt TT", ""],
    ...pivot.map((p, i) => [
      i + 1,
      p.supplierName,
      p.ctyQlDeNghi,
      p.ctyQlDuyet,
      p.giaoKhoanDeNghi,
      p.giaoKhoanDuyet,
      p.ctyQlDuyet + p.giaoKhoanDuyet,
    ]),
  ];

  if (pivot.length > 0) {
    const totals = pivot.reduce(
      (s, p) => {
        s[0] += p.ctyQlDeNghi;
        s[1] += p.ctyQlDuyet;
        s[2] += p.giaoKhoanDeNghi;
        s[3] += p.giaoKhoanDuyet;
        return s;
      },
      [0, 0, 0, 0]
    );
    aoa.push(["", "Tổng", totals[0], totals[1], totals[2], totals[3], totals[1] + totals[3]]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } },
  ];
  ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tổng hợp");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tong-hop-thanh-toan-${month}.xlsx"`,
    },
  });
}
