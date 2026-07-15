// Projects list + detail screens.

const STATUS_LABEL = { active: "Đang thi công", closed: "Hoàn thành", pending: "Sắp khởi công" };
const STATUS_TONE = { active: "primary", closed: "success", pending: "default" };
const RISK_LABEL = { ok: "An toàn", warning: "Cần chú ý", danger: "Cảnh báo" };
const RISK_TONE = { ok: "success", warning: "warning", danger: "danger" };

function ProjectsList({ onOpen }) {
  const { projects } = window.ERP_DATA;
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState({ key: "deadline", dir: "asc" });

  let rows = projects.filter((p) => statusFilter === "all" || p.status === statusFilter);
  if (search.trim()) {
    const s = search.toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.manager.toLowerCase().includes(s));
  }
  rows = [...rows].sort((a, b) => {
    let va = a[sortBy.key], vb = b[sortBy.key];
    if (typeof va === "string") return sortBy.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortBy.dir === "asc" ? va - vb : vb - va;
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalDebt = rows.reduce((s, r) => s + r.debt, 0);
  const active = rows.filter((r) => r.status === "active").length;

  const Sort = ({ k, children, align }) => (
    <th onClick={() => setSortBy({ key: k, dir: sortBy.key === k && sortBy.dir === "asc" ? "desc" : "asc" })}
        style={{ cursor: "pointer", textAlign: align || "left" }}>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        {children}
        {sortBy.key === k && (sortBy.dir === "asc" ? <Icon.ArrowUp size={11} /> : <Icon.ArrowDown size={11} />)}
      </span>
    </th>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Dự án</div>
          <div className="page-sub">{rows.length} dự án · {active} đang thi công · Tổng giá trị {fmtVND(totalValue, { compact: true })}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Upload size={13} />Nhập Excel</button>
          <button className="btn btn-primary btn-sm"><Icon.Plus size={13} />Dự án mới</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tổng giá trị HĐ</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(totalValue, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Công nợ NCC</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(totalDebt, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tiến độ trung bình</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {Math.round(rows.filter((r) => r.status === "active").reduce((s, r) => s + r.progress, 0) / Math.max(1, rows.filter((r) => r.status === "active").length) * 100)}%
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Đang cảnh báo</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--danger)" }}>
            {rows.filter((r) => r.riskLevel !== "ok").length} <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>dự án</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "5px 10px" }}>
            <Icon.Search size={13} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mã, QLDA…"
                   style={{ border: 0, background: "transparent", outline: "none", fontSize: 12.5, color: "var(--fg)", width: 220 }} />
          </div>
          {[["all","Tất cả"],["active","Đang thi công"],["pending","Sắp KC"],["closed","Hoàn thành"]].map(([k, v]) => (
            <div key={k} className={"chip" + (statusFilter === k ? " active" : "")} onClick={() => setStatusFilter(k)}>{v}</div>
          ))}
          <div className="divider" />
          <div className="chip">Pháp nhân: Tất cả <Icon.ChevronDown size={11} /></div>
          <div className="chip">QLDA: Tất cả <Icon.ChevronDown size={11} /></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm"><Icon.Filter size={13} />Bộ lọc nâng cao</button>
            <button className="btn btn-ghost btn-sm"><Icon.Download size={13} />Xuất</button>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <Sort k="code">Mã DA</Sort>
                <Sort k="name">Tên dự án</Sort>
                <th>Pháp nhân</th>
                <Sort k="value" align="right">Giá trị HĐ</Sort>
                <Sort k="progress">Tiến độ</Sort>
                <Sort k="debt" align="right">Công nợ</Sort>
                <Sort k="deadline">Deadline</Sort>
                <th>Đội</th>
                <th>Trạng thái</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.id)}>
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{p.code}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{p.address} · QLDA {p.manager}</div>
                  </td>
                  <td><span className="badge badge-default">{p.entity}</span></td>
                  <td className="num">{fmtVND(p.value, { compact: true })}</td>
                  <td style={{ width: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="progress" style={{ flex: 1 }}>
                        <div className="bar" style={{ width: `${p.progress * 100}%` }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, minWidth: 32, textAlign: "right" }}>{Math.round(p.progress * 100)}%</span>
                    </div>
                  </td>
                  <td className="num" style={{ color: p.debt > 10_000_000_000 ? "var(--danger)" : "var(--fg)" }}>
                    {p.debt ? fmtVND(p.debt, { compact: true }) : "—"}
                  </td>
                  <td>{fmtDate(p.deadline)}</td>
                  <td>
                    <div className="avatars">
                      {p.team.slice(0, 4).map((t, i) => <div key={i} className="avatar" title={t}>{t}</div>)}
                      {p.team.length > 4 && <div className="avatar">+{p.team.length - 4}</div>}
                    </div>
                  </td>
                  <td><span className={"badge badge-" + STATUS_TONE[p.status]}><span className="dot" />{STATUS_LABEL[p.status]}</span></td>
                  <td className="col-actions">
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); }}><Icon.More size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ id, onBack }) {
  const { projectDetail } = window.ERP_DATA;
  const p = projectDetail;
  const [tab, setTab] = React.useState("overview");
  const remaining = p.cost.plan - p.cost.paid;

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>
            <Icon.ChevronLeft size={13} /> Quay lại danh sách
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-muted)" }}>{p.code}</span>
            <span className={"badge badge-" + STATUS_TONE[p.status]}><span className="dot" />{STATUS_LABEL[p.status]}</span>
            <span className={"badge badge-" + RISK_TONE[p.riskLevel]}><span className="dot" />{RISK_LABEL[p.riskLevel]}</span>
          </div>
          <div className="page-title" style={{ marginTop: 4 }}>{p.name}</div>
          <div className="page-sub">
            <Icon.Building size={12} style={{ verticalAlign: -2 }} /> {p.address} ·
            <Icon.User size={12} style={{ marginLeft: 8, verticalAlign: -2 }} /> QLDA {p.manager} ·
            <Icon.Calendar size={12} style={{ marginLeft: 8, verticalAlign: -2 }} /> {fmtDate(p.startedAt)} → {fmtDate(p.deadline)}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Edit size={13} />Chỉnh sửa</button>
          <button className="btn btn-secondary btn-sm"><Icon.Plus size={13} />Phiếu phối hợp</button>
          <button className="btn btn-primary btn-sm"><Icon.Receipt size={13} />Tạo đợt thanh toán</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Giá trị hợp đồng</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(p.value, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6 }}>Đã ghi nhận doanh thu {fmtVND(p.value * 0.62, { compact: true }).replace(" ₫", " ₫")}</div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Chi phí kế hoạch</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(p.cost.plan, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
          <div className="progress" style={{ marginTop: 10 }}>
            <div className="bar" style={{ width: `${(p.cost.paid / p.cost.plan) * 100}%` }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6 }}>
            Đã chi {fmtVND(p.cost.paid, { compact: true })} · Cam kết {fmtVND(p.cost.committed, { compact: true })}
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Còn lại</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--success)" }}>
            {fmtVND(remaining, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6 }}>{Math.round((remaining / p.cost.plan) * 100)}% ngân sách còn lại</div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Công nợ NCC</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: p.debt > 10_000_000_000 ? "var(--danger)" : "var(--fg)" }}>
            {fmtVND(p.debt, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6 }}>{p.topSuppliers.length} NCC chính</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tabs">
          {[["overview","Tổng quan"],["progress","Tiến độ"],["cost","Chi phí · Công nợ"],["docs","Hồ sơ"],["team","Đội ngũ"]].map(([k, v]) => (
            <div key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{v}</div>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 0 }}>
            <div style={{ padding: 20, borderRight: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Tiến độ tổng thể</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {p.milestones.map((m) => (
                  <div key={m.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 50,
                          background: m.status === "done" ? "var(--success-soft)" : m.status === "doing" ? "var(--primary-soft)" : "var(--surface-2)",
                          color: m.status === "done" ? "var(--success)" : m.status === "doing" ? "var(--primary)" : "var(--fg-subtle)",
                          display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700,
                        }}>
                          {m.status === "done" ? <Icon.Check size={11} /> : m.id}
                        </span>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                        {fmtDateShort(m.from)} → {fmtDateShort(m.to)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 26 }}>
                      <div className={"progress" + (m.status === "doing" ? "" : m.status === "done" ? " success" : "")} style={{ flex: 1 }}>
                        <div className="bar" style={{ width: `${m.progress * 100}%` }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, minWidth: 32, textAlign: "right", color: "var(--fg-muted)" }}>{Math.round(m.progress * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 12 }}>NCC chính theo cam kết</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {p.topSuppliers.map((s, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
                        {fmtVND(s.value, { compact: true })}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="progress" style={{ flex: 1 }}>
                        <div className="bar" style={{ width: `${s.share / 0.15 * 100}%` }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", minWidth: 40, textAlign: "right" }}>{(s.share * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, padding: 14, background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon.Sparkle size={13} /> Gợi ý từ hệ thống
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5 }}>
                  Cam kết với Bê tông Hà Tiên 1 đang chiếm 13% chi phí kế hoạch. Hợp đồng nguyên tắc còn 2.4 tỷ. Cân nhắc đàm phán giá đơn vị mới cho phần thân tầng 16-22.
                </div>
              </div>
            </div>
          </div>
        )}

        {tab !== "overview" && (
          <div style={{ padding: 60, textAlign: "center", color: "var(--fg-subtle)", fontSize: 13 }}>
            <Icon.Folder size={28} />
            <div style={{ marginTop: 10 }}>Tab "{tab}" — chưa được dựng trong prototype này.</div>
          </div>
        )}
      </div>
    </div>
  );
}

window.ProjectsList = ProjectsList;
window.ProjectDetail = ProjectDetail;
