import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FormWithRelations } from "@/lib/coordination-form/coordination-form-service";

export function FormListCard({
  forms,
  viewAllHref,
}: {
  forms: FormWithRelations[];
  viewAllHref: string;
}) {
  return (
    <div className="nq-card flex flex-col overflow-hidden">
      <div className="nq-card-head">
        <div>
          <h3 className="nq-card-title">Phiếu chờ duyệt</h3>
          <p className="nq-card-sub">{forms.length} phiếu cần xử lý</p>
        </div>
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Tất cả <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="flex-1 bg-card">
        {forms.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            Không có phiếu phối hợp chờ duyệt.
          </p>
        ) : (
          forms.map((f) => (
            <Link
              key={f.id}
              href={`/van-hanh/phieu-phoi-hop/${f.id}`}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/45"
            >
              <span className="shrink-0 rounded border bg-secondary px-2 py-1 font-mono text-[11px] font-semibold text-muted-foreground">
                {f.code}
              </span>
              <span className="min-w-0 truncate font-medium">{f.content}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {f.creator.name}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
