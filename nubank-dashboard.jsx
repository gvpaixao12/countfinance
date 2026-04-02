import { useState, useEffect, useRef } from "react";

const MOCK_TRANSACTIONS = [
  { id: 1, date: "2026-04-01", description: "Uber *Trip", amount: -18.9, category: "Transporte", icon: "🚗" },
  { id: 2, date: "2026-04-01", description: "Padaria Mineira", amount: -12.5, category: "Alimentação", icon: "🍞" },
  { id: 3, date: "2026-03-31", description: "Spotify", amount: -21.9, category: "Assinaturas", icon: "🎵" },
  { id: 4, date: "2026-03-31", description: "Amazon Prime", amount: -14.9, category: "Assinaturas", icon: "🎬" },
  { id: 5, date: "2026-03-30", description: "Supermercado BH", amount: -287.43, category: "Mercado", icon: "🛒" },
  { id: 6, date: "2026-03-30", description: "Farmácia Araújo", amount: -45.0, category: "Saúde", icon: "💊" },
  { id: 7, date: "2026-03-29", description: "PIX Recebido - Salário", amount: 5800.0, category: "Renda", icon: "💰" },
  { id: 8, date: "2026-03-29", description: "iFood", amount: -67.8, category: "Alimentação", icon: "🍔" },
  { id: 9, date: "2026-03-28", description: "Posto Shell", amount: -220.0, category: "Transporte", icon: "⛽" },
  { id: 10, date: "2026-03-28", description: "Netflix", amount: -39.9, category: "Assinaturas", icon: "📺" },
  { id: 11, date: "2026-03-27", description: "Aluguel", amount: -1800.0, category: "Moradia", icon: "🏠" },
  { id: 12, date: "2026-03-27", description: "Conta de Luz - Cemig", amount: -189.0, category: "Moradia", icon: "⚡" },
  { id: 13, date: "2026-03-26", description: "Academia Smart Fit", amount: -99.9, category: "Saúde", icon: "🏋️" },
  { id: 14, date: "2026-03-26", description: "Uber *Trip", amount: -22.3, category: "Transporte", icon: "🚗" },
  { id: 15, date: "2026-03-25", description: "Rappi", amount: -54.6, category: "Alimentação", icon: "🥡" },
  { id: 16, date: "2026-03-25", description: "PIX Enviado - João", amount: -150.0, category: "Transferências", icon: "↗️" },
  { id: 17, date: "2026-03-24", description: "Droga Raia", amount: -32.5, category: "Saúde", icon: "💊" },
  { id: 18, date: "2026-03-24", description: "Mercado Livre", amount: -189.9, category: "Compras", icon: "📦" },
  { id: 19, date: "2026-03-23", description: "PIX Recebido - Freelance", amount: 1200.0, category: "Renda", icon: "💰" },
  { id: 20, date: "2026-03-22", description: "Supermercado BH", amount: -198.7, category: "Mercado", icon: "🛒" },
];

const CATEGORY_COLORS = {
  "Alimentação": "#f97316",
  "Transporte": "#3b82f6",
  "Assinaturas": "#a855f7",
  "Mercado": "#22c55e",
  "Saúde": "#ef4444",
  "Moradia": "#eab308",
  "Renda": "#10b981",
  "Transferências": "#6366f1",
  "Compras": "#ec4899",
};

const ALERTS = [
  { id: 1, type: "warning", msg: "Gastos com Alimentação 23% acima da média este mês", time: "2h atrás" },
  { id: 2, type: "info", msg: "Salário creditado: R$ 4.800,00", time: "3d atrás" },
  { id: 3, type: "danger", msg: "Limite de Assinaturas (R$ 100) quase atingido: R$ 76,70", time: "3d atrás" },
];

function formatBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MiniBar({ data, maxVal }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            width: 6,
            borderRadius: 3,
            background: `linear-gradient(to top, #8b5cf6, #c084fc)`,
            height: `${Math.max(4, (v / maxVal) * 40)}px`,
            opacity: 0.6 + (i / data.length) * 0.4,
          }}
        />
      ))}
    </div>
  );
}

