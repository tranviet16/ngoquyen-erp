import { TrendingUp } from "lucide-react";

export default async function HieuSuatPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
      <TrendingUp className="size-12 text-muted-foreground/40" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Module Hiệu suất</h1>
        <p className="text-muted-foreground max-w-md">
          Module hiệu suất sẽ ra mắt sớm. Tính năng này đang được phát triển trong kế hoạch Plan C.
        </p>
      </div>
    </div>
  );
}
