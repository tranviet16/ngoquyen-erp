"use client";

import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils/format";
import { DU_AN_SPEC, type DuAnRow } from "@/lib/master-data/du-an/table-spec";
import { patchDuAn } from "@/lib/master-data/project-service";

const DU_AN_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "code",
    header: "Mã DA",
    kind: "text",
    className: "w-[100px] font-mono",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "text",
  },
  {
    key: "name",
    header: "Tên dự án",
    kind: "text",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "text",
  },
  { key: "ownerInvestor", header: "Chủ đầu tư" },
  {
    key: "startDate",
    header: "Khởi công",
    kind: "date",
    className: "w-[120px]",
    sortable: true,
    render: (row) => formatDate(row.startDate as Date | null),
    // startDate is a business date — not inline editable
  },
  {
    key: "endDate",
    header: "Hoàn thành",
    kind: "date",
    className: "w-[120px]",
    sortable: true,
    render: (row) => formatDate(row.endDate as Date | null),
    // endDate is a business date — not inline editable
  },
  {
    key: "status",
    header: "Trạng thái",
    kind: "select",
    className: "w-[160px]",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "select",
    editOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
    filterOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
    render: (row) => <StatusBadge status={row.status as string} />,
  },
];

interface Props {
  data: DuAnRow[];
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
        columns={DU_AN_COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo mã hoặc tên dự án..."
        resourceSpec={DU_AN_SPEC}
        onCellEdit={async (row, key, value) => {
          const duAn = row as unknown as DuAnRow;
          return patchDuAn(duAn.id, { [key]: value }) as Promise<Record<string, unknown>>;
        }}
        onRowClick={(row) => router.push(`/du-an/${(row as unknown as DuAnRow).id}`)}
        emptyText="Chưa có dự án nào"
        emptyDescription="Thêm dự án tại trang Dữ liệu nền tảng → Dự án."
      />
    </div>
  );
}
