import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { auth } from "@/lib/auth";
import { globalSearch } from "@/lib/global-search-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export const dynamic = "force-dynamic";

export default async function GlobalSearchPage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const sections = query ? await globalSearch(session.user.id, query) : [];
  const total = sections.reduce((sum, section) => sum + section.results.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tìm kiếm</h1>
          <p className="text-sm text-muted-foreground">
            {query
              ? `Kết quả cho "${query}" trong các module bạn có quyền truy cập.`
              : "Nhập từ khóa ở ô tìm kiếm tổng quát để tra cứu nhanh."}
          </p>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          {total} kết quả
        </div>
      </div>

      {!query && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
            <Search className="h-5 w-5" />
            <span>Chưa có từ khóa tìm kiếm.</span>
          </CardContent>
        </Card>
      )}

      {query && total === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Không tìm thấy kết quả phù hợp trong các module hiện có quyền truy cập.
          </CardContent>
        </Card>
      )}

      {sections.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {section.results.map((result) => (
              <Link
                key={result.id}
                href={result.href}
                className="block px-4 py-3 transition-colors hover:bg-muted/45"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{result.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {result.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                    {result.module}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
