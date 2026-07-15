// Dashboard — finance/cashflow focused.

function Sparkline({ data, color = "currentColor", w = 80, h = 36 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const fillD = d + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <path d={fillD} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function KpiCard({ label, value, unit, delta, sub, spark, tone, prefix = "", compact = true }) {
  const toneColors = {
    primary: "var(--primary)", info: "var(--info)", accent: "var(--accent)", danger: "var(--danger)",
  };
  const color = toneColors[tone] || "var(--fg-muted)";
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span style={{ width: 6, height: 6, borderRadius: 50, background: color }} />
        {label}
      </div>
      <div className="kpi-value">
        {prefix}{fmtVND(value, { compact }).replace(" ₫", "")}
        <span className="kpi-unit"> {unit || "₫"}</span>
      </div>
      <div className="kpi-meta">
        <span className={"kpi-delta " + (delta >= 0 ? "up" : "down")}>
          {delta >= 0 ? <Icon.ArrowUp size={11} /> : <Icon.ArrowDown size={11} />}
          {Math.abs(delta).toFixed(1)}%
        </span>
        <span style={{ color: "var(--fg-subtle)" }}>vs 30 ngày trước</span>
        <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }}>{sub}</span>
      </div>
      <div className="kpi-spark" style={{ color }}>
        <Sparkline data={spark} color={color} w={120} h={48} />
      </div>
    </div>
  );
}

