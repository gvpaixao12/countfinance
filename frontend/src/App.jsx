import { useState, useEffect } from "react";

const API = "/api";

const CATEGORY_COLORS = {
  Alimentacao: "#f97316",
  Transporte: "#3b82f6",
  Assinaturas: "#a855f7",
  Mercado: "#22c55e",
  Saude: "#ef4444",
  Moradia: "#eab308",
  Renda: "#10b981",
  Transferencias: "#6366f1",
  Compras: "#ec4899",
  Lazer: "#06b6d4",
  Seguros: "#64748b",
  Fatura: "#475569",
  Outros: "#94a3b8",
};

const CATEGORY_ICONS = {
  Alimentacao: "🍔",
  Transporte: "🚗",
  Assinaturas: "📺",
  Mercado: "🛒",
  Saude: "💊",
  Moradia: "🏠",
  Renda: "💰",
  Transferencias: "↗️",
  Compras: "📦",
  Lazer: "🎮",
  Seguros: "🛡️",
  Fatura: "💳",
  Outros: "📌",
};

function formatBRL(v) {
  return Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function DonutChart({ categories }) {
  const total = categories.reduce((s, c) => s + c.total, 0);
  if (!total) return null;
  let cumulative = 0;
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;

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
    return { ...cat, pct, d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}` };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill="none" stroke={CATEGORY_COLORS[seg.name] || "#666"} strokeWidth={22} strokeLinecap="round" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }} />
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

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCat, setSelectedCat] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [showAlerts, setShowAlerts] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const [selectedAccount, setSelectedAccount] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [bills, setBills] = useState([]);
  const [balances, setBalances] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    try {
      const acctParam = selectedAccount ? `&accountId=${selectedAccount}` : "";
      const [txRes, sumRes, alertRes, billsRes, balRes, invRes] = await Promise.all([
        fetch(`${API}/transactions?month=${month}${acctParam}`),
        fetch(`${API}/summary?month=${month}${acctParam}`),
        fetch(`${API}/alerts`),
        fetch(`${API}/bills${selectedAccount ? `?accountId=${selectedAccount}` : ""}`),
        fetch(`${API}/balances`),
        fetch(`${API}/investments`),
      ]);
      const [txData, sumData, alertData, billsData, balData, invData] = await Promise.all([txRes.json(), sumRes.json(), alertRes.json(), billsRes.json(), balRes.json(), invRes.json()]);
      setTransactions(txData);
      setSummary(sumData);
      setAlerts(alertData);
      setBills(billsData);
      setBalances(balData);
      setInvestments(invData);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [month, selectedAccount]);

  async function handleSync() {
    setSyncStatus("syncing");
    try {
      await fetch(`${API}/sync`, { method: "POST" });
      await fetchData();
      setSyncStatus("done");
      setTimeout(() => setSyncStatus("idle"), 2000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    }
  }

  const expenses = transactions.filter((t) => t.category !== "Renda" && t.category !== "Fatura" && t.amount !== 0);
  const totalExpense = summary?.expenses || 0;
  const totalIncome = summary?.income || 0;
  const balance = summary?.balance || 0;

  const categories = summary?.byCategory
    ? Object.entries(summary.byCategory)
        .map(([name, data]) => ({ name, total: data.total, count: data.count }))
        .filter((c) => c.name !== "Fatura")
        .sort((a, b) => b.total - a.total)
    : [];

  const filteredTx = selectedCat ? transactions.filter((t) => t.category === selectedCat) : transactions;

  // Gastos diarios para o grafico de barras
  const dailySpend = {};
  expenses.forEach((t) => {
    const day = new Date(t.date).toISOString().split("T")[0];
    const amt = t.amount > 0 ? t.amount : Math.abs(t.amount);
    dailySpend[day] = (dailySpend[day] || 0) + amt;
  });
  const dailyEntries = Object.entries(dailySpend).sort(([a], [b]) => a.localeCompare(b)).slice(-7);

  function changeMonth(delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  const monthLabel = new Date(month + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const cardStyle = {
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    borderRadius: 16,
    padding: 20,
  };

  if (loading && !summary) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1a0a2e 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1a0a2e 100%)", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", padding: "20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #8b5cf6, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◈</div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.02em" }}>
              fin<span style={{ color: "#a855f7" }}>track</span>
            </h1>
          </div>
          <p style={{ margin: "4px 0 0 42px", fontSize: 11, color: "#64748b" }}>Sincronizado via MeuPluggy</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Seletor de mes */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => changeMonth(-1)} style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}>←</button>
            <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 130, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
            <button onClick={() => changeMonth(1)} style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}>→</button>
          </div>

          {/* Seletor de conta */}
          {balances?.accounts?.length > 1 && (
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", cursor: "pointer", fontSize: 11, fontFamily: "inherit", outline: "none", maxWidth: 160 }}
            >
              <option value="" style={{ background: "#0f172a" }}>Todas as contas</option>
              {balances.accounts.map((acc) => (
                <option key={acc.id} value={acc.id} style={{ background: "#0f172a" }}>
                  {acc.name} {acc.type === "CREDIT" ? "(Cartao)" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Alertas */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowAlerts(!showAlerts)} style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10, padding: "8px 12px", color: "#e2e8f0", cursor: "pointer", fontSize: 14, position: "relative" }}>
              🔔
              {alerts.filter((a) => !a.read).length > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />}
            </button>
            {showAlerts && (
              <div style={{ position: "absolute", top: 44, right: 0, width: 320, ...cardStyle, padding: 0, zIndex: 100, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(148,163,184,0.08)", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>ALERTAS</div>
                {alerts.length === 0 && <div style={{ padding: 16, fontSize: 11, color: "#475569" }}>Nenhum alerta</div>}
                {alerts.map((a) => (
                  <div key={a.id} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(148,163,184,0.04)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{a.type === "budget_warning" ? "⚠️" : a.type === "large_expense" ? "🔴" : "ℹ️"}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "#cbd5e1" }}>{a.message}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#475569" }}>{formatDate(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sync */}
          <button onClick={handleSync} style={{ background: syncStatus === "syncing" ? "rgba(139,92,246,0.2)" : "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10, padding: "8px 14px", color: "#e2e8f0", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 6, transition: "all 0.3s" }}>
            <span style={{ display: "inline-block", animation: syncStatus === "syncing" ? "spin 1s linear infinite" : "none" }}>⟳</span>
            {syncStatus === "syncing" ? "Sincronizando..." : syncStatus === "done" ? "Pronto!" : "Sync"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(15, 23, 42, 0.4)", borderRadius: 10, padding: 3, width: "fit-content" }}>
        {["dashboard", "transações", "categorias", "investimentos"].map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelectedCat(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: activeTab === tab ? "rgba(139,92,246,0.25)" : "transparent", color: activeTab === tab ? "#c4b5fd" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit", textTransform: "capitalize", transition: "all 0.2s" }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            {/* Saldo Real */}
            {(() => {
              const selectedAcc = selectedAccount && balances?.accounts?.find((a) => a.id === selectedAccount);
              const displayBalance = selectedAcc ? selectedAcc.balance : (balances?.total || 0);
              const displayLabel = selectedAcc ? selectedAcc.name : "Saldo Atual";
              const bankCount = balances?.accounts?.filter((a) => a.type === "BANK").length || 0;
              return (
                <div style={{ ...cardStyle, borderLeft: `3px solid ${displayBalance >= 0 ? "#8b5cf6" : "#ef4444"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>◈</div>
                    <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{displayLabel}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: displayBalance >= 0 ? "#c4b5fd" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {formatBRL(displayBalance)}
                  </p>
                  {!selectedAccount && bankCount > 1 && (
                    <p style={{ margin: "4px 0 0", fontSize: 9, color: "#475569" }}>
                      {bankCount} contas
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Entradas */}
            <div style={{ ...cardStyle, borderLeft: "3px solid #10b981" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>↓</div>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Entradas</p>
              </div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#10b981", fontFamily: "'Space Grotesk', sans-serif" }}>
                +{formatBRL(totalIncome)}
              </p>
            </div>

            {/* Saidas */}
            <div style={{ ...cardStyle, borderLeft: "3px solid #ef4444" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>↑</div>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Saidas</p>
              </div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                -{formatBRL(totalExpense)}
              </p>
            </div>
          </div>

          {/* Barra visual entradas vs saidas */}
          {(totalIncome > 0 || totalExpense > 0) && (
            <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Fluxo do Mes</span>
                <span style={{ fontSize: 10, color: "#64748b" }}>
                  {totalIncome > 0 ? `${((totalExpense / totalIncome) * 100).toFixed(0)}% comprometido` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, height: 10, borderRadius: 6, overflow: "hidden", background: "rgba(148,163,184,0.06)" }}>
                <div style={{ height: "100%", borderRadius: "6px 0 0 6px", background: "linear-gradient(90deg, #10b981, #34d399)", width: `${Math.max(totalIncome, totalExpense) > 0 ? (totalIncome / Math.max(totalIncome, totalExpense)) * 100 : 50}%`, transition: "width 0.5s ease" }} />
                <div style={{ height: "100%", borderRadius: "0 6px 6px 0", background: "linear-gradient(90deg, #ef4444, #f87171)", width: `${Math.max(totalIncome, totalExpense) > 0 ? (totalExpense / Math.max(totalIncome, totalExpense)) * 100 : 50}%`, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "#10b981" }}>↓ Entradas {formatBRL(totalIncome)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: balance >= 0 ? "#10b981" : "#ef4444" }}>
                  {balance >= 0 ? "+" : "-"}{formatBRL(balance)}
                </span>
                <span style={{ fontSize: 10, color: "#ef4444" }}>↑ Saidas {formatBRL(totalExpense)}</span>
              </div>
            </div>
          )}

          {/* Main grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Donut */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gastos por Categoria</p>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutChart categories={categories} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  {categories.slice(0, 7).map((cat) => (
                    <button key={cat.name} onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "3px 0", cursor: "pointer", color: "inherit", fontFamily: "inherit", width: "100%" }}>
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
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gastos Diarios</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, paddingTop: 10 }}>
                {dailyEntries.length === 0 && <span style={{ fontSize: 11, color: "#475569" }}>Sem dados no periodo</span>}
                {dailyEntries.map(([day, v], i) => {
                  const max = Math.max(...dailyEntries.map(([, val]) => val));
                  const pct = (v / max) * 100;
                  const label = new Date(day + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#94a3b8" }}>{formatBRL(v)}</span>
                      <div style={{ width: "100%", maxWidth: 32, height: `${Math.max(8, pct)}%`, borderRadius: 6, background: v > 500 ? "linear-gradient(to top, #ef4444, #f97316)" : "linear-gradient(to top, #6d28d9, #a855f7)", transition: "height 0.5s ease", minHeight: 8 }} />
                      <span style={{ fontSize: 9, color: "#475569" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Faturas do Cartao */}
          {(() => {
            const now = new Date();
            const futureBills = bills.filter((b) => new Date(b.dueDate) >= now);
            if (!futureBills.length) return null;

            function formatFullDate(d) {
              return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
            }

            function daysUntil(d) {
              const diff = Math.ceil((new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (diff === 0) return "Vence hoje";
              if (diff === 1) return "Vence amanha";
              return `Vence em ${diff} dias`;
            }

            function BillCard({ bill, highlight }) {
              const isOpen = bill.status === "OPEN";
              const borderColor = isOpen ? "rgba(245,158,11,0.3)" : "rgba(139,92,246,0.2)";
              const bgColor = isOpen ? "rgba(245,158,11,0.06)" : "rgba(139,92,246,0.08)";
              const labelColor = isOpen ? "#fbbf24" : "#c4b5fd";
              const label = isOpen ? "Fatura Aberta" : "Fatura Atual";

              return (
                <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>💳</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: labelColor }}>{label}</span>
                        {bill.brand && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>{bill.brand}</span>}
                        {isOpen && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>parcial</span>}
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>{bill.accountName}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(bill.totalAmount)}</p>
                      {bill.minimumPayment && (
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>Min: {formatBRL(bill.minimumPayment)}</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${borderColor}` }}>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{isOpen ? "Vencimento previsto" : "Vencimento"}: {formatFullDate(bill.dueDate)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: (() => { const d = Math.ceil((new Date(bill.dueDate).getTime() - now.getTime()) / (1000*60*60*24)); return d <= 3 ? "#f97316" : "#10b981"; })() }}>
                      {daysUntil(bill.dueDate)}
                    </span>
                  </div>
                  {bill.creditLimit && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 4 }}>
                        <span>Limite usado</span>
                        <span>{formatBRL(bill.creditLimit - (bill.availableLimit || 0))} / {formatBRL(bill.creditLimit)}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(148,163,184,0.08)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, background: (() => { const pct = ((bill.creditLimit - (bill.availableLimit || 0)) / bill.creditLimit) * 100; return pct > 80 ? "#ef4444" : pct > 60 ? "#f97316" : "#8b5cf6"; })(), width: `${((bill.creditLimit - (bill.availableLimit || 0)) / bill.creditLimit) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Separar faturas abertas (parciais) das fechadas
            const openBills = futureBills.filter((b) => b.status === "OPEN");
            const closedBills = futureBills.filter((b) => b.status !== "OPEN");

            return (
              <div style={{ ...cardStyle, marginTop: 14 }}>
                <p style={{ margin: "0 0 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Faturas do Cartao</p>

                {/* Faturas abertas (parciais, ainda nao fecharam) */}
                {openBills.map((bill) => <BillCard key={bill.id} bill={bill} highlight />)}

                {/* Faturas fechadas futuras */}
                {closedBills.length > 0 && (
                  <>
                    {openBills.length > 0 && <p style={{ margin: "4px 0 8px", fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Proximas Faturas</p>}
                    {closedBills.slice(0, 3).map((bill, i) => (
                      i === 0 && openBills.length === 0
                        ? <BillCard key={bill.id} bill={bill} />
                        : <div key={bill.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 14, opacity: 0.6 }}>💳</span>
                              <div>
                                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>{bill.accountName}{bill.brand ? ` · ${bill.brand}` : ""}</p>
                                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#475569" }}>Vence {formatFullDate(bill.dueDate)}</p>
                              </div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(bill.totalAmount)}</span>
                          </div>
                    ))}
                  </>
                )}
              </div>
            );
          })()}

          {/* Recent transactions */}
          <div style={{ ...cardStyle, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ultimas Transacoes</p>
              <button onClick={() => setActiveTab("transações")} style={{ background: "none", border: "none", color: "#8b5cf6", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Ver todas →</button>
            </div>
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[tx.category] || "📌"}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0" }}>{tx.description}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#475569" }}>{tx.category} · {formatDate(tx.date)}</p>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: tx.category === "Renda" ? "#10b981" : "#ef4444" }}>
                  {tx.category === "Renda" ? "+" : "-"}{formatBRL(tx.amount)}
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
              {selectedCat ? `Transacoes · ${selectedCat}` : "Todas as Transacoes"}
            </p>
            {selectedCat && (
              <button onClick={() => setSelectedCat(null)} style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "4px 10px", color: "#c4b5fd", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>
                ✕ Limpar filtro
              </button>
            )}
          </div>
          {filteredTx.length === 0 && <p style={{ fontSize: 11, color: "#475569" }}>Nenhuma transacao encontrada</p>}
          {filteredTx.map((tx) => (
            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${CATEGORY_COLORS[tx.category] || "#666"}15`, border: `1px solid ${CATEGORY_COLORS[tx.category] || "#666"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {CATEGORY_ICONS[tx.category] || "📌"}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0" }}>{tx.description}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${CATEGORY_COLORS[tx.category] || "#666"}20`, color: CATEGORY_COLORS[tx.category] || "#94a3b8" }}>{tx.category}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{formatDate(tx.date)}</span>
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: tx.category === "Renda" ? "#10b981" : "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                {tx.category === "Renda" ? "+" : "-"}{formatBRL(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "categorias" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {categories.map((cat) => {
            const pctOfTotal = totalExpense ? ((cat.total / totalExpense) * 100).toFixed(1) : "0";
            return (
              <button key={cat.name} onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }} style={{ ...cardStyle, cursor: "pointer", textAlign: "left", transition: "all 0.2s", borderColor: `${CATEGORY_COLORS[cat.name] || "#666"}30` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                      {CATEGORY_ICONS[cat.name] || "📌"} {cat.name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>{cat.count} transacoes</p>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: CATEGORY_COLORS[cat.name] || "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {formatBRL(cat.total)}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(148,163,184,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pctOfTotal}%`, borderRadius: 3, background: `linear-gradient(90deg, ${CATEGORY_COLORS[cat.name] || "#666"}, ${CATEGORY_COLORS[cat.name] || "#666"}aa)`, transition: "width 0.5s ease" }} />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 10, color: "#64748b", textAlign: "right" }}>{pctOfTotal}% do total</p>
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "investimentos" && (() => {
        const activeInvestments = investments.filter((inv) => inv.status === "ACTIVE" || !inv.status);
        const totalInvested = activeInvestments.reduce((s, inv) => s + inv.balance, 0);
        const totalProfit = activeInvestments.reduce((s, inv) => s + (inv.amountProfit || 0), 0);

        const TYPE_LABELS = {
          FIXED_INCOME: "Renda Fixa",
          MUTUAL_FUND: "Fundos",
          EQUITY: "Acoes",
          ETF: "ETF",
          SECURITY: "Previdencia",
          COE: "COE",
          OTHER: "Outros",
        };

        const TYPE_ICONS = {
          FIXED_INCOME: "🏦",
          MUTUAL_FUND: "📊",
          EQUITY: "📈",
          ETF: "📉",
          SECURITY: "🔒",
          COE: "📋",
          OTHER: "💼",
        };

        const byType = {};
        activeInvestments.forEach((inv) => {
          const type = inv.type || "OTHER";
          if (!byType[type]) byType[type] = { items: [], total: 0 };
          byType[type].items.push(inv);
          byType[type].total += inv.balance;
        });

        return (
          <>
            {/* Resumo investimentos */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <div style={{ ...cardStyle, borderLeft: "3px solid #8b5cf6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💎</div>
                  <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Investido</p>
                </div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#c4b5fd", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {formatBRL(totalInvested)}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 9, color: "#475569" }}>{activeInvestments.length} ativo(s)</p>
              </div>
              <div style={{ ...cardStyle, borderLeft: `3px solid ${totalProfit >= 0 ? "#10b981" : "#ef4444"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: totalProfit >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{totalProfit >= 0 ? "↑" : "↓"}</div>
                  <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rendimento Total</p>
                </div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: totalProfit >= 0 ? "#10b981" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {totalProfit >= 0 ? "+" : "-"}{formatBRL(totalProfit)}
                </p>
              </div>
            </div>

            {/* Lista por tipo */}
            {Object.entries(byType).sort(([,a], [,b]) => b.total - a.total).map(([type, group]) => (
              <div key={type} style={{ ...cardStyle, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {TYPE_ICONS[type] || "💼"} {TYPE_LABELS[type] || type}
                  </p>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#c4b5fd", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(group.total)}</span>
                </div>
                {group.items.sort((a, b) => b.balance - a.balance).map((inv) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.name}</p>
                      <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                        {inv.subtype && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>{inv.subtype}</span>}
                        {inv.rateType && inv.rate != null && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.12)", color: "#10b981" }}>{inv.rate}% {inv.rateType}</span>}
                        {inv.fixedAnnualRate != null && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.12)", color: "#10b981" }}>+{inv.fixedAnnualRate}% a.a.</span>}
                        {inv.dueDate && <span style={{ fontSize: 9, color: "#475569" }}>Venc: {formatDate(inv.dueDate)}</span>}
                        {inv.institution && <span style={{ fontSize: 9, color: "#475569" }}>{inv.institution}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(inv.balance)}</p>
                      {inv.amountProfit != null && (
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: inv.amountProfit >= 0 ? "#10b981" : "#ef4444" }}>
                          {inv.amountProfit >= 0 ? "+" : "-"}{formatBRL(inv.amountProfit)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {activeInvestments.length === 0 && (
              <div style={cardStyle}>
                <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>Nenhum investimento encontrado</p>
              </div>
            )}
          </>
        );
      })()}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: "16px 0", borderTop: "1px solid rgba(148,163,184,0.06)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155" }}>
        <span>fintrack · powered by MeuPluggy</span>
        <span>{transactions.length} transacoes carregadas</span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button:hover { opacity: 0.85; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
