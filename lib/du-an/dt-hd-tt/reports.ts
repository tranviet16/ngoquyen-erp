/**
 * Tính cả ba báo cáo "Đối chiếu DT-HĐ-TT" từ một bộ dữ liệu đầu vào (dùng chung một chỉ mục).
 * Thuần — dùng cho màn hình, xuất Excel và cho cổng kiểm của import (so với số trong file).
 */

import { buildBookIndex } from "./book-index";
import { buildDtHdReport, type DtHdReport } from "./dt-hd-report";
import { buildDtTtReport, type DtTtReport } from "./dt-tt-report";
import { buildHdTtReport, type HdTtReport } from "./hd-tt-report";
import { buildPhanIII, type PhanIIIReport } from "./phan-iii";
import type { RateSettings, ReportInputs } from "./report-inputs";

export interface DtHdTtReports {
  settings: RateSettings;
  dtHd: DtHdReport;
  dtTt: DtTtReport;
  phanIII: PhanIIIReport;
  hdTt: HdTtReport;
}

export function buildReports(inp: ReportInputs): DtHdTtReports {
  const index = buildBookIndex(inp);
  const dtTt = buildDtTtReport(inp, index);
  return {
    settings: inp.settings,
    dtHd: buildDtHdReport(inp, index),
    dtTt,
    phanIII: buildPhanIII(inp, index, dtTt),
    hdTt: buildHdTtReport(inp, index),
  };
}
