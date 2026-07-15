// Main app — wires shell + screens + drawers + notification panel.

function NotifPanel({ onClose }) {
  const items = [
    { tone: "danger", title: "BHXH T5/2026 đã quá hạn nộp", sub: "612 triệu · cần xử lý ngay", time: "3 giờ" },
    { tone: "warning", title: "Đợt thanh toán T5 đợt 4 chờ duyệt", sub: "8.24 tỷ · từ Phạm T. Hoa", time: "5 giờ" },
    { tone: "primary", title: "Phiếu phối hợp PPH-2026-082 cần ý kiến", sub: "Cao ốc Sao Mai · tăng ca đổ sàn 12", time: "2 giờ" },
    { tone: "success", title: "Thu 4.2 tỷ từ Đại Quang Minh", sub: "TTTM Đông Phố · đợt 5", time: "12 phút" },
    { tone: "info", title: "Riverside Garden cập nhật tiến độ 43%", sub: "Nguyễn T. Lan", time: "3 giờ" },
  ];
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" style={{ width: 420 }}>
        <div className="drawer-head">
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>Thông báo</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>5 thông báo mới · cập nhật theo thời gian thực</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon.Close size={16} /></button>
        </div>
        <div className="drawer-body" style={{ padding: 0 }}>
          {items.map((n, i) => (
            <div key={i} style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: 50, background: `var(--${n.tone})`, marginTop: 6 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{n.sub}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{n.time}</div>
            </div>
          ))}
          <div style={{ padding: "16px 22px", display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Đánh dấu đã đọc</button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Cài đặt</button>
          </div>
        </div>
      </div>
    </>
  );
}

function CommandPalette({ onClose, onSelect }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const items = [
    { type: "Trang", label: "Bảng điều khiển tài chính", route: "dashboard", icon: "Dashboard" },
    { type: "Trang", label: "Dự án xây dựng", route: "du-an", icon: "Building" },
    { type: "Trang", label: "Công nợ vật tư", route: "cong-no-vt", icon: "Receipt" },
    { type: "Trang", label: "Công nợ nhân công", route: "cong-no-nc", icon: "HardHat" },
    { type: "Trang", label: "Bảng công việc · Kanban", route: "van-hanh-cong-viec", icon: "Kanban" },
    { type: "Trang", label: "Tài chính NQ · Nhật ký", route: "tai-chinh", icon: "Wallet" },
    { type: "Trang", label: "KH thanh toán", route: "thanh-toan-ke-hoach", icon: "CircleDollar" },
    { type: "Dự án", label: "Cao ốc Văn Phòng Sao Mai", route: "du-an-detail", icon: "Building" },
    { type: "Dự án", label: "Riverside Garden", route: "du-an-detail", icon: "Building" },
    { type: "Hành động", label: "Tạo phiếu phối hợp mới", route: null, icon: "Plus" },
    { type: "Hành động", label: "Tạo đợt thanh toán mới", route: null, icon: "Wallet" },
    { type: "NCC", label: "Bê tông Hà Tiên 1", route: null, icon: "Truck" },
  ];
  const filt = q.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()) || i.type.toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 580, padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)", gap: 10 }}>
          <Icon.Search size={16} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Tìm trang, dự án, NCC, hoặc gõ lệnh…"
                 style={{ border: 0, outline: "none", flex: 1, fontSize: 14, fontFamily: "var(--font-body)", background: "transparent", color: "var(--fg)" }} />
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--fg-subtle)", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 3 }}>ESC</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {filt.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--fg-subtle)", fontSize: 13 }}>Không tìm thấy kết quả</div>
          )}
          {filt.map((it, i) => {
            const Ic = Icon[it.icon];
            return (
              <div key={i}
                   onClick={() => { if (it.route) onSelect(it.route); onClose(); }}
                   style={{
                     display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
                     padding: "10px 12px", borderRadius: 6, cursor: "pointer", alignItems: "center",
                     transition: "background 100ms",
                   }}
                   onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
                   onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                <div style={{ width: 28, height: 28, borderRadius: 5, background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--fg-muted)" }}>
                  <Ic size={14} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</div>
                </div>
                <span className="badge badge-default">{it.type}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ApprovalModal({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 580 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>{item.id}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16, marginTop: 2 }}>{item.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon.Close size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "10px 16px", fontSize: 13 }}>
            <div style={{ color: "var(--fg-muted)" }}>Dự án</div><div style={{ fontWeight: 500 }}>{item.project}</div>
            <div style={{ color: "var(--fg-muted)" }}>Người tạo</div><div style={{ fontWeight: 500 }}>{item.from}</div>
            <div style={{ color: "var(--fg-muted)" }}>Loại</div><div>
              <span className="badge badge-info">{item.type === "thanh-toan" ? "Đợt thanh toán" : "Phiếu phối hợp"}</span>
            </div>
            {item.amount && (<>
              <div style={{ color: "var(--fg-muted)" }}>Giá trị</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmtVND(item.amount)}</div>
            </>)}
            <div style={{ color: "var(--fg-muted)" }}>Thời gian chờ</div><div>{item.waiting}</div>
          </div>

          <div style={{ marginTop: 18, padding: 14, background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Ghi chú từ người tạo</div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Cần phê duyệt gấp để kịp đổ bê tông trước trận mưa cuối tuần. Đã làm việc trước với tổ thi công và ca tăng ca sẽ được tính theo định mức tuần 21.
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 12, color: "var(--fg-muted)" }}>
            Luồng phê duyệt: <strong style={{ color: "var(--fg)" }}>QLDA</strong> → <strong style={{ color: "var(--fg)" }}>Giám đốc TC</strong> → Kế toán
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary">Yêu cầu bổ sung</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ color: "var(--danger)" }}>Từ chối</button>
            <button className="btn btn-primary"><Icon.Check size={14} />Duyệt phiếu</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Theme + variant managed at root, persisted only in-memory.
  const params = new URLSearchParams(window.location.search);
  const initVariant = params.get("variant") === "B" ? "B" : "A";

  const [theme, setTheme] = React.useState(() => params.get("theme") || "light");
  const [variant, setVariant] = React.useState(initVariant);
  const [route, setRoute] = React.useState("dashboard");
  const [supplier, setSupplier] = React.useState(null);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [approval, setApproval] = React.useState(null);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-variant", variant);
  }, [theme, variant]);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setSearchOpen(true);
      } else if (e.key === "Escape") {
        setNotifOpen(false); setSearchOpen(false); setSupplier(null); setApproval(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let screen;
  if (route === "dashboard") screen = <Dashboard onApprovalOpen={setApproval} onNavigate={setRoute} />;
  else if (route === "du-an") screen = <ProjectsList onOpen={() => setRoute("du-an-detail")} />;
  else if (route === "du-an-detail") screen = <ProjectDetail onBack={() => setRoute("du-an")} />;
  else if (route === "cong-no-vt") screen = <CongNo onOpenSupplier={setSupplier} />;
  else if (route === "cong-no-nc") screen = <CongNo onOpenSupplier={setSupplier} ledgerType="nhan-cong" />;
  else if (route === "van-hanh-cong-viec") screen = <Kanban />;
  else if (route === "tai-chinh") screen = <Ledger />;
  else if (route === "sl-dt") screen = <Placeholder title="Sản lượng – Doanh thu" sub="Báo cáo SL-DT theo tháng × dự án × hạng mục" icon="Trending" />;
  else if (route === "van-hanh-phieu-phoi-hop") screen = <Placeholder title="Phiếu phối hợp" sub="Workflow duyệt phiếu nhiều cấp" icon="Clipboard" />;
  else if (route === "van-hanh-hieu-suat") screen = <Placeholder title="Hiệu suất" sub="Dashboard KPI nhân sự và đội thi công" icon="Trending" />;
  else if (route === "vat-tu-ncc") screen = <Placeholder title="Vật tư – Nhà cung cấp" sub="Quản lý NCC, đơn hàng và phiếu nhập" icon="Package" />;
  else if (route === "thanh-toan-ke-hoach") screen = <Placeholder title="KH thanh toán" sub="Đợt thanh toán theo entity × dự án × NCC × hạng mục" icon="CircleDollar" />;
  else if (route === "thanh-toan-tong-hop") screen = <Placeholder title="Tổng hợp TT tháng" sub="Báo cáo tổng hợp thanh toán theo tháng" icon="Spreadsheet" />;
  else if (route === "thong-bao") screen = <Placeholder title="Thông báo" sub="Tất cả thông báo và đăng ký gửi" icon="Bell" />;
  else if (route === "master-data") screen = <Placeholder title="Dữ liệu nền tảng" sub="Pháp nhân, NCC, vật tư, công trình, danh mục thuế" icon="Database" />;
  else if (route.startsWith("admin-")) {
    const titles = {
      "admin-import": ["Nhập dữ liệu", "Bulk import từ SOP Excel · 8 adapter"],
      "admin-phong-ban": ["Phòng ban", "Cấu trúc phòng ban và quyền truy cập phòng ban"],
      "admin-nguoi-dung": ["Người dùng", "Quản lý tài khoản và session"],
      "admin-permissions": ["Phân quyền", "Ma trận 2-axis: module × dự án"],
    };
    const icons = { "admin-import": "Upload", "admin-phong-ban": "Users", "admin-nguoi-dung": "User", "admin-permissions": "Shield" };
    screen = <Placeholder title={titles[route][0]} sub={titles[route][1]} icon={icons[route]} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute} />
      <Topbar
        route={route} theme={theme} setTheme={setTheme}
        variant={variant} setVariant={setVariant}
        onOpenNotif={() => setNotifOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <main className="main">{screen}</main>

      {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
      {supplier && <SupplierDrawer supplier={supplier} onClose={() => setSupplier(null)} />}
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} onSelect={setRoute} />}
      {approval && <ApprovalModal item={approval} onClose={() => setApproval(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
