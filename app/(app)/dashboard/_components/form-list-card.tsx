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
    <div className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="px-4 pt-3 pb-2 border-b">
        <h3 className="text-sm font-semibold">Phiếu chờ duyệt</h3>
      </div>
      <div className="flex-1 p-3 space-y-1.5">
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Không có phiếu phối hợp chờ duyệt.
          </p>
        ) : (
          forms.map((f) => (
            <Link
              key={f.id}
              href={`/van-hanh/phieu-phoi-hop/${f.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent text-sm"
            >
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {f.code}
              </span>
              <span className="truncate flex-1">{f.content}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {f.creator.name}
              </span>
            </Link>
          ))
        )}
      </div>
      <Link
        href={viewAllHref}
        className="flex items-center justify-end gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-t"
      >
        Xem tất cả <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