function CashflowChart({ data }) {
  const W = 720, H = 240, PAD_L = 44, PAD_B = 28, PAD_T = 8, PAD_R = 12;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(...data.flatMap((d) => [d.inflow, d.outflow])) * 1.1;
  const barW = innerW / data.length;
  const gap = 4;
  const half = (barW - gap * 3) / 2;
  const yScale = (v) => PAD_T + innerH - (v / max) * innerH;

  // y-axis ticks
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];

  // Net line
  const net = data.map((d, i) => {
    const x = PAD_L + i * barW + barW / 2;
    const y = yScale(d.inflow - d.outflow > 0 ? d.inflow - d.outflow : 0) - 4;
    return [x, y];
  });
  const netPath = net.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  const [hover, setHover] = React.useState(null);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* y grid + labels */}
        {ticks.map((t, i) => {
          const y = yScale(t);
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 3" />
              <text x={PAD_L - 8} y={y + 3} fontSize="10" fill="var(--fg-subtle)" textAnchor="end" fontFamily="var(--font-mono)">
                {t.toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={PAD_L + i * barW + barW / 2} y={H - 10}
                fontSize="10" fill="var(--fg-subtle)" textAnchor="middle">
            {d.m}
          </text>
        ))}
        {/* bars */}
        {data.map((d, i) => {
          const x0 = PAD_L + i * barW + gap;
          const inH = (d.inflow / max) * innerH;
          const outH = (d.outflow / max) * innerH;
          const isLast = i === data.length - 1;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
               style={{ cursor: "pointer" }}>
              <rect x={x0} y={PAD_T + innerH - inH} width={half} height={inH}
                    fill="var(--success)" opacity={isLast ? 1 : 0.85} rx="2" />
              <rect x={x0 + half + gap} y={PAD_T + innerH - outH} width={half} height={outH}
                    fill="var(--accent)" opacity={isLast ? 1 : 0.85} rx="2" />
              {hover === i && (
                <rect x={x0 - 2} y={PAD_T} width={half * 2 + gap + 4} height={innerH}
                      fill="var(--fg)" opacity="0.04" rx="3" />
              )}
            </g>
          );
        })}
        {/* net line */}
        <path d={netPath} fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeDasharray="3 3" opacity="0.7" />
        {net.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--primary)" />
        ))}
      </svg>
      {hover != null && (
        <div style={{
          position: "absolute", left: `${(PAD_L + hover * (innerW / data.length) + (innerW / data.length) / 2) / W * 100}%`,
          top: 0, transform: "translateX(-50%)",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6,
          padding: "8px 10px", boxShadow: "var(--shadow-md)", fontSize: 11, pointerEvents: "none",
          minWidth: 130,
        }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{data[hover].m}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--success)" }}>Thu</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{data[hover].inflow.toFixed(1)} tỷ</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--accent)" }}>Chi</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{data[hover].outflow.toFixed(1)} tỷ</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4,
                        paddingTop: 4, borderTop: "1px solid var(--border)" }}>
            <span style={{ color: "var(--fg-muted)" }}>Ròng</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600,
                           color: data[hover].inflow - data[hover].outflow >= 0 ? "var(--success)" : "var(--danger)" }}>
              {(data[hover].inflow - data[hover].outflow > 0 ? "+" : "")}
              {(data[hover].inflow - data[hover].outflow).toFixed(1)} tỷ
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsList({ items, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((a) => {
        const u = a.urgency === "high" ? "danger" : a.urgency === "med" ? "warning" : "default";
        return (
          <div key={a.id} onClick={() => onOpen(a)} style={{
            padding: "12px 20px", borderBottom: "1px solid var(--border)",
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", cursor: "pointer",
            transition: "background 120ms",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
          onMouseLeave={(e) => e.currentTarget.style.background = ""}>
            <div style={{
              width: 32, height: 32, borderRadius: 6, background: "var(--surface-2)",
              display: "grid", placeItems: "center", color: "var(--fg-muted)",
            }}>
              {a.type === "thanh-toan" ? <Icon.Wallet size={15} /> : <Icon.Clipboard size={15} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)" }}>{a.id}</span>
                <span style={{ color: "var(--fg-subtle)" }}>·</span>
                <span>{a.project}</span>
                <span style={{ color: "var(--fg-subtle)" }}>·</span>
                <span>{a.from}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              {a.amount && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
                  {fmtVND(a.amount, { compact: true })}
                </div>
              )}
              <span className={"badge badge-" + u}><span className="dot" />Chờ {a.waiting}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ObligationsList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((o, i) => {
        const tone = o.status === "paid" ? "success" : o.status === "overdue" ? "danger" : o.status === "due" ? "warning" : "info";
        const label = o.status === "paid" ? "Đã nộp" : o.status === "overdue" ? "Quá hạn" : o.status === "due" ? "Sắp đến hạn" : "Sắp tới";
        return (
          <div key={i} style={{
            padding: "10px 20px", borderBottom: "1px solid var(--border)",
            display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
          }}>
            <div style={{ width: 34, padding: "3px 6px", borderRadius: 4, background: "var(--surface-2)",
                          fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, textAlign: "center",
                          color: "var(--fg-muted)" }}>
              {o.code}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{o.name}</div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>Hạn nộp {fmtDate(o.due)}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>
              {fmtVND(o.amount, { compact: true })}
            </div>
            <span className={"badge badge-" + tone}><span className="dot" />{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActivityFeed({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {items.map((a, i) => {
        const Ic = Icon[a.icon] || Icon.Check;
        const toneBg = {
          success: "var(--success-soft)", danger: "var(--danger-soft)", primary: "var(--primary-soft)",
          info: "var(--info-soft)", default: "var(--surface-2)",
        }[a.tone] || "var(--surface-2)";
        const toneFg = {
          success: "var(--success)", danger: "var(--danger)", primary: "var(--primary)",
          info: "var(--info)", default: "var(--fg-muted)",
        }[a.tone] || "var(--fg-muted)";
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12,
            padding: "11px 20px", borderBottom: "1px solid var(--border)", alignItems: "center",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: toneBg,
              display: "grid", placeItems: "center", color: toneFg,
            }}>
              <Ic size={14} />
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>{a.who}</span>{" "}
              <span style={{ color: "var(--fg-muted)" }}>{a.what}</span>{" "}
              <span style={{ fontWeight: 500 }}>{a.target}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{a.time}</div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ onApprovalOpen, onNavigate }) {
  const { kpis, cashflow, approvals, obligations, activity } = window.ERP_DATA;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Bảng điều khiển tài chính</div>
          <div className="page-sub">
            Tổng quan dòng tiền, công nợ, phê duyệt và nghĩa vụ thuế · Thứ ba, 27/05/2026
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><Icon.Download size={13} />Xuất báo cáo</button>
          <button className="btn btn-primary btn-sm"><Icon.Plus size={13} />Tạo giao dịch</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Dòng tiền 12 tháng</div>
              <div className="card-sub">Thu vs Chi · đơn vị: tỷ đồng · cập nhật lúc 11:42</div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--success)" }} />Thu
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--accent)" }} />Chi
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
                <span style={{ width: 14, height: 2, background: "var(--primary)" }} />Ròng
              </span>
              <div className="divider" />
              <button className="btn btn-ghost btn-sm">12 tháng <Icon.ChevronDown size={12} /></button>
            </div>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <CashflowChart data={cashflow} />
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <div>
              <div className="card-title">Chờ phê duyệt</div>
              <div className="card-sub">5 phiếu cần xử lý</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("van-hanh-phieu-phoi-hop")}>
              Tất cả <Icon.ArrowRight size={12} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <ApprovalsList items={approvals} onOpen={onApprovalOpen} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Nghĩa vụ Nhà nước · Tháng 5-6/2026</div>
              <div className="card-sub">Phải nộp · cảnh báo BHXH quá hạn</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("tai-chinh")}>
              Chi tiết <Icon.ArrowRight size={12} />
            </button>
          </div>
          <ObligationsList items={obligations} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Hoạt động gần đây</div>
              <div className="card-sub">Cập nhật theo thời gian thực</div>
            </div>
            <button className="btn btn-ghost btn-sm">Lọc <Icon.Filter size={12} /></button>
          </div>
          <ActivityFeed items={activity} />
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
