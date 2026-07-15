export type JournalAutoLabelEntryType = "thu" | "chi" | "chuyen_khoan";
export type JournalAutoLabelCostBehavior = "fixed" | "variable" | "transfer";

export interface JournalAutoLabelInput {
  description?: string | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  entryType?: JournalAutoLabelEntryType | string | null;
  costBehavior?: JournalAutoLabelCostBehavior | string | null;
  entryTypeLabel?: string | null;
  categoryName?: string | null;
}

export interface JournalAutoLabelSuggestion {
  entryType: JournalAutoLabelEntryType;
  costBehavior: JournalAutoLabelCostBehavior;
  categoryName: string | null;
  reason: string;
}

export interface JournalCategoryLike {
  id: number;
  name: string;
}

const TRANSFER_PATTERNS = [
  "rut tm", "rut tien", "rut tien mat", "nhap tm", "nhap quy", "nhap quy tien mat", "nop tm vao tk",
  "nop tien mat vao tk", "chuyen tien", "chuyen khoan", "gui tiet kiem", "tat toan hdtg",
];

const INCOME_HINTS = [
  "thu tien", "nop tien xd", "nop tien xay", "nop tien tra", "nop tra", "nop phi",
  "nop tien bhxh", "nhan lai", "lai tien gui", "hoan", "a tra", "tien ct",
];

const FIXED_HINTS = [
  "bhxh", "bao hiem", "lai", "luong", "thue", "tncn", "gtgt", "tndn", "qltk",
  "phi ck", "van phong", "tiep khach", "vpp", "dien", "nuoc", "xang xe",
  "khach san", "pho to", "do muc", "qua",
];

function has(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(normalizeJournalText(needle)));
}

export function classifyJournalEntryKind(input: JournalAutoLabelInput): {
  entryType: JournalAutoLabelEntryType;
  costBehavior: JournalAutoLabelCostBehavior;
} {
  const text = normalizeJournalText(input.description);
  const label = normalizeJournalText(input.entryTypeLabel);
  const explicitType = normalizeJournalText(input.entryType);
  const explicitBehavior = normalizeJournalText(input.costBehavior);

  if (input.fromAccountId != null && input.toAccountId != null) {
    return { entryType: "chuyen_khoan", costBehavior: "transfer" };
  }
  if (explicitType === "chuyen khoan" || label.startsWith("chuyen tien") || has(text, TRANSFER_PATTERNS)) {
    return { entryType: "chuyen_khoan", costBehavior: "transfer" };
  }
  if (explicitType === "thu" || label.startsWith("thu nhap")) {
    return {
      entryType: "thu",
      costBehavior: label.includes("co dinh") || explicitBehavior === "fixed" ? "fixed" : "variable",
    };
  }
  if (explicitType === "chi" || label.startsWith("chi phi")) {
    return {
      entryType: "chi",
      costBehavior: label.includes("co dinh") || explicitBehavior === "fixed" ? "fixed" : "variable",
    };
  }
  const rentIncome = has(text, ["thue vp", "tien thue", "vitchimart"]) && !text.includes("tra tien thue");
  if (has(text, INCOME_HINTS) || rentIncome || /\blo\s*\d+/.test(text)) {
    const fixed = has(text, ["bhxh", "bao hiem", "lai", "thue vp", "tien thue"]) && !text.includes("tra tien thue");
    return { entryType: "thu", costBehavior: fixed ? "fixed" : "variable" };
  }
  return { entryType: "chi", costBehavior: has(text, FIXED_HINTS) ? "fixed" : "variable" };
}

function classifyIncomeCategory(text: string) {
  if (has(text, ["thu tien bhxh", "nop tien bhxh", "bhxh yt", "thu tien bao hiem", "nop bao hiem"])) {
    return "Thu nộp bảo hiểm";
  }
  if (has(text, ["lai tien gui", "nhan lai", "tra lai"])) return "Thu nhập tiền gửi";
  if (has(text, ["thue vp", "tien thue"]) && !text.includes("tra tien thue") && !text.includes("son")) {
    return "Thu nhập cho thuê";
  }
  if (text.includes("tra vat tu")) return "Thu hộ trả vật tư";
  if (has(text, ["hoan tt", "hoan ung", "hoan thanh toan", "tra lai tien"])) return "Hoàn ứng";
  if (has(text, ["nop tien xd", "nop tien xay", "a tra", "tien ct"]) || /\blo\s*\d+/.test(text)) {
    return "Thu nhập xây dựng";
  }
  return "Thu nhập khác";
}

