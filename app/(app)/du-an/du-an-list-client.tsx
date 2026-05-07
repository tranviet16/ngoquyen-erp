"use client";

import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils/format";

type ProjectRow = {
  id: number;
  code: string;
  name: string;
  ownerInvestor: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  _count: { categories: number };
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "code", header: "Mã DA", className: "w-[100px] font-mono" },
  { key: "name", header: "Tên dự án" },
  { key: "ownerInvestor", header: "Chủ đầu tư" },
  {
    key: "startDate",
    header: "Khởi công",
    className: "w-[120px]",
    render: (row) => formatDate(row.startDate as Date | null),
  },
  {
    key: "endDate",
    header: "Hoàn thành",
    className: "w-[120px]",
    render: (row) => formatDate(row.endDate as Date | null),
  },
  {
    key: "status",
    header: "Trạng thái",
    className: "w-[160px]",
    render: (row) => <StatusBadge status={row.status as string} />,
  },
];

interface Props {
  data: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function DuAnListClient({ data, total, page, pageSize, searchValue }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý Dự án Xây dựng</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chọn dự án để xem tiến độ, nghiệm thu, dự toán, định mức, giao dịch, hợp đồng, dòng tiền.
        </p>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên dự án..."
        onRowClick={(row) => router.push(`/du-an/${(row as unknown as ProjectRow).id}`)}
        emptyText="Chưa có dự án nào"
        emptyDescription="Thêm dự án tại trang Dữ liệu nền tảng → Dự án."
      />
    </div>
  );
}
