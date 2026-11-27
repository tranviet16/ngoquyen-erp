import Link from "next/link";
import { cn } from "@/lib/utils";
import { SOURCE_LEDGER, SOURCE_PROJECT, type TransactionsSource } from "@/lib/du-an/project-ledger/transactions-source";

interface Props {
  basePath: string;
  current: TransactionsSource;
  /** Số dòng sổ Công nợ vật tư (không tính số dư đầu kỳ). */
  ledgerRowCount: number;
  projectRowCount: number;
}

/**
 * Công tắc nguồn của tab Giao Dịch: hai nút đổi URL (`?nguon=`). Chỉ render khi người xem đọc được dòng sổ
 * Công nợ vật tư. Hai nguồn tách hẳn, không có tổng chung.
 */
export function SourceSwitch({ basePath, current, ledgerRowCount, projectRowCount }: Props) {
  const items = [
    { key: SOURCE_LEDGER, label: `Sổ công nợ vật tư (${ledgerRowCount} dòng)` },
    { key: SOURCE_PROJECT, label: `Sổ dự án (${projectRowCount} dòng)` },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Nguồn:</span>
      <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Nguồn giao dịch">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <Link
              key={item.key}
              href={`${basePath}?nguon=${item.key}`}
              role="tab"
              aria-selected={active}
              className={cn(
                "rounded px-3 py-1 text-sm",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">Hai nguồn tách riêng, không cộng gộp.</span>
    </div>
  );
}
