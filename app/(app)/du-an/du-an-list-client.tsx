"use client";

import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/data-table";

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

const STATUS_LABELS: Record<string, string> = {
  active: "Đang thực hiện",
  completed: "Hoàn thành",
  paused: "Tạm dừng",
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "code", header: "Mã DA", className: "w-[100px] font-mono" },
  { key: "name", header: "Tên dự án" },
  { key: "ownerInvestor", header: "Chủ đầu tư" },
  {
    key: "startDate",
    header: "Khởi công",
    className: "w-[120px]",
    render: (row) => {
      const d = row.startDate as Date | null;
      return d ? new Date(d).toLocaleDateString("vi-VN") : "—";
    },
  },
  {
    key: "endDate",
    header: "Hoàn thành",
    className: "w-[120px]",
    render: (row) => {
      const d = row.endDate as Date | null;
      return d ? new Date(d).toLocaleDateString("vi-VN") : "—";
    },
  },
  {
    key: "status",
    header: "Trạng thái",
    className: "w-[140px]",
    render: (row) => STATUS_LABELS[row.status as string] ?? String(row.status),
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
        <h1 className="text-2xl font-bold">Quản lý Dự án Xây dựng</h1>
        <p className="text-sm text-muted-foreground">
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
        emptyText="Chưa có dự án nào. Thêm dự án tại trang Dữ liệu gốc > Dự án."
      />
    </div>
  );
}
