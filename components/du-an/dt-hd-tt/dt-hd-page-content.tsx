/**
 * Nội dung trang DT-HĐ, tách khỏi page.tsx (trang là Server Component async đọc DB) để test dựng được
 * đúng bố cục trang: thanh công cụ, băng cài đặt, màn hình mới (`print:hidden`), rồi bản in `DtHdView`
 * NGUYÊN VẸN là con cuối (`ReportPageLayout`). Màn hình và bản in đọc cùng một `DtHdReport`.
 */

import type { DtHdReport } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import type { RateSettings } from "@/lib/du-an/dt-hd-tt/report-inputs";
import type { DtHdParams } from "@/lib/du-an/dt-hd-tt/screen-links";
import { DtHdScreen } from "./dt-hd-screen";
import { DtHdView } from "./dt-hd-view";
import { ReportPageLayout, ReportToolbar, SettingsBanner } from "./report-bits";

export interface DtHdPageContentProps {
  projectId: number;
  projectLabel: string;
  settings: RateSettings;
  report: DtHdReport;
  initialParams: DtHdParams;
  partBKeys: Readonly<Record<number, string>>;
}

export function DtHdPageContent({ projectId, projectLabel, settings, report, initialParams, partBKeys }: DtHdPageContentProps) {
  return (
    <ReportPageLayout
      toolbar={<ReportToolbar title="Đối chiếu dự toán – hóa đơn (DT-HĐ)" subtitle={projectLabel} projectId={projectId} report="dt-hd" />}
      banner={<SettingsBanner settings={settings} projectId={projectId} />}
      screen={<DtHdScreen projectId={projectId} report={report} initialParams={initialParams} partBKeys={partBKeys} />}
      print={<DtHdView report={report} />}
    />
  );
}
