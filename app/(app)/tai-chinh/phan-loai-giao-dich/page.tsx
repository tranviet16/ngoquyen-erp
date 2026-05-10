import {
  listExpenseClassifications,
  getExpenseClassificationSummary,
} from "@/lib/tai-chinh/expense-classification-service";
import { PhanLoaiGiaoDichClient } from "./phan-loai-giao-dich-client";
import { serializeDecimals } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ category?: string; from?: string; to?: string }>;
}

export default async function PhanLoaiGiaoDichPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = {
    categoryName: sp.category || undefined,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
  };
  const [rows, summary] = await Promise.all([
    listExpenseClassifications(filters),
    getExpenseClassificationSummary(filters),
  ]);
  return (
    <PhanLoaiGiaoDichClient
      rows={serializeDecimals(rows)}
      summary={serializeDecimals(summary)}
      initialFilters={{
        category: sp.category ?? "",
        from: sp.from ?? "",
        to: sp.to ?? "",
      }}
    />
  );
}
