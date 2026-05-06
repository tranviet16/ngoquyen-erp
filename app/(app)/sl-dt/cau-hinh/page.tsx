import { getMilestoneScores } from "@/lib/sl-dt/report-service";
import { CauHinhClient } from "./cau-hinh-client";

export default async function CauHinhPage() {
  const scores = await getMilestoneScores();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cấu hình Mốc điểm</h1>
        <p className="text-sm text-muted-foreground">Quản lý bảng mốc tiến độ — điểm — dùng để tính phải nộp tiền</p>
      </div>

      <CauHinhClient scores={scores} />
    </div>
  );
}
