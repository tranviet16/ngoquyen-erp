// Công nợ vật tư — drill-down debt matrix.

function CongNo({ onOpenSupplier }) {
  const { supplierDebt } = window.ERP_DATA;
  const [expanded, setExpanded] = React.useState({ "NQ Sài Gòn": true, "NQ Bình Dương": true });
  const [tab, setTab] = React.useState("vat-tu");
  const [period, setPeriod] = React.useState("T5/2026");

  const allRows = supplierDebt.flatMap((g) => g.rows);
  const totals = allRows.reduce((a, r) => ({
    tt: a.tt + r.debtTT,
    hd: a.hd + r.debtHD,
    overdue: a.overdue + r.overdue,
  }), { tt: 0, hd: 0, overdue: 0 });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Công nợ phải trả</div>
          <div className="page-sub">Kỳ {period} · 8 pháp nhân · 62 nhà cung cấp · cập nhật 27/05/2026</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Calendar size={13} />Kỳ: {period} <Icon.ChevronDown size={11} /></button>
          <button className="btn btn-secondary btn-sm"><Icon.Download size={13} />Xuất Excel</button>
          <button className="btn btn-primary btn-sm"><Icon.Wallet size={13} />Tạo đợt thanh toán</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tổng dư nợ TT</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(totals.tt, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tổng dư nợ HĐ</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {fmtVND(totals.hd, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Quá hạn</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--danger)" }}>
            {fmtVND(totals.overdue, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>NCC quá hạn</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {allRows.filter((r) => r.overdue > 0).length} <span style={{ fontSize: 13, color: "var(--fg-subtle)" }}>/ {allRows.length}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          {[["vat-tu","Vật tư"],["nhan-cong","Nhân công"],["dich-vu","Dịch vụ"],["khac","Khác"]].map(([k, v]) => (
            <div key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{v}</div>
          ))}
        </div>

        <div className="filter-bar">
          <div className="chip active">Tất cả NCC <span className="x">×</span></div>
          <div className="chip">Pháp nhân: Tất cả <Icon.ChevronDown size={11} /></div>
          <div className="chip">Dự án: Tất cả <Icon.ChevronDown size={11} /></div>
          <div className="chip">Chỉ quá hạn</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm"><Icon.Filter size={13} />Lọc nâng cao</button>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 22 }}></th>
                <th>Nhà cung cấp</th>
                <th>Mã NCC</th>
                <th>Liên hệ</th>
                <th className="num">Dư nợ TT</th>
                <th className="num">Dư nợ HĐ</th>
                <th className="num">Quá hạn</th>
                <th>Lần TT gần nhất</th>
                <th>Hạn TT</th>
                <th>DA</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {supplierDebt.map((group) => {
                const isExp = expanded[group.entity];
                const gT = group.rows.reduce((a, r) => ({
                  tt: a.tt + r.debtTT, hd: a.hd + r.debtHD, overdue: a.overdue + r.overdue
                }), { tt: 0, hd: 0, overdue: 0 });
                return (
                  <React.Fragment key={group.entity}>
                    <tr style={{ background: "var(--surface-2)", cursor: "pointer" }}
                        onClick={() => setExpanded((e) => ({ ...e, [group.entity]: !isExp }))}>
                      <td><Icon.ChevronRight size={13} style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 120ms" }} /></td>
                      <td colSpan="3" style={{ fontWeight: 700, fontFamily: "var(--font-heading)" }}>
                        {group.entity}
                        <span className="badge badge-default" style={{ marginLeft: 8 }}>{group.rows.length} NCC</span>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtVND(gT.tt, { compact: true })}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtVND(gT.hd, { compact: true })}</td>
                      <td className="num" style={{ fontWeight: 700, color: gT.overdue > 0 ? "var(--danger)" : "var(--fg)" }}>{gT.overdue ? fmtVND(gT.overdue, { compact: true }) : "—"}</td>
                      <td colSpan="4"></td>
                    </tr>
                    {isExp && group.rows.map((r) => (
                      <tr key={r.id} onClick={() => onOpenSupplier(r)}>
                        <td></td>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{r.code}</span></td>
                        <td className="muted" style={{ fontSize: 12 }}>{r.contact}</td>
                        <td className="num">{fmtVND(r.debtTT, { compact: true })}</td>
                        <td className="num">{fmtVND(r.debtHD, { compact: true })}</td>
                        <td className="num" style={{ color: r.overdue > 0 ? "var(--danger)" : "var(--fg-subtle)" }}>
                          {r.overdue ? fmtVND(r.overdue, { compact: true }) : "—"}
                        </td>
                        <td className="muted">{fmtDate(r.lastPaid)}</td>
                        <td className="muted">{r.terms}</td>
                        <td className="num muted">{r.projects}</td>
                        <td className="col-actions">
                          <button className="icon-btn" onClick={(e) => e.stopPropagation()}><Icon.More size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--surface-2)" }}>
                <td colSpan="4" style={{ padding: 12, fontWeight: 700 }}>Tổng cộng</td>
                <td className="num" style={{ padding: 12, fontWeight: 700 }}>{fmtVND(totals.tt, { compact: true })}</td>
                <td className="num" style={{ padding: 12, fontWeight: 700 }}>{fmtVND(totals.hd, { compact: true })}</td>
                <td className="num" style={{ padding: 12, fontWeight: 700, color: "var(--danger)" }}>{fmtVND(totals.overdue, { compact: true })}</td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// Supplier drawer ─────────────────────────────────────────────
function SupplierDrawer({ supplier, onClose }) {
  if (!supplier) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>{supplier.code}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16, marginTop: 2 }}>{supplier.name}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon.Close size={16} /></button>
        </div>
        <div className="drawer-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            <div className="card card-pad" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", fontWeight: 600 }}>Dư nợ TT</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, marginTop: 4 }}>{fmtVND(supplier.debtTT, { compact: true })}</div>
            </div>
            <div className="card card-pad" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", fontWeight: 600 }}>Quá hạn</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, marginTop: 4, color: supplier.overdue ? "var(--danger)" : "var(--fg)" }}>
                {supplier.overdue ? fmtVND(supplier.overdue, { compact: true }) : "Không"}
              </div>
            </div>
          </div>

          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Phân rã công nợ theo công trình</div>
          <table className="tbl" style={{ marginBottom: 24 }}>
            <thead>
              <tr><th>Công trình</th><th className="num">Phải trả</th><th className="num">Đã trả</th><th className="num">Còn lại</th></tr>
            </thead>
            <tbody>
              {[
                { proj: "Cao ốc Sao Mai", debit: 1_240_000_000, paid: 480_000_000 },
                { proj: "TTTM Đông Phố", debit: 1_840_000_000, paid: 1_000_000_000 },
                { proj: "Riverside Garden", debit: 240_000_000, paid: 0 },
              ].map((r, i) => (
                <tr key={i}>
                  <td>{r.proj}</td>
                  <td className="num">{fmtVND(r.debit, { compact: true })}</td>
                  <td className="num">{fmtVND(r.paid, { compact: true })}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtVND(r.debit - r.paid, { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Lịch sử giao dịch gần đây</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { date: "2026-05-12", type: "Thanh toán", amount: 1_840_000_000, ref: "GD-2026-1108" },
              { date: "2026-05-02", type: "Nghiệm thu", amount: 2_120_000_000, ref: "NT-2026-094" },
              { date: "2026-04-22", type: "Thanh toán", amount: 1_400_000_000, ref: "GD-2026-1071" },
              { date: "2026-04-10", type: "Nghiệm thu", amount: 980_000_000, ref: "NT-2026-082" },
            ].map((g, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto",
                gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", minWidth: 70 }}>{fmtDate(g.date)}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{g.type}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{g.ref}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13, color: g.type === "Thanh toán" ? "var(--accent)" : "var(--success)" }}>
                  {g.type === "Thanh toán" ? "−" : "+"}{fmtVND(g.amount, { compact: true })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button className="btn btn-secondary"><Icon.Eye size={14} />Xem chi tiết</button>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }}><Icon.Wallet size={14} />Đề nghị thanh toán</button>
          </div>
        </div>
      </div>
    </>
  );
}

// Kanban ──────────────────────────────────────────────────────
function Kanban() {
  const { tasks } = window.ERP_DATA;
  const cols = [
    { key: "todo", title: "Cần làm", tone: "default" },
    { key: "doing", title: "Đang làm", tone: "primary" },
    { key: "review", title: "Đang duyệt", tone: "warning" },
    { key: "done", title: "Hoàn tất", tone: "success" },
  ];
  const priorityTone = { high: "danger", med: "warning", low: "default" };
  const priorityLabel = { high: "Cao", med: "TB", low: "Thấp" };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Công việc</div>
          <div className="page-sub">Bảng kanban · 11 task đang mở · tuần 21/2026</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Filter size={13} />Lọc</button>
          <button className="btn btn-secondary btn-sm"><Icon.Users size={13} />Của tôi</button>
          <button className="btn btn-primary btn-sm"><Icon.Plus size={13} />Task mới</button>
        </div>
      </div>

      <div className="filter-bar" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", marginBottom: 14 }}>
        <div className="chip active">Tất cả dự án</div>
        <div className="chip">Cao ốc Sao Mai</div>
        <div className="chip">Riverside Garden</div>
        <div className="chip">+ 4 dự án khác</div>
        <div className="divider" />
        <div className="chip">Tag: <Icon.ChevronDown size={11} /></div>
        <div className="chip">Người: <Icon.ChevronDown size={11} /></div>
      </div>

      <div className="kanban">
        {cols.map((c) => {
          const items = tasks[c.key];
          return (
            <div className="col" key={c.key}>
              <div className="col-head">
                <span className={"badge badge-" + c.tone}><span className="dot" />{c.title}</span>
                <span className="count">{items.length}</span>
                <button className="icon-btn" style={{ marginLeft: "auto", width: 22, height: 22 }} title="Thêm">
                  <Icon.Plus size={12} />
                </button>
              </div>
              {items.map((t) => (
                <div className="task" key={t.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--fg-subtle)" }}>{t.id}</span>
                    <span className={"badge badge-" + priorityTone[t.priority]} style={{ marginLeft: "auto", fontSize: 10 }}>
                      <span className="dot" />{priorityLabel[t.priority]}
                    </span>
                  </div>
                  <div className="task-title">{t.title}</div>
                  {t.progress != null && (
                    <div className="progress"><div className="bar" style={{ width: `${t.progress * 100}%` }} /></div>
                  )}
                  <div className="task-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon.Folder size={12} /> {t.project}
                    </span>
                  </div>
                  <div className="task-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon.Calendar size={12} /> {fmtDateShort(t.due)}
                    </span>
                    <div className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{t.assignee}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Ledger ──────────────────────────────────────────────────────
function Ledger() {
  const { ledger } = window.ERP_DATA;
  const [filter, setFilter] = React.useState("all");
  const [date, setDate] = React.useState("week");

  const rows = ledger.filter((r) => filter === "all" || r.kind === filter);
  const inTotal = ledger.filter((r) => r.kind === "thu").reduce((s, r) => s + r.amount, 0);
  const outTotal = ledger.filter((r) => r.kind === "chi").reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Nhật ký giao dịch</div>
          <div className="page-sub">Tuần 21 · 24/05 – 27/05/2026 · {ledger.length} giao dịch · 5 tài khoản</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Calendar size={13} />Tuần này <Icon.ChevronDown size={11} /></button>
          <button className="btn btn-secondary btn-sm"><Icon.Download size={13} />Xuất sổ</button>
          <button className="btn btn-primary btn-sm"><Icon.Plus size={13} />Giao dịch mới</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tổng thu</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--success)" }}>
            +{fmtVND(inTotal, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Tổng chi</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--accent)" }}>
            −{fmtVND(outTotal, { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Ròng</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, marginTop: 6, color: inTotal - outTotal >= 0 ? "var(--success)" : "var(--danger)" }}>
            {inTotal - outTotal >= 0 ? "+" : "−"}{fmtVND(Math.abs(inTotal - outTotal), { compact: true }).replace(" ₫","")}<span style={{ color: "var(--fg-subtle)", fontSize: 13, marginLeft: 4 }}>₫</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          {[["all","Tất cả"],["thu","Thu"],["chi","Chi"]].map(([k, v]) => (
            <div key={k} className={"chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)}>{v}</div>
          ))}
          <div className="divider" />
          <div className="chip">Tài khoản <Icon.ChevronDown size={11} /></div>
          <div className="chip">Dự án <Icon.ChevronDown size={11} /></div>
          <div className="chip">Phân loại <Icon.ChevronDown size={11} /></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm"><Icon.Filter size={13} />Lọc nâng cao</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mã GD</th>
                <th>Ngày</th>
                <th>Đối tượng</th>
                <th>Dự án</th>
                <th>Phân loại</th>
                <th>Tài khoản</th>
                <th className="num">Số tiền</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{r.id}</span></td>
                  <td>{fmtDate(r.date)}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.party}</div>
                    {r.note && <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{r.note}</div>}
                  </td>
                  <td className="muted">{r.project}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{r.category}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.source}</td>
                  <td className="num" style={{ color: r.kind === "thu" ? "var(--success)" : "var(--accent)", fontWeight: 600 }}>
                    {r.kind === "thu" ? "+" : "−"}{fmtVND(r.amount, { compact: true })}
                  </td>
                  <td className="col-actions">
                    <button className="icon-btn"><Icon.More size={14} /></button>
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

// Generic placeholder ─────────────────────────────────────────
function Placeholder({ title, sub, icon = "Folder" }) {
  const Ic = Icon[icon];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{sub}</div>
        </div>
      </div>
      <div className="card" style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--fg-muted)" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--surface-2)", display: "grid", placeItems: "center" }}>
          <Ic size={26} />
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15, color: "var(--fg)" }}>Màn hình {title}</div>
        <div style={{ fontSize: 13, maxWidth: 420, textAlign: "center" }}>
          Prototype tập trung vào Dashboard, Dự án, Công nợ, Công việc và Nhật ký giao dịch. Màn hình này hiện chưa được dựng chi tiết.
        </div>
        <button className="btn btn-secondary btn-sm">Đóng góp ý kiến</button>
      </div>
    </div>
  );
}

window.CongNo = CongNo;
window.SupplierDrawer = SupplierDrawer;
window.Kanban = Kanban;
window.Ledger = Ledger;
window.Placeholder = Placeholder;
