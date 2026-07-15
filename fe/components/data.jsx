// Mock data for Ngô Quyền ERP prototype
// Vietnamese construction company context.

const fmtVND = (n, opts = {}) => {
  const { compact = false, sign = false } = opts;
  if (compact) {
    if (Math.abs(n) >= 1e9) return (sign && n > 0 ? "+" : "") + (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
    if (Math.abs(n) >= 1e6) return (sign && n > 0 ? "+" : "") + (n / 1e6).toFixed(0) + " tr";
    return (sign && n > 0 ? "+" : "") + n.toLocaleString("vi-VN");
  }
  return (sign && n > 0 ? "+" : "") + n.toLocaleString("vi-VN") + " ₫";
};

const fmtDate = (d) => {
  if (typeof d === "string") d = new Date(d);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtDateShort = (d) => {
  if (typeof d === "string") d = new Date(d);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

// Projects ────────────────────────────────────────────────────
const projects = [
  { id: "P-2401", code: "NQ-CC-247", name: "Cao ốc Văn Phòng Sao Mai", address: "Q.7, TP.HCM", entity: "NQ Sài Gòn", manager: "Trần V. Hùng", progress: 0.72, value: 184_500_000_000, status: "active", deadline: "2026-09-30", startedAt: "2025-03-18", debt: 12_400_000_000, riskLevel: "ok", team: ["TH", "PL", "MN", "AV"] },
  { id: "P-2402", code: "NQ-RES-152", name: "Khu căn hộ Riverside Garden", address: "Bình Dương", entity: "NQ Bình Dương", manager: "Nguyễn T. Lan", progress: 0.43, value: 96_200_000_000, status: "active", deadline: "2026-12-15", startedAt: "2025-08-02", debt: 8_900_000_000, riskLevel: "warning", team: ["LN", "HQ", "PT"] },
  { id: "P-2403", code: "NQ-IND-318", name: "Nhà máy may Tân Hưng", address: "Long An", entity: "NQ Sài Gòn", manager: "Lê V. Minh", progress: 0.88, value: 58_000_000_000, status: "active", deadline: "2026-07-20", startedAt: "2025-01-10", debt: 3_200_000_000, riskLevel: "ok", team: ["MN", "AV"] },
  { id: "P-2404", code: "NQ-HSE-091", name: "Biệt thự song lập Phú Mỹ", address: "Bà Rịa-Vũng Tàu", entity: "NQ Sài Gòn", manager: "Trần V. Hùng", progress: 0.15, value: 42_800_000_000, status: "active", deadline: "2027-03-10", startedAt: "2026-04-05", debt: 1_800_000_000, riskLevel: "ok", team: ["TH"] },
  { id: "P-2405", code: "NQ-CC-301", name: "Trung tâm thương mại Đông Phố", address: "Đồng Nai", entity: "NQ Sài Gòn", manager: "Phạm T. Hoa", progress: 0.59, value: 218_000_000_000, status: "active", deadline: "2026-10-25", startedAt: "2025-05-22", debt: 21_300_000_000, riskLevel: "danger", team: ["PH", "LN", "AV", "MN", "TH"] },
  { id: "P-2406", code: "NQ-INF-405", name: "Cải tạo trường THPT Nguyễn Du", address: "Q. Tân Bình, TP.HCM", entity: "NQ Sài Gòn", manager: "Hoàng V. Quân", progress: 1.0, value: 19_500_000_000, status: "closed", deadline: "2026-04-30", startedAt: "2025-11-12", debt: 0, riskLevel: "ok", team: ["HQ"] },
  { id: "P-2407", code: "NQ-RES-188", name: "Chung cư mini An Phú", address: "Q.2, TP.HCM", entity: "NQ Sài Gòn", manager: "Nguyễn T. Lan", progress: 0.06, value: 31_400_000_000, status: "pending", deadline: "2027-06-30", startedAt: "2026-05-15", debt: 0, riskLevel: "ok", team: ["LN", "PT"] },
];

// KPIs for dashboard ──────────────────────────────────────────
const kpis = [
  { label: "Số dư tiền mặt + ngân hàng", value: 18_420_000_000, unit: "₫", delta: +4.2, sub: "5 tài khoản", spark: [12,14,13,15,17,16,18,18,17,18,19,18], tone: "primary" },
  { label: "Phải thu trong 30 ngày", value: 24_650_000_000, unit: "₫", delta: -2.8, sub: "Từ 12 chủ đầu tư", spark: [18,21,23,26,24,27,28,25,27,26,25,24], tone: "info" },
  { label: "Phải trả trong 30 ngày", value: 31_280_000_000, unit: "₫", delta: +8.1, sub: "62 NCC · 4 hạng mục", spark: [22,23,24,26,25,27,28,29,30,30,31,31], tone: "accent" },
  { label: "Công nợ quá hạn", value: 4_180_000_000, unit: "₫", delta: -12.4, sub: "8 nhà cung cấp", spark: [6,7,5,6,5,5,4,5,4,4,4,4], tone: "danger" },
];

// Cashflow chart — 12 months ──────────────────────────────────
const cashflow = [
  { m: "T6/25", inflow: 11.2, outflow: 9.4 },
  { m: "T7/25", inflow: 12.8, outflow: 10.1 },
  { m: "T8/25", inflow: 9.6, outflow: 11.3 },
  { m: "T9/25", inflow: 14.2, outflow: 12.0 },
  { m: "T10/25", inflow: 16.4, outflow: 13.5 },
  { m: "T11/25", inflow: 13.1, outflow: 14.2 },
  { m: "T12/25", inflow: 22.6, outflow: 16.8 },
  { m: "T1/26", inflow: 10.4, outflow: 11.9 },
  { m: "T2/26", inflow: 8.2, outflow: 9.6 },
  { m: "T3/26", inflow: 15.8, outflow: 13.1 },
  { m: "T4/26", inflow: 18.2, outflow: 15.4 },
  { m: "T5/26", inflow: 24.1, outflow: 17.6 },
];

// Pending approvals queue ────────────────────────────────────
const approvals = [
  { id: "PPH-2026-082", title: "Phiếu phối hợp · Tăng ca đổ bê tông sàn 12", project: "Cao ốc Sao Mai", from: "Lê V. Minh", amount: null, type: "phieu-phoi-hop", urgency: "high", waiting: "2h" },
  { id: "TT-2026-T5-04", title: "Đợt thanh toán T5 · Vật tư đợt 4", project: "Nhiều dự án", from: "Phạm T. Hoa", amount: 8_240_000_000, type: "thanh-toan", urgency: "high", waiting: "5h" },
  { id: "PPH-2026-081", title: "Phiếu phối hợp · Mua thép D14 - 32 tấn", project: "Riverside Garden", from: "Nguyễn T. Lan", amount: 412_000_000, type: "phieu-phoi-hop", urgency: "med", waiting: "1d" },
  { id: "PPH-2026-079", title: "Phiếu phối hợp · Thi công tầng hầm B2", project: "TTTM Đông Phố", from: "Phạm T. Hoa", amount: null, type: "phieu-phoi-hop", urgency: "med", waiting: "1d" },
  { id: "TT-2026-T5-03", title: "Đợt thanh toán T5 · Nhân công Tổ 4", project: "Nhà máy Tân Hưng", from: "Lê V. Minh", amount: 1_180_000_000, type: "thanh-toan", urgency: "low", waiting: "2d" },
];

// State obligations ──────────────────────────────────────────
const obligations = [
  { code: "GTGT", name: "Thuế GTGT đầu ra", due: "2026-06-20", amount: 1_840_000_000, paid: 0, status: "due" },
  { code: "TNDN", name: "Thuế TNDN tạm tính Q2", due: "2026-07-30", amount: 920_000_000, paid: 0, status: "upcoming" },
  { code: "TNCN", name: "Thuế TNCN", due: "2026-06-20", amount: 184_000_000, paid: 184_000_000, status: "paid" },
  { code: "BHXH", name: "BHXH + BHYT + BHTN", due: "2026-06-01", amount: 612_000_000, paid: 0, status: "overdue" },
  { code: "KPCĐ", name: "Kinh phí công đoàn", due: "2026-06-30", amount: 38_000_000, paid: 0, status: "upcoming" },
];

// Activity feed ──────────────────────────────────────────────
const activity = [
  { who: "Phạm T. Hoa", what: "đã duyệt đợt thanh toán", target: "TT-2026-T5-02", time: "12 phút", icon: "Check", tone: "success" },
  { who: "Lê V. Minh", what: "tạo phiếu phối hợp", target: "PPH-2026-082", time: "2 giờ", icon: "Clipboard", tone: "primary" },
  { who: "Nguyễn T. Lan", what: "cập nhật tiến độ Riverside Garden lên", target: "43%", time: "3 giờ", icon: "Trending", tone: "info" },
  { who: "Trần V. Hùng", what: "ghi nhận thanh toán cho NCC", target: "Thép Pomina · 1.2 tỷ", time: "5 giờ", icon: "Wallet", tone: "success" },
  { who: "Hoàng V. Quân", what: "đóng dự án", target: "Cải tạo THPT Nguyễn Du", time: "1 ngày", icon: "Folder", tone: "default" },
  { who: "Phạm T. Hoa", what: "cảnh báo quá hạn NCC", target: "Bê tông Hà Tiên 1", time: "1 ngày", icon: "Alert", tone: "danger" },
];

// Supplier debt by category (cong-no-vt) ─────────────────────
const supplierDebt = [
  {
    entity: "NQ Sài Gòn",
    rows: [
      { id: "S-101", name: "Bê tông Hà Tiên 1", code: "NCC-0142", contact: "Mr. Hoà · 091…", debtTT: 3_240_000_000, debtHD: 2_880_000_000, overdue: 1_240_000_000, lastPaid: "2026-04-22", terms: "30 ngày", projects: 3 },
      { id: "S-102", name: "Thép Pomina", code: "NCC-0088", contact: "Ms. Linh · 098…", debtTT: 1_840_000_000, debtHD: 1_840_000_000, overdue: 0, lastPaid: "2026-05-12", terms: "45 ngày", projects: 4 },
      { id: "S-103", name: "Gạch Nam Hương", code: "NCC-0211", contact: "Mr. Bằng · 097…", debtTT: 920_000_000, debtHD: 1_120_000_000, overdue: 320_000_000, lastPaid: "2026-04-18", terms: "30 ngày", projects: 2 },
      { id: "S-104", name: "Cát đá Quang Minh", code: "NCC-0309", contact: "Ms. Vy · 090…", debtTT: 612_000_000, debtHD: 740_000_000, overdue: 180_000_000, lastPaid: "2026-04-30", terms: "30 ngày", projects: 5 },
      { id: "S-105", name: "Sơn Jotun", code: "NCC-0420", contact: "Mr. Đạt · 093…", debtTT: 282_000_000, debtHD: 282_000_000, overdue: 0, lastPaid: "2026-05-18", terms: "60 ngày", projects: 2 },
    ]
  },
  {
    entity: "NQ Bình Dương",
    rows: [
      { id: "S-201", name: "Thép Hoà Phát", code: "NCC-0102", contact: "Mr. Khoa · 094…", debtTT: 1_120_000_000, debtHD: 1_460_000_000, overdue: 0, lastPaid: "2026-05-08", terms: "45 ngày", projects: 2 },
      { id: "S-202", name: "Gạch Đồng Tâm", code: "NCC-0288", contact: "Ms. Trang · 098…", debtTT: 480_000_000, debtHD: 480_000_000, overdue: 0, lastPaid: "2026-05-15", terms: "30 ngày", projects: 1 },
      { id: "S-203", name: "Xi măng Holcim", code: "NCC-0061", contact: "Mr. Đông · 091…", debtTT: 1_640_000_000, debtHD: 1_820_000_000, overdue: 480_000_000, lastPaid: "2026-04-15", terms: "30 ngày", projects: 3 },
    ]
  },
];

// Kanban tasks ────────────────────────────────────────────────
const tasks = {
  todo: [
    { id: "T-1041", title: "Đặt cọc nhà cung cấp thép D14 cho TTTM Đông Phố", project: "TTTM Đông Phố", assignee: "PL", due: "2026-05-29", tag: "Vật tư", priority: "high" },
    { id: "T-1042", title: "Lập kế hoạch thanh toán T6 cho khối Bình Dương", project: "Riverside Garden", assignee: "HQ", due: "2026-06-02", tag: "Tài chính", priority: "high" },
    { id: "T-1043", title: "Khảo sát mặt bằng thi công lô 3 Biệt thự Phú Mỹ", project: "Biệt thự Phú Mỹ", assignee: "TH", due: "2026-06-05", tag: "Khảo sát", priority: "med" },
  ],
  doing: [
    { id: "T-1031", title: "Đối chiếu công nợ tháng 5 với 12 NCC vật tư", project: "—", assignee: "PH", due: "2026-05-30", tag: "Kế toán", priority: "high", progress: 0.6 },
    { id: "T-1032", title: "Lập phiếu phối hợp tăng ca đổ sàn 12 Cao ốc Sao Mai", project: "Cao ốc Sao Mai", assignee: "MN", due: "2026-05-28", tag: "Thi công", priority: "high", progress: 0.85 },
    { id: "T-1033", title: "Cập nhật SL-DT khối lượng T5/2026 - Riverside", project: "Riverside Garden", assignee: "LN", due: "2026-06-01", tag: "SL-DT", priority: "med", progress: 0.4 },
  ],
  review: [
    { id: "T-1021", title: "Bộ hồ sơ nghiệm thu giai đoạn 2 - Nhà máy Tân Hưng", project: "Nhà máy Tân Hưng", assignee: "MN", due: "2026-05-26", tag: "Nghiệm thu", priority: "high" },
    { id: "T-1022", title: "Báo cáo tài chính nội bộ tuần 21", project: "—", assignee: "PH", due: "2026-05-27", tag: "Báo cáo", priority: "med" },
  ],
  done: [
    { id: "T-1011", title: "Hoàn thiện hợp đồng phụ Cát đá Quang Minh", project: "Nhiều dự án", assignee: "AV", due: "2026-05-20", tag: "Hợp đồng", priority: "low" },
    { id: "T-1012", title: "Đóng dự án Cải tạo THPT Nguyễn Du", project: "THPT Nguyễn Du", assignee: "HQ", due: "2026-05-18", tag: "Đóng DA", priority: "low" },
    { id: "T-1013", title: "Cấp tạm ứng tổ thi công 4 - Tân Hưng", project: "Nhà máy Tân Hưng", assignee: "MN", due: "2026-05-22", tag: "Tài chính", priority: "med" },
  ],
};

// Ledger transactions (Nhật ký giao dịch) ──────────────────
const ledger = [
  { id: "GD-2026-1184", date: "2026-05-27", kind: "thu", amount: 4_200_000_000, source: "Tiền gửi · Vietcombank", party: "Cty CP Đại Quang Minh", project: "TTTM Đông Phố", category: "Thanh toán đợt 5 HĐ-2024-118", note: "Nghiệm thu giai đoạn 3" },
  { id: "GD-2026-1183", date: "2026-05-27", kind: "chi", amount: 1_180_000_000, source: "Tiền gửi · BIDV", party: "Thép Pomina", project: "Cao ốc Sao Mai", category: "Vật tư · Thép D14", note: "TT đợt 4 - HĐMB 22A" },
  { id: "GD-2026-1182", date: "2026-05-27", kind: "chi", amount: 240_000_000, source: "Tiền mặt - Quỹ Sài Gòn", party: "Tổ 4 - Thi công", project: "Nhà máy Tân Hưng", category: "Nhân công · Lương tuần 21", note: "" },
  { id: "GD-2026-1181", date: "2026-05-26", kind: "chi", amount: 612_000_000, source: "Tiền gửi · BIDV", party: "Cơ quan BHXH Q.1", project: "—", category: "Nghĩa vụ NN · BHXH T5", note: "Auto từ Nghĩa vụ NN" },
  { id: "GD-2026-1180", date: "2026-05-26", kind: "thu", amount: 8_400_000_000, source: "Tiền gửi · Vietcombank", party: "Cty TNHH Riverside ĐT", project: "Riverside Garden", category: "Thanh toán đợt 3 HĐ-2025-088", note: "" },
  { id: "GD-2026-1179", date: "2026-05-26", kind: "chi", amount: 84_000_000, source: "Tiền mặt - Quỹ Bình Dương", party: "VPP An Khang", project: "—", category: "Vật tư · Văn phòng phẩm Q2", note: "" },
  { id: "GD-2026-1178", date: "2026-05-25", kind: "chi", amount: 1_840_000_000, source: "Tiền gửi · Vietcombank", party: "Bê tông Hà Tiên 1", project: "Cao ốc Sao Mai · TTTM Đông Phố", category: "Vật tư · Bê tông tươi", note: "TT cụm 3 phiếu xuất" },
  { id: "GD-2026-1177", date: "2026-05-25", kind: "thu", amount: 320_000_000, source: "Tiền gửi · ACB", party: "Hoàn ứng - Trần V. Hùng", project: "Biệt thự Phú Mỹ", category: "Tạm ứng còn lại đợt 1", note: "" },
  { id: "GD-2026-1176", date: "2026-05-24", kind: "chi", amount: 482_000_000, source: "Tiền gửi · BIDV", party: "Gạch Đồng Tâm", project: "Riverside Garden", category: "Vật tư · Gạch ốp lát", note: "" },
  { id: "GD-2026-1175", date: "2026-05-24", kind: "chi", amount: 184_000_000, source: "Tiền gửi · BIDV", party: "Cơ quan thuế Q.1", project: "—", category: "Nghĩa vụ NN · TNCN T5", note: "Auto từ Nghĩa vụ NN" },
];

// Project detail tabs data ───────────────────────────────────
const projectDetail = {
  ...projects[0],
  milestones: [
    { id: 1, name: "Cọc khoan nhồi + tầng hầm B1-B2", from: "2025-03-18", to: "2025-08-30", progress: 1.0, status: "done" },
    { id: 2, name: "Phần thân tầng 1-8", from: "2025-09-01", to: "2026-02-28", progress: 1.0, status: "done" },
    { id: 3, name: "Phần thân tầng 9-15", from: "2026-03-01", to: "2026-06-30", progress: 0.74, status: "doing" },
    { id: 4, name: "Phần thân tầng 16-22 + mái", from: "2026-07-01", to: "2026-09-30", progress: 0, status: "todo" },
    { id: 5, name: "MEP + Hoàn thiện + Bàn giao", from: "2026-08-01", to: "2026-12-15", progress: 0, status: "todo" },
  ],
  cost: { plan: 165_000_000_000, committed: 142_300_000_000, paid: 118_200_000_000 },
  topSuppliers: [
    { name: "Bê tông Hà Tiên 1", value: 18_400_000_000, share: 0.13 },
    { name: "Thép Pomina", value: 14_200_000_000, share: 0.10 },
    { name: "MEP Vinasing", value: 9_800_000_000, share: 0.07 },
    { name: "Gạch Nam Hương", value: 6_400_000_000, share: 0.045 },
  ],
};

Object.assign(window, {
  ERP_DATA: { projects, kpis, cashflow, approvals, obligations, activity, supplierDebt, tasks, ledger, projectDetail },
  fmtVND, fmtDate, fmtDateShort,
});
