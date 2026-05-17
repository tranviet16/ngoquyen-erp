import { Receipt } from "lucide-react";
import { getMaterialSummary } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { LedgerOverviewShell } from "@/components/ledger/ledger-overview-shell";

export default async function CongNoVtPage() {
  const [summary, suppliers] = await Promise.all([
    getMaterialSummary(),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const parties = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <LedgerOverviewShell
      title="Công nợ Vật tư"
      description="Tổng hợp công nợ TT / HĐ theo NCC × Chủ thể"
      partyLabel="NCC"
      basePath="/cong-no-vt"
      navLinks={[
        { href: "/cong-no-vt/nhap-lieu", label: "Nhập liệu" },
        { href: "/cong-no-vt/so-du-ban-dau", label: "Số dư ban đầu" },
        { href: "/cong-no-vt/bao-cao-thang", label: "Báo cáo tháng" },
        { href: "/cong-no-vt/chi-tiet", label: "Công nợ lũy kế" },
      ]}
      summary={summary}
      parties={parties}
      emptyIcon={Receipt}
      emptyHref="/cong-no-vt/nhap-lieu"
      emptyAction="Bắt đầu nhập liệu"
    />
  );
}