function classifyExpenseCategory(text: string) {
  if (has(text, ["vay thi cong", "vay tien"])) return "Vay thi công";
  if (text.includes("thi hanh an")) return "Chi phí thi hành án";
  if (has(text, ["thue", "tncn", "gtgt", "tndn", "pnn"])) return "Chi phí thuế";
  if (has(text, ["tt luong", "chi luong", "luong vp", "luong t0", "luong t1", "luong cho"])) {
    return "Chi phí lương";
  }
  if (has(text, ["vat tu", "vat lieu"])) return "Chi phí vật tư";
  if (has(text, [
    "nhan cong", "gia cong", "xay tho", "van khuon", "cot thep", "do be tong",
    "ep coc", "pha do", "ha tang", "don dat", "san nen", "cong nhat",
  ])) return "Chi phí nhân công";
  if (
    text.includes("tam ung tien") &&
    !has(text, ["nhan cong", "vat tu", "gia cong", "xay tho", "van khuon", "cot thep"])
  ) return "Tạm ứng công trình";
  if (has(text, ["nop tien bhxh", "bao hiem"])) return "Chi phí bảo hiểm";
  if (has(text, [
    "thue giao", "tu van", "chi tien cong trinh", "thue may", "may thi cong",
    "cuoc van chuyen", "camera", "bien an toan", "lop o to", "blhd", "bltu",
    "bao lanh", "phi bl", "thi cong ct", "thi cong gt",
  ]) || (text.includes("thi cong") && !has(text, ["xay tho", "nhan cong"]))) {
    return "Chi phí chung công trình";
  }
  if (has(text, [
    "qltk", "phi ck", "phi chuyen khoan", "vp ", "van phong", "tiep khach", "vpp",
    "dien thoai", "dien nuoc", "tien nuoc", "tien dien", "qua", "hoa ", "vieng",
    "bao", "tham quan", "thue xe", "ung ho", "thue vp", "xang xe", "tat nien",
    "dao quat", "le hoi", "ruou", "khach san", "chi kp", "chi ho tro", "chi tien tet",
    "scan", "pho to", "do muc", "om nam vien", "cay thong", "tap chi",
  ])) return "Chi phí QLDN";
  return "Chi phí chung công trình";
}

export function normalizeJournalText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function suggestJournalLabel(input: JournalAutoLabelInput): JournalAutoLabelSuggestion | null {
  const text = normalizeJournalText(input.description);
  if (!text && !input.entryType && !input.entryTypeLabel) return null;

  const kind = classifyJournalEntryKind(input);
  if (kind.entryType === "chuyen_khoan") {
    return {
      entryType: "chuyen_khoan",
      costBehavior: "transfer",
      categoryName: null,
      reason: "Khớp chuyển tiền nội bộ theo SOP",
    };
  }

  let categoryName = String(input.categoryName ?? "").trim() || null;
  if (!categoryName || categoryName === "—") {
    if (text.includes("nop thua") && has(text, ["tra lai tien xay", "tra lai tien xd"])) {
      categoryName = "Trả nộp thừa tiền XD";
    } else if (
      kind.entryType === "thu" &&
      text.includes("nop phi") &&
      has(text, ["bao lanh", "blhd", "bltu", "phi ck"])
    ) {
      categoryName = "Thu hộ nộp phí";
    } else if (
      kind.entryType === "thu" &&
      has(text, ["tra vat tu", "nop tra tien vat tu", "nop tien tra vat tu", "nop tien tra thue giao", "nop tien tam ung tien thue may"])
    ) {
      categoryName = "Thu hộ trả vật tư";
    } else if (text.includes("tt tien thi cong")) {
      categoryName = "Thanh toán tiền công trình";
    } else if (text.includes("tap chi")) {
      categoryName = "Chi phí QLDN";
    } else {
      categoryName = kind.entryType === "thu" ? classifyIncomeCategory(text) : classifyExpenseCategory(text);
    }
  }

  if (categoryName) {
    return {
      entryType: kind.entryType,
      costBehavior: kind.costBehavior,
      categoryName,
      reason: "Khớp công thức tự gán nhãn trong workbook Tài chính NQ",
    };
  }

  return null;
}

export function resolveJournalCategoryId(categoryName: string | null, categories: JournalCategoryLike[]) {
  if (!categoryName) return null;
  const normalizedName = normalizeJournalText(categoryName);
  return categories.find((category) => normalizeJournalText(category.name) === normalizedName)?.id ?? null;
}
