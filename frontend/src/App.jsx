import { useState, useEffect, useRef } from "react";

const API = "/api";

const CATEGORY_COLORS = {
  Alimentacao: "#f97316", Transporte: "#3b82f6", Assinaturas: "#a855f7", Mercado: "#22c55e",
  Saude: "#ef4444", Moradia: "#eab308", Renda: "#10b981", Transferencias: "#6366f1",
  Compras: "#ec4899", Lazer: "#06b6d4", Seguros: "#64748b", Fatura: "#475569",
  Investimentos: "#0ea5e9", Rendimentos: "#14b8a6", Emprestimos: "#f59e0b", Outros: "#94a3b8",
};

const CATEGORY_ICONS = {
  Alimentacao: "🍔", Transporte: "🚗", Assinaturas: "📺", Mercado: "🛒", Saude: "💊",
  Moradia: "🏠", Renda: "💰", Transferencias: "↗️", Compras: "📦", Lazer: "🎮",
  Seguros: "🛡️", Fatura: "💳", Investimentos: "📈", Rendimentos: "📊", Emprestimos: "🏦", Outros: "📌",
};

function formatBRL(v) {
  return Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function DonutChart({ categories, hovered, onHover, onClickSegment }) {
  const total = categories.reduce((s, c) => s + c.total, 0);
  if (!total) return null;
  let cumulative = 0;
  const size = 280, cx = size / 2, cy = size / 2, r = 100;

  const segments = categories.map((cat) => {
    const pct = cat.total / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const midAngle = (startAngle + endAngle) / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    return { ...cat, pct, midAngle, d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}` };
  });

  const hoveredSeg = hovered ? segments.find((s) => s.name === hovered) : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      {segments.map((seg, i) => {
        const isHovered = hovered === seg.name;
        const offset = isHovered ? 6 : 0;
        const tx = offset * Math.cos(seg.midAngle);
        const ty = offset * Math.sin(seg.midAngle);
        const isFull = seg.pct > 0.999;
        return isFull ? (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={CATEGORY_COLORS[seg.name] || "#666"}
            strokeWidth={isHovered ? 26 : 18}
            onClick={() => onClickSegment && onClickSegment(seg.name)}
            onMouseEnter={() => onHover(seg.name)}
            onMouseLeave={() => onHover(null)}
            style={{
              filter: isHovered
                ? `drop-shadow(0 4px 12px ${CATEGORY_COLORS[seg.name] || "#666"}88)`
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              cursor: "pointer",
            }}
          />
        ) : (
          <path key={i} d={seg.d} fill="none"
            stroke={CATEGORY_COLORS[seg.name] || "#666"}
            strokeWidth={isHovered ? 26 : 18}
            strokeLinecap="butt"
            onClick={() => onClickSegment && onClickSegment(seg.name)}
            onMouseEnter={() => onHover(seg.name)}
            onMouseLeave={() => onHover(null)}
            style={{
              transform: `translate(${tx}px, ${ty}px)`,
              filter: isHovered
                ? `drop-shadow(0 4px 12px ${CATEGORY_COLORS[seg.name] || "#666"}88)`
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              cursor: "pointer",
              opacity: hovered && !isHovered ? 0.4 : 1,
            }}
          />
        );
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fill: "#e2e8f0", fontSize: hoveredSeg ? 12 : 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s" }}>
        {hoveredSeg ? formatBRL(hoveredSeg.total) : formatBRL(total)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" style={{ fill: "#94a3b8", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s" }}>
        {hoveredSeg ? `${(hoveredSeg.pct * 100).toFixed(1)}%` : "total gastos"}
      </text>
      {hoveredSeg && (
        <text x={cx} y={cy + 24} textAnchor="middle" style={{ fill: CATEGORY_COLORS[hoveredSeg.name] || "#94a3b8", fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
          {hoveredSeg.name}
        </text>
      )}
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCat, setSelectedCat] = useState(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [hoveredCat, setHoveredCat] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileRef = useRef();

  // New account state
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccBank, setNewAccBank] = useState("");
  const [newAccType, setNewAccType] = useState("CHECKING");

  async function fetchData() {
    try {
      const acctParam = selectedAccount ? `&accountId=${selectedAccount}` : "";
      const [txRes, sumRes, accRes] = await Promise.all([
        fetch(`${API}/transactions?month=${month}${acctParam}`),
        fetch(`${API}/summary?month=${month}${acctParam}`),
        fetch(`${API}/accounts`),
      ]);
      const [txData, sumData, accData] = await Promise.all([txRes.json(), sumRes.json(), accRes.json()]);
      setTransactions(txData);
      setSummary(sumData);
      setAccounts(accData);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setLoading(true); fetchData(); }, [month, selectedAccount]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadAccountId) return;

    setUploadStatus({ type: "loading", msg: "Importando..." });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", uploadAccountId);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        const aiMsg = data.aiCategorized ? `, ${data.aiCategorized} categorizadas por IA` : "";
        setUploadStatus({ type: "success", msg: `${data.imported} transacoes importadas (${data.skipped} duplicadas${aiMsg})` });
        fetchData();
        setTimeout(() => { setShowUpload(false); setUploadStatus(null); }, 2000);
      } else {
        setUploadStatus({ type: "error", msg: data.error });
      }
    } catch {
      setUploadStatus({ type: "error", msg: "Erro na importacao" });
    }
  }

  async function handleNewAccount() {
    if (!newAccName || !newAccBank) return;
    await fetch(`${API}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAccName, type: newAccType, bank: newAccBank }),
    });
    setNewAccName(""); setNewAccBank(""); setNewAccType("CHECKING"); setShowNewAccount(false);
    fetchData();
  }

  async function handleDeleteAccount(id) {
    if (!confirm("Apagar conta e todas as transacoes dela?")) return;
    await fetch(`${API}/accounts/${id}`, { method: "DELETE" });
    if (selectedAccount === id) setSelectedAccount("");
    fetchData();
  }

  const totalExpense = summary?.expenses || 0;
  const totalIncome = summary?.income || 0;
  const balance = summary?.balance || 0;
  const invested = summary?.invested || 0;
  const accountBalance = summary?.accountBalance ?? null;

  const categories = summary?.byCategory
    ? Object.entries(summary.byCategory)
        .map(([name, data]) => ({ name, total: data.total, count: data.count }))
        .filter((c) => c.name !== "Fatura")
        .sort((a, b) => b.total - a.total)
    : [];

  const incomeCategories = summary?.byIncomeCategory
    ? Object.entries(summary.byIncomeCategory)
        .map(([name, data]) => ({ name, total: data.total, count: data.count }))
        .sort((a, b) => b.total - a.total)
    : [];

  const notExpense = ["Renda", "Fatura", "Investimentos", "Rendimentos", "Emprestimos"];
  const expenses = transactions.filter((t) => !notExpense.includes(t.category) && t.amount !== 0);
  const filteredTx = selectedCat ? transactions.filter((t) => t.category === selectedCat) : transactions;

  const dailySpend = {};
  expenses.forEach((t) => {
    const day = new Date(t.date).toISOString().split("T")[0];
    dailySpend[day] = (dailySpend[day] || 0) + Math.abs(t.amount);
  });

  // Gera todos os dias do mes
  const [ym, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(ym, mm, 0).getDate();
  const today = new Date().toISOString().split("T")[0];
  const allDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${ym}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    allDays.push({ day: key, total: dailySpend[key] || 0 });
  }
  const maxDaily = Math.max(...allDays.map((d) => d.total), 1);

  function changeMonth(delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  const monthLabel = new Date(month + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const cardStyle = {
    background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(12px)",
    border: "1px solid rgba(148, 163, 184, 0.08)", borderRadius: 16, padding: 20,
  };

  const btnStyle = {
    background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 8, padding: "6px 12px", color: "#e2e8f0", cursor: "pointer", fontSize: 11, fontFamily: "inherit",
  };

  const inputStyle = {
    background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 11, fontFamily: "inherit",
    outline: "none", width: "100%",
  };

  if (loading && !summary) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1a0a2e 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
        Carregando...
      </div>
    );
  }

  return (
    <div className="app-container" style={{ minHeight: "100vh", background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1a0a2e 100%)", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", padding: "20px" }}>
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
          <p style={{ margin: "4px 0 0 42px", fontSize: 11, color: "#64748b" }}>Importacao via OFX / CSV</p>
        </div>
        <div className="header-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Seletor de mes */}
          <div className="month-selector" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => changeMonth(-1)} style={btnStyle}>←</button>
            <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 130, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
            <button onClick={() => changeMonth(1)} style={btnStyle}>→</button>
          </div>

          {/* Seletor de conta */}
          {accounts.length > 1 && (
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ ...btnStyle, maxWidth: 160 }}>
              <option value="" style={{ background: "#0f172a" }}>Todas as contas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} style={{ background: "#0f172a" }}>{acc.name} ({acc.bank})</option>
              ))}
            </select>
          )}

          {/* Upload */}
          <button onClick={() => setShowUpload(true)} style={{ ...btnStyle, background: "rgba(139,92,246,0.2)", borderColor: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
            ↑ Importar
          </button>
        </div>
      </div>

      {/* Modal Upload */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShowUpload(false)}>
          <div style={{ ...cardStyle, width: 420, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>Importar Extrato</h3>

            {accounts.length === 0 ? (
              <p style={{ fontSize: 11, color: "#f97316" }}>Crie uma conta primeiro na aba "Contas"</p>
            ) : (
              <>
                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>CONTA</label>
                <select value={uploadAccountId} onChange={(e) => setUploadAccountId(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
                  <option value="" style={{ background: "#0f172a" }}>Selecione...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} style={{ background: "#0f172a" }}>{acc.name} ({acc.bank})</option>
                  ))}
                </select>

                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>ARQUIVO (.ofx ou .csv)</label>
                <input ref={fileRef} type="file" accept=".ofx,.qfx,.csv" style={{ ...inputStyle, marginBottom: 16, padding: "6px" }} />

                <button onClick={handleUpload} disabled={!uploadAccountId} style={{ ...btnStyle, width: "100%", padding: "10px", background: uploadAccountId ? "rgba(139,92,246,0.3)" : "rgba(148,163,184,0.05)", color: uploadAccountId ? "#c4b5fd" : "#475569" }}>
                  Importar
                </button>

                {uploadStatus && (
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: uploadStatus.type === "success" ? "#10b981" : uploadStatus.type === "error" ? "#ef4444" : "#94a3b8" }}>
                    {uploadStatus.msg}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar" style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(15, 23, 42, 0.4)", borderRadius: 10, padding: 3, width: "fit-content" }}>
        {["dashboard", "transações", "categorias", "contas"].map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelectedCat(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: activeTab === tab ? "rgba(139,92,246,0.25)" : "transparent", color: activeTab === tab ? "#c4b5fd" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit", textTransform: "capitalize", transition: "all 0.2s" }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
            {accountBalance !== null && (
              <div style={{ ...cardStyle, borderLeft: "3px solid #8b5cf6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏦</div>
                  <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Saldo Atual</p>
                </div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#8b5cf6", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(accountBalance)}</p>
              </div>
            )}

            <div style={{ ...cardStyle, borderLeft: "3px solid #10b981" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>↓</div>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Entradas</p>
              </div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#10b981", fontFamily: "'Space Grotesk', sans-serif" }}>+{formatBRL(totalIncome)}</p>
            </div>

            <div style={{ ...cardStyle, borderLeft: "3px solid #ef4444" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>↑</div>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Saidas</p>
              </div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>-{formatBRL(totalExpense)}</p>
            </div>

            <div style={{ ...cardStyle, borderLeft: `3px solid ${balance >= 0 ? "#10b981" : "#ef4444"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: balance >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>=</div>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Fluxo do Mes</p>
              </div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: balance >= 0 ? "#10b981" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                {balance >= 0 ? "+" : "-"}{formatBRL(balance)}
              </p>
            </div>

            {invested > 0 && (
              <div style={{ ...cardStyle, borderLeft: "3px solid #0ea5e9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(14,165,233,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📈</div>
                  <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Investido no Mes</p>
                </div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0ea5e9", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(invested)}</p>
              </div>
            )}
          </div>

          {/* Barra visual */}
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
              <div className="flow-bar-labels" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "#10b981" }}>↓ Entradas {formatBRL(totalIncome)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: balance >= 0 ? "#10b981" : "#ef4444" }}>{balance >= 0 ? "+" : "-"}{formatBRL(balance)}</span>
                <span style={{ fontSize: 10, color: "#ef4444" }}>↑ Saidas {formatBRL(totalExpense)}</span>
              </div>
            </div>
          )}

          {/* Charts grid */}
          <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Gastos por Categoria */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.08em" }}>↑ Saidas por Categoria</p>
              <div className="donut-section" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <DonutChart categories={categories} hovered={hoveredCat} onHover={setHoveredCat} onClickSegment={(name) => { setActiveTab("transações"); setSelectedCat(name); }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                  {categories.slice(0, 7).map((cat) => {
                    const isHovered = hoveredCat === cat.name;
                    const isFaded = hoveredCat && !isHovered;
                    const pct = totalExpense ? ((cat.total / totalExpense) * 100).toFixed(1) : "0";
                    return (
                      <button key={cat.name}
                        onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }}
                        onMouseEnter={() => setHoveredCat(cat.name)}
                        onMouseLeave={() => setHoveredCat(null)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: isHovered ? `${CATEGORY_COLORS[cat.name] || "#666"}15` : "none",
                          border: "none", padding: "5px 6px", cursor: "pointer", color: "inherit",
                          fontFamily: "inherit", width: "100%", borderRadius: 8,
                          transform: isHovered ? "translateX(4px) scale(1.02)" : "translateX(0) scale(1)",
                          opacity: isFaded ? 0.4 : 1,
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: isHovered ? `4px 4px 16px ${CATEGORY_COLORS[cat.name] || "#666"}25, -1px -1px 4px rgba(255,255,255,0.03)` : "none",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: isHovered ? 10 : 8, height: isHovered ? 10 : 8,
                            borderRadius: "50%", background: CATEGORY_COLORS[cat.name] || "#666",
                            boxShadow: isHovered ? `0 0 8px ${CATEGORY_COLORS[cat.name] || "#666"}88` : "none",
                            transition: "all 0.2s",
                          }} />
                          <span style={{ fontSize: 10, color: isHovered ? "#e2e8f0" : "#94a3b8", transition: "color 0.2s" }}>{cat.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isHovered && <span style={{ fontSize: 9, color: CATEGORY_COLORS[cat.name] || "#94a3b8" }}>{pct}%</span>}
                          <span style={{ fontSize: isHovered ? 11 : 10, color: "#e2e8f0", fontWeight: isHovered ? 700 : 500, transition: "all 0.2s" }}>{formatBRL(cat.total)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Entradas por Categoria */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.08em" }}>↓ Entradas por Categoria</p>
              <div className="donut-section" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <DonutChart categories={incomeCategories} hovered={hoveredCat} onHover={setHoveredCat} onClickSegment={(name) => { setActiveTab("transações"); setSelectedCat(name); }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                  {incomeCategories.map((cat) => {
                    const isHovered = hoveredCat === cat.name;
                    const isFaded = hoveredCat && !isHovered;
                    const pct = totalIncome ? ((cat.total / totalIncome) * 100).toFixed(1) : "0";
                    return (
                      <button key={cat.name}
                        onClick={() => { setActiveTab("transações"); setSelectedCat(cat.name); }}
                        onMouseEnter={() => setHoveredCat(cat.name)}
                        onMouseLeave={() => setHoveredCat(null)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: isHovered ? `${CATEGORY_COLORS[cat.name] || "#666"}15` : "none",
                          border: "none", padding: "5px 6px", cursor: "pointer", color: "inherit",
                          fontFamily: "inherit", width: "100%", borderRadius: 8,
                          transform: isHovered ? "translateX(4px) scale(1.02)" : "translateX(0) scale(1)",
                          opacity: isFaded ? 0.4 : 1,
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: isHovered ? `4px 4px 16px ${CATEGORY_COLORS[cat.name] || "#666"}25, -1px -1px 4px rgba(255,255,255,0.03)` : "none",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: isHovered ? 10 : 8, height: isHovered ? 10 : 8,
                            borderRadius: "50%", background: CATEGORY_COLORS[cat.name] || "#666",
                            boxShadow: isHovered ? `0 0 8px ${CATEGORY_COLORS[cat.name] || "#666"}88` : "none",
                            transition: "all 0.2s",
                          }} />
                          <span style={{ fontSize: 10, color: isHovered ? "#e2e8f0" : "#94a3b8", transition: "color 0.2s" }}>{cat.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isHovered && <span style={{ fontSize: 9, color: CATEGORY_COLORS[cat.name] || "#94a3b8" }}>{pct}%</span>}
                          <span style={{ fontSize: isHovered ? 11 : 10, color: "#e2e8f0", fontWeight: isHovered ? 700 : 500, transition: "all 0.2s" }}>{formatBRL(cat.total)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Gastos Diarios + Ultimas Transacoes lado a lado */}
          <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            {/* Gastos Diarios */}
            <div style={{ ...cardStyle, maxHeight: 500, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gastos Diarios</p>
                <span style={{ fontSize: 10, color: "#64748b" }}>{allDays.filter((d) => d.total > 0).length} dias com gastos</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {allDays.map((d) => {
                  const pct = (d.total / maxDaily) * 100;
                  const dayDate = new Date(d.day + "T12:00:00");
                  const label = dayDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  const weekday = dayDate.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
                  const isFuture = d.day > today;
                  const isEmpty = d.total === 0;
                  return (
                    <div key={d.day} style={{ display: "flex", alignItems: "center", gap: 10, opacity: isFuture ? 0.3 : isEmpty ? 0.5 : 1 }}>
                      <span style={{ fontSize: 10, color: "#64748b", minWidth: 36, textAlign: "right" }}>{label}</span>
                      <span style={{ fontSize: 9, color: "#475569", minWidth: 28 }}>{weekday}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(148,163,184,0.06)", overflow: "hidden" }}>
                        {d.total > 0 && (
                          <div style={{
                            height: "100%", width: `${Math.max(2, pct)}%`, borderRadius: 4,
                            background: d.total > 500 ? "linear-gradient(90deg, #ef4444, #f97316)" : "linear-gradient(90deg, #6d28d9, #a855f7)",
                            transition: "width 0.5s ease",
                          }} />
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: isEmpty ? "#334155" : "#e2e8f0", fontWeight: isEmpty ? 400 : 600, minWidth: 70, textAlign: "right" }}>
                        {isEmpty ? "-" : formatBRL(d.total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ultimas Transacoes */}
            <div style={{ ...cardStyle, maxHeight: 500, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ultimas Transacoes</p>
                <button onClick={() => setActiveTab("transações")} style={{ background: "none", border: "none", color: "#8b5cf6", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Ver todas →</button>
              </div>
              {transactions.length === 0 && <p style={{ fontSize: 11, color: "#475569" }}>Nenhuma transacao. Importe um extrato para comecar.</p>}
              {transactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="tx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[tx.category] || "📌"}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0", wordBreak: "break-word" }}>{tx.description}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#475569" }}>{tx.category} · {formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <span className="tx-amount" style={{ fontSize: 13, fontWeight: 600, color: ["Renda", "Rendimentos", "Emprestimos"].includes(tx.category) ? "#10b981" : "#ef4444", whiteSpace: "nowrap" }}>
                    {["Renda", "Rendimentos", "Emprestimos"].includes(tx.category) ? "+" : "-"}{formatBRL(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === "transações" && (() => {
        const txTotal = filteredTx.reduce((s, t) => s + (["Renda", "Rendimentos", "Emprestimos"].includes(t.category) ? t.amount : -t.amount), 0);
        const txCount = filteredTx.length;
        return (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {selectedCat ? `Transacoes · ${selectedCat}` : "Todas as Transacoes"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: txTotal >= 0 ? "#10b981" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                Total: {txTotal >= 0 ? "+" : "-"}{formatBRL(txTotal)}
              </span>
              <span style={{ fontSize: 10, color: "#64748b" }}>({txCount} transacoes)</span>
              {selectedCat && (
                <button onClick={() => setSelectedCat(null)} style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "4px 10px", color: "#c4b5fd", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>
                  ✕ Limpar filtro
                </button>
              )}
            </div>
          </div>
          {filteredTx.length === 0 && <p style={{ fontSize: 11, color: "#475569" }}>Nenhuma transacao encontrada</p>}
          {filteredTx.map((tx) => (
            <div key={tx.id} className="tx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: 10, background: `${CATEGORY_COLORS[tx.category] || "#666"}15`, border: `1px solid ${CATEGORY_COLORS[tx.category] || "#666"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {CATEGORY_ICONS[tx.category] || "📌"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#e2e8f0", wordBreak: "break-word" }}>{tx.description}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${CATEGORY_COLORS[tx.category] || "#666"}20`, color: CATEGORY_COLORS[tx.category] || "#94a3b8" }}>{tx.category}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{formatDate(tx.date)}</span>
                  </div>
                </div>
              </div>
              <span className="tx-amount" style={{ fontSize: 14, fontWeight: 600, color: ["Renda", "Rendimentos", "Emprestimos"].includes(tx.category) ? "#10b981" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap" }}>
                {["Renda", "Rendimentos", "Emprestimos"].includes(tx.category) ? "+" : "-"}{formatBRL(tx.amount)}
              </span>
            </div>
          ))}
        </div>
        );
      })()}

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
                  <span style={{ fontSize: 18, fontWeight: 700, color: CATEGORY_COLORS[cat.name] || "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>{formatBRL(cat.total)}</span>
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

      {activeTab === "contas" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Minhas Contas</p>
            <button onClick={() => setShowNewAccount(true)} style={{ ...btnStyle, background: "rgba(139,92,246,0.2)", borderColor: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
              + Nova Conta
            </button>
          </div>

          {/* Form nova conta */}
          {showNewAccount && (
            <div style={{ ...cardStyle, marginBottom: 14, borderColor: "rgba(139,92,246,0.2)" }}>
              <div className="new-account-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>NOME</label>
                  <input value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder="Ex: Nubank Conta" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>BANCO</label>
                  <input value={newAccBank} onChange={(e) => setNewAccBank(e.target.value)} placeholder="Ex: Nubank" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>TIPO</label>
                  <select value={newAccType} onChange={(e) => setNewAccType(e.target.value)} style={inputStyle}>
                    <option value="CHECKING" style={{ background: "#0f172a" }}>Conta Corrente</option>
                    <option value="CREDIT_CARD" style={{ background: "#0f172a" }}>Cartao de Credito</option>
                    <option value="SAVINGS" style={{ background: "#0f172a" }}>Poupanca</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleNewAccount} style={{ ...btnStyle, background: "rgba(16,185,129,0.2)", borderColor: "rgba(16,185,129,0.3)", color: "#10b981" }}>Salvar</button>
                  <button onClick={() => setShowNewAccount(false)} style={btnStyle}>✕</button>
                </div>
              </div>
            </div>
          )}

          {accounts.length === 0 && <div style={cardStyle}><p style={{ fontSize: 11, color: "#475569", margin: 0 }}>Nenhuma conta cadastrada. Crie uma conta para comecar a importar extratos.</p></div>}

          {accounts.map((acc) => {
            const typeLabel = { CHECKING: "Conta Corrente", CREDIT_CARD: "Cartao de Credito", SAVINGS: "Poupanca" };
            return (
              <div key={acc.id} className="account-card-inner" style={{ ...cardStyle, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {acc.type === "CREDIT_CARD" ? "💳" : acc.type === "SAVINGS" ? "🏦" : "🏧"}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "#e2e8f0", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>{acc.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>{acc.bank} · {typeLabel[acc.type] || acc.type}</p>
                  </div>
                </div>
                <div className="account-card-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => { setUploadAccountId(acc.id); setShowUpload(true); }} style={{ ...btnStyle, color: "#c4b5fd" }}>↑ Importar</button>
                  <button onClick={() => handleDeleteAccount(acc.id)} style={{ ...btnStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.2)" }}>Apagar</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: "16px 0", borderTop: "1px solid rgba(148,163,184,0.06)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155" }}>
        <span>fintrack · importacao OFX/CSV</span>
        <span>{transactions.length} transacoes carregadas</span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button:hover { opacity: 0.85; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.15); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.3); }
        * { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.15) transparent; }
        @media (max-width: 768px) {
          .kpi-grid { grid-template-columns: 1fr !important; }
          .charts-grid { grid-template-columns: 1fr !important; }
          .new-account-grid { grid-template-columns: 1fr !important; }
          .header-right { flex-direction: column; align-items: stretch !important; }
          .header-right > * { width: 100% !important; max-width: none !important; }
          .month-selector { justify-content: center; }
          .account-card-actions { flex-direction: column; }
          .account-card-actions button { width: 100%; }
          .account-card-inner { flex-direction: column; gap: 12px !important; align-items: flex-start !important; }
          .donut-section { flex-direction: column; align-items: center !important; }
          .flow-bar-labels { flex-direction: column; gap: 4px !important; align-items: flex-start !important; }
          .tab-bar { width: 100% !important; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .app-container { padding: 12px !important; }
          .kpi-grid p[style*="fontSize: 22"] { font-size: 18px !important; }
          .tx-row { flex-direction: column; align-items: flex-start !important; gap: 8px; }
          .tx-amount { align-self: flex-end; }
        }
      `}</style>
    </div>
  );
}
