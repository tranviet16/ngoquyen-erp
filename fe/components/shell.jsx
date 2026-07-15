// App shell: sidebar + topbar + theme/variant toggles.
// Sidebar structure is locked to match the existing app exactly
// (see ngoquyyen-erp/components/layout/app-sidebar.tsx).

const NAV_GROUPS = [
  { label: "Tổng quan", items: [
    { key: "dashboard", label: "Bảng điều khiển", icon: "Dashboard" },
    { key: "master-data", label: "Dữ liệu nền tảng", icon: "Database" },
  ]},
  { label: "Dự án & Sản xuất", items: [
    { key: "du-an", label: "Dự án xây dựng", icon: "Building" },
    { key: "vat-tu-ncc", label: "Vật tư – Nhà cung cấp", icon: "Package" },
    { key: "sl-dt", label: "Sản lượng – Doanh thu", icon: "Trending" },
  ]},
  { label: "Tài chính & Công nợ", items: [
    { key: "cong-no-vt", label: "Công nợ vật tư", icon: "Receipt", count: 8 },
    { key: "cong-no-nc", label: "Công nợ nhân công", icon: "HardHat" },
    { key: "tai-chinh", label: "Tài chính NQ", icon: "Wallet" },
    { key: "thanh-toan-ke-hoach", label: "KH thanh toán", icon: "CircleDollar" },
    { key: "thanh-toan-tong-hop", label: "Tổng hợp TT tháng", icon: "Spreadsheet" },
  ]},
  { label: "Vận hành", items: [
    { key: "van-hanh-cong-viec", label: "Bảng công việc", icon: "Kanban", count: 11 },
    { key: "van-hanh-phieu-phoi-hop", label: "Phiếu phối hợp", icon: "Clipboard", count: 5 },
    { key: "van-hanh-hieu-suat", label: "Hiệu suất", icon: "Trending" },
    { key: "thong-bao", label: "Thông báo", icon: "Bell", count: 3 },
  ]},
  { label: "Quản trị", items: [
    { key: "admin-import", label: "Nhập dữ liệu", icon: "Upload" },
    { key: "admin-phong-ban", label: "Phòng ban", icon: "Users" },
    { key: "admin-nguoi-dung", label: "Người dùng", icon: "User" },
    { key: "admin-permissions", label: "Phân quyền", icon: "Shield" },
  ]},
];

const CRUMBS = {
  "dashboard": ["Tổng quan", "Bảng điều khiển"],
  "master-data": ["Tổng quan", "Dữ liệu nền tảng"],
  "du-an": ["Dự án & Sản xuất", "Dự án xây dựng"],
  "du-an-detail": ["Dự án & Sản xuất", "Dự án xây dựng", "Cao ốc Văn Phòng Sao Mai"],
  "vat-tu-ncc": ["Dự án & Sản xuất", "Vật tư – Nhà cung cấp"],
  "sl-dt": ["Dự án & Sản xuất", "Sản lượng – Doanh thu"],
  "cong-no-vt": ["Tài chính & Công nợ", "Công nợ vật tư"],
  "cong-no-nc": ["Tài chính & Công nợ", "Công nợ nhân công"],
  "tai-chinh": ["Tài chính & Công nợ", "Tài chính NQ"],
  "thanh-toan-ke-hoach": ["Tài chính & Công nợ", "KH thanh toán"],
  "thanh-toan-tong-hop": ["Tài chính & Công nợ", "Tổng hợp TT tháng"],
  "van-hanh-cong-viec": ["Vận hành", "Bảng công việc"],
  "van-hanh-phieu-phoi-hop": ["Vận hành", "Phiếu phối hợp"],
  "van-hanh-hieu-suat": ["Vận hành", "Hiệu suất"],
  "thong-bao": ["Vận hành", "Thông báo"],
  "admin-import": ["Quản trị", "Nhập dữ liệu"],
  "admin-phong-ban": ["Quản trị", "Phòng ban"],
  "admin-nguoi-dung": ["Quản trị", "Người dùng"],
  "admin-permissions": ["Quản trị", "Phân quyền"],
};

function Sidebar({ route, setRoute }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">NQ</div>
        <div>
          <div className="brand-name">Ngô Quyền ERP</div>
          <div className="brand-sub">Xây dựng</div>
        </div>
      </div>
      <div className="nav">
        {NAV_GROUPS.map((g) => (
          <div className="nav-group" key={g.label}>
            <div className="nav-group-label">{g.label}</div>
            {g.items.map((item) => {
              const Ic = Icon[item.icon];
              const isActive = route === item.key || (item.key === "du-an" && route === "du-an-detail");
              return (
                <div key={item.key} className={"nav-item" + (isActive ? " active" : "")}
                     onClick={() => setRoute(item.key)}>
                  <Ic />
                  <span>{item.label}</span>
                  {item.count != null && <span className="count">{item.count}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <div className="avatar">PH</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">Phạm T. Hoa</div>
          <div className="user-role">Giám đốc Tài chính</div>
        </div>
        <button className="icon-btn" title="Đăng xuất"><Icon.Logout size={15} /></button>
      </div>
    </aside>
  );
}

function Topbar({ route, theme, setTheme, variant, setVariant, onOpenNotif, onOpenSearch }) {
  const crumbs = CRUMBS[route] || ["—"];
  return (
    <header className="topbar">
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep"><Icon.ChevronRight size={12} /></span>}
            <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </nav>
      <div className="topbar-spacer" />
      <div className="search" onClick={onOpenSearch}>
        <Icon.Search size={14} />
        <span>Tìm dự án, NCC, phiếu phối hợp…</span>
        <span className="kbd">⌘K</span>
      </div>
      <div className="divider" />
      <div style={{ display: "flex", gap: 2 }}>
        <button className="icon-btn" title="Đổi theme"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Icon.Moon size={16} /> : <Icon.Sun size={16} />}
        </button>
        <button className="icon-btn" onClick={onOpenNotif} title="Thông báo">
          <Icon.Bell size={16} />
          <span className="dot" />
        </button>
        <button className="icon-btn" title="Cài đặt"><Icon.Settings size={16} /></button>
      </div>
    </header>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