function DonutChart({ categories }) {
  const total = categories.reduce((s, c) => s + c.total, 0);
  let cumulative = 0;
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const strokeW = 22;

  const segments = categories.map((cat) => {
    const pct = cat.total / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return {
      ...cat,
      pct,
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => (
        <path
          key={i}
          d={seg.d}
          fill="none"
          stroke={CATEGORY_COLORS[seg.name] || "#666"}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
            transition: "stroke-width 0.2s",
          }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fill: "#e2e8f0", fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
        {formatBRL(total)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: "#94a3b8", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
        total gastos
      </text>
    </svg>
  );
}

function SparkLine({ values, color = "#8b5cf6", w = 120, h = 32 }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NubankDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCat, setSelectedCat] = useState(null);
  const [syncStatus, setSyncStatus] = useState("synced");
  const [showAlerts, setShowAlerts] = useState(false);

  const expenses = MOCK_TRANSACTIONS.filter((t) => t.amount < 0);
  const income = MOCK_TRANSACTIONS.filter((t) => t.amount > 0);
  const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const catMap = {};
  expenses.forEach((t) => {
    if (!catMap[t.category]) catMap[t.category] = { name: t.category, total: 0, count: 0, txs: [] };
    catMap[t.category].total += Math.abs(t.amount);
    catMap[t.category].count++;
    catMap[t.category].txs.push(t);
  });
  const categories = Object.values(catMap).sort((a, b) => b.total - a.total);

  const dailySpend = [120, 287, 67, 1800, 132, 205, 18];

  const handleSync = () => {
    setSyncStatus("syncing");
    setTimeout(() => setSyncStatus("synced"), 2000);
  };

  const filteredTx = selectedCat ? MOCK_TRANSACTIONS.filter((t) => t.category === selectedCat) : MOCK_TRANSACTIONS;

  const cardStyle = {
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    borderRadius: 16,
    padding: 20,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1a0a2e 100%)",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        padding: "20px",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #8b5cf6, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              ◈
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.02em" }}>
              fin<span style={{ color: "#a855f7" }}>track</span>
            </h1>
          </div>
          <p style={{ margin: "4px 0 0 42px", fontSize: 11, color: "#64748b" }}>Nubank • Sincronizado via Pluggy</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              style={{
                background: "rgba(148, 163, 184, 0.08)",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                borderRadius: 10,
                padding: "8px 12px",
                color: "#e2e8f0",
                cursor: "pointer",
                fontSize: 14,
                position: "relative",
              }}
            >
              🔔
              <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
            </button>
            {showAlerts && (
              <div
                style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  width: 320,
                  ...cardStyle,
                  padding: 0,
                  zIndex: 100,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(148,163,184,0.08)", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
                  ALERTAS
                </div>
                {ALERTS.map((a) => (
                  <div key={a.id} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(148,163,184,0.04)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>
                      {a.type === "warning" ? "⚠️" : a.type === "danger" ? "🔴" : "ℹ️"}
                    </span>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "#cbd5e1" }}>{a.msg}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#475569" }}>{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSync}
            style={{
              background: syncStatus === "syncing" ? "rgba(139, 92, 246, 0.2)" : "rgba(148, 163, 184, 0.08)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
              borderRadius: 10,
              padding: "8px 14px",
              color: "#e2e8f0",
              cursor: "pointer",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.3s",
            }}
          >
            <span style={{ display: "inline-block", animation: syncStatus === "syncing" ? "spin 1s linear infinite" : "none" }}>⟳</span>
            {syncStatus === "syncing" ? "Sincronizando..." : "Sync"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(15, 23, 42, 0.4)", borderRadius: 10, padding: 3, width: "fit-content" }}>
        {["dashboard", "transações", "categorias"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedCat(null); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === tab ? "rgba(139, 92, 246, 0.25)" : "transparent",
              color: activeTab === tab ? "#c4b5fd" : "#64748b",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "inherit",
              textTransform: "capitalize",
              transition: "all 0.2s",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Saldo", value: balance, color: balance >= 0 ? "#10b981" : "#ef4444", sparkVals: [4200, 3800, 5100, 4900, 5800, 4300, balance] },
              { label: "Receitas", value: totalIncome, color: "#10b981", sparkVals: [5000, 5800, 6200, 5800, 7000, 5800, totalIncome] },
              { label: "Despesas", value: totalExpense, color: "#f97316", sparkVals: [2800, 3100, 2600, 3400, 2900, 3200, totalExpense] },
            ].map((kpi, i) => (
              <div key={i} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{kpi.label}</p>
                    <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700, color: kpi.color, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatBRL(kpi.value)}
                    </p>
                  </div>
                  <SparkLine values={kpi.sparkVals} color={kpi.color} />
                </div>
              </div>
            ))}
          </div>

          {/* Main grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Donut */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gastos por Categoria</p>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutChart categories={categories} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  {categories.slice(0, 6).map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "none",
                        border: "none",
                        padding: "3px 0",
                        cursor: "pointer",
                        color: "inherit",
                        fontFamily: "inherit",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLORS[cat.name] || "#666" }} />
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{cat.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500 }}>{formatBRL(cat.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Daily spend */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gastos Diários (últimos 7 dias)</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, paddingTop: 10 }}>
                {dailySpend.map((v, i) => {
                  const max = Math.max(...dailySpend);
                  const pct = (v / max) * 100;
                  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#94a3b8" }}>{formatBRL(v)}</span>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 32,
                          height: `${Math.max(8, pct)}%`,
                          borderRadius: 6,
                          background: v > 500 ? "linear-gradient(to top, #ef4444, #f97316)" : "linear-gradient(to top, #6d28d9, #a855f7)",
                          transition: "height 0.5s ease",
                          minHeight: 8,
                        }}
                      />
                      <span style={{ fontSize: 9, color: "#475569" }}>{days[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent transactions preview */}
          <div style={{ ...cardStyle, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Últimas Transações</p>
              <button
                onClick={() => setActiveTab("transações")}
                style={{ background: "none", border: "none", color: "#8b5cf6", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
              >
                Ver todas →
              </button>
            </div>
            {MOCK_TRANSACTIONS.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(148,163,184,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{tx.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0" }}>{tx.description}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#475569" }}>{tx.category} • {tx.date}</p>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: tx.amount > 0 ? "#10b981" : "#e2e8f0" }}>
                  {tx.amount > 0 ? "+" : ""}{formatBRL(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "transações" && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {selectedCat ? `Transações • ${selectedCat}` : "Todas as Transações"}
            </p>
            {selectedCat && (
              <button
                onClick={() => setSelectedCat(null)}
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "4px 10px", color: "#c4b5fd", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}
              >
                ✕ Limpar filtro
              </button>
            )}
          </div>
          {filteredTx.map((tx) => (
            <div
              key={tx.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid rgba(148,163,184,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${CATEGORY_COLORS[tx.category] || "#666"}15`,
                    border: `1px solid ${CATEGORY_COLORS[tx.category] || "#666"}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  {tx.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0" }}>{tx.description}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: `${CATEGORY_COLORS[tx.category] || "#666"}20`,
                        color: CATEGORY_COLORS[tx.category] || "#94a3b8",
                      }}
                    >
                      {tx.category}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{tx.date}</span>
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: tx.amount > 0 ? "#10b981" : "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                {tx.amount > 0 ? "+" : ""}{formatBRL(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "categorias" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {categories.map((cat) => {
            const pctOfTotal = ((cat.total / totalExpense) * 100).toFixed(1);
            return (
              <button
                key={cat.name}
                onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }}
                style={{
                  ...cardStyle,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                  borderColor: `${CATEGORY_COLORS[cat.name] || "#666"}30`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>{cat.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>{cat.count} transações</p>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: CATEGORY_COLORS[cat.name] || "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {formatBRL(cat.total)}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 6, borderRadius: 3, background: "rgba(148,163,184,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pctOfTotal}%`,
                      borderRadius: 3,
                      background: `linear-gradient(90deg, ${CATEGORY_COLORS[cat.name] || "#666"}, ${CATEGORY_COLORS[cat.name] || "#666"}aa)`,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 10, color: "#64748b", textAlign: "right" }}>{pctOfTotal}% do total</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: "16px 0", borderTop: "1px solid rgba(148,163,184,0.06)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155" }}>
        <span>fintrack • powered by Pluggy API</span>
        <span>Última sincronização: há 2 minutos</span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button:hover { opacity: 0.85; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
