/**
 * Bộ gom cảnh báo, lỗi chặn và quyết định ngày cho một lần parse. Mỗi mục mang
 * tham chiếu nguồn để màn xem trước chỉ đúng ô.
 */

import type {
  BlockingError,
  DateDecision,
  ParseIssues,
  ParseWarning,
  SourceRef,
} from "./types";

export class IssueSink implements ParseIssues {
  readonly warnings: ParseWarning[] = [];
  readonly blockingErrors: BlockingError[] = [];
  readonly dateDecisions: DateDecision[] = [];

  warn(code: string, message: string, ref: SourceRef): void {
    this.warnings.push({ code, level: "warning", message, ref });
  }

  info(code: string, message: string, ref: SourceRef): void {
    this.warnings.push({ code, level: "info", message, ref });
  }

  block(code: string, message: string, ref: SourceRef): void {
    this.blockingErrors.push({ code, message, ref });
  }

  decide(decision: DateDecision): void {
    this.dateDecisions.push(decision);
  }

  /** Bản sao các danh sách hiện có (để đưa vào kết quả từng file). */
  snapshot(): ParseIssues {
    return {
      warnings: [...this.warnings],
      blockingErrors: [...this.blockingErrors],
      dateDecisions: [...this.dateDecisions],
    };
  }
}

/** Tham chiếu cấp file (khi lỗi không gắn với ô cụ thể). */
export function fileRef(file: string, sheet = "", raw: string | null = null): SourceRef {
  return { file, sheet, cell: "", raw };
}
