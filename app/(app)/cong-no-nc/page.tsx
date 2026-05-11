import { HardHat } from "lucide-react";
import { getLaborSummary } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { LedgerOverviewShell } from "@/components/ledger/ledger-overview-shell";

export default async function CongNoNcPage() {
  const [summary, contractors] = await Promise.all([
    getLaborSummary(),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const parties = new Map(contractors.map((c) => [c.id, c.name]));

  return (
    <LedgerOverviewShell
      title="Công nợ Nhân công"
      description="Tổng hợp công nợ TT / HĐ theo Đội thi công × Chủ thể"
      partyLabel="đội thi công"
      basePath="/cong-no-nc"
      navLinks={[
        { href: "/cong-no-nc/nhap-lieu", label: "Nhập liệu" },
        { href: "/cong-no-nc/so-du-ban-dau", label: "Số dư ban đầu" },
        { href: "/cong-no-nc/bao-cao-thang", label: "Báo cáo tháng" },
        { href: "/cong-no-nc/chi-tiet", label: "Chi tiết đội" },
      ]}
      summary={summary}
      parties={parties}
      emptyIcon={HardHat}
      emptyHref="/cong-no-nc/nhap-lieu"
      emptyAction="Bắt đầu nhập liệu"
    />
  );
}
