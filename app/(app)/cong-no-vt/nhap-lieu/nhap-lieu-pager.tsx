"use client";

/**
 * Chuyển trang của lưới Nhập liệu công nợ vật tư: sổ được tải theo trang ở server (mới nhất trước),
 * nút Trước / Sau đổi `?page=` để xem các dòng cũ hơn.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaginationFooter } from "@/components/data-table/pagination-footer";

interface Props {
  total: number;
  page: number;
  pageSize: number;
}

export function NhapLieuPager({ total, page, pageSize }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <PaginationFooter
      total={total}
      page={page}
      pageSize={pageSize}
      isPending={isPending}
      onPageChange={(next) => startTransition(() => router.push(`/cong-no-vt/nhap-lieu?page=${next}`))}
    />
  );
}
