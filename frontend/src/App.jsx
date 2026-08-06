import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const API = "/api";

/* ------------------------------------------------------------------
   Metadados de categoria — cor, ícone e rótulo acentuado.
   As chaves seguem o backend (sem acento); o label é o que aparece na UI.
------------------------------------------------------------------ */
const CATEGORY_META = {
  Alimentacao:     { label: "Alimentação",    color: "#fb923c", icon: "🍔" },
  Mercado:         { label: "Mercado",        color: "#4ade80", icon: "🛒" },
  Transporte:      { label: "Transporte",     color: "#60a5fa", icon: "🚗" },
  Moradia:         { label: "Moradia",        color: "#facc15", icon: "🏠" },
  Assinaturas:     { label: "Assinaturas",    color: "#c084fc", icon: "📺" },
  Saude:           { label: "Saúde",          color: "#fb7185", icon: "💊" },
  Compras:         { label: "Compras",        color: "#f472b6", icon: "📦" },
  Lazer:           { label: "Lazer",          color: "#22d3ee", icon: "🎮" },
  Seguros:         { label: "Seguros",        color: "#94a3b8", icon: "🛡️" },
  Transferencias:  { label: "Transferências", color: "#818cf8", icon: "↗️" },
  Fatura:          { label: "Fatura",         color: "#64748b", icon: "💳" },
  Salario:         { label: "Salário",        color: "#34d399", icon: "💼" },
  Renda:           { label: "Renda",          color: "#a3e635", icon: "💰" },
  Investimentos:   { label: "Investimentos",  color: "#38bdf8", icon: "📈" },
  Rendimentos:     { label: "Rendimentos",    color: "#2dd4bf", icon: "📊" },
  Emprestimos:     { label: "Empréstimos",    color: "#fbbf24", icon: "🏦" },
  Outros:          { label: "Outros",         color: "#a8b0c2", icon: "📌" },
  AClassificar:    { label: "A classificar",  color: "#e879f9", icon: "❓" },
};

const PENDING = "AClassificar";

const FALLBACK_META = { label: "Outros", color: "#a8b0c2", icon: "📌" };

/* Categorias criadas pelo usuário, carregadas da API. Ficam num registro à parte
   porque `meta()` é usado por componentes fora do App, onde não há acesso ao
   state. É reescrito a cada fetch, antes do render que consome os valores. */
const CUSTOM_META = {};
const CUSTOM_INCOME = new Set();

function registerCustomCategories(list) {
  for (const key of Object.keys(CUSTOM_META)) delete CUSTOM_META[key];
  CUSTOM_INCOME.clear();
  for (const c of list) {
    CUSTOM_META[c.name] = { label: c.label, color: c.color, icon: c.icon };
    if (c.kind === "income") CUSTOM_INCOME.add(c.name);
  }
}

const meta = (name) =>
  CATEGORY_META[name] || CUSTOM_META[name] || { ...FALLBACK_META, label: name || "Outros" };

/* PENDING conta como entrada — é dinheiro que caiu na conta. Aparece como fatia
   própria ("A classificar") em vez de sumir do relatório. */
const INCOME_CATEGORIES = ["Salario", "Renda", "Rendimentos", "Emprestimos", PENDING];
const NON_EXPENSE = ["Salario", "Renda", "Fatura", "Investimentos", "Rendimentos", "Emprestimos", PENDING];

const isMoneyIn = (category) => INCOME_CATEGORIES.includes(category) || CUSTOM_INCOME.has(category);
const isNonExpense = (category) => NON_EXPENSE.includes(category) || CUSTOM_INCOME.has(category);

const ACCOUNT_TYPES = {
  CHECKING:    { label: "Conta Corrente",     icon: "🏧" },
  CREDIT_CARD: { label: "Cartão de Crédito",  icon: "💳" },
  SAVINGS:     { label: "Poupança",           icon: "🏦" },
};

/* ------------------------------------------------------------------
   Formatação
------------------------------------------------------------------ */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const formatBRL = (v) => brl.format(Math.abs(v || 0));

function formatCompact(v) {
  const n = Math.abs(v || 0);
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k`;
  return brl0.format(n);
}

const signed = (v) => `${v >= 0 ? "+" : "−"}${formatBRL(v)}`;

/* Valor digitado à mão: aceita "1.234,56", "1234,56" e "1234.56". Se tem
   vírgula, ela é o separador decimal e o ponto é milhar (padrão pt-BR).
   Sem vírgula, o ponto é o decimal. Retorna NaN quando não dá pra ler. */
function parseMoney(raw) {
  const s = String(raw ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

function formatDayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

/* Datas do backend chegam em UTC (meia-noite). Extraímos o dia em UTC para não
   escorregar 24h no fuso do Brasil, e renderizamos a partir do meio-dia local. */
const dateKey = (value) => new Date(value).toISOString().slice(0, 10);
const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatShortDate = (value) =>
  new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/* ------------------------------------------------------------------
   Ícones (SVG inline — leves, sem dependência externa)
------------------------------------------------------------------ */
const Icon = {
  chevronLeft: <path d="M9.5 3 5 8l4.5 5" />,
  chevronRight: <path d="M6.5 3 11 8l-4.5 5" />,
  upload: <><path d="M8 11V3.5" /><path d="M4.75 6.5 8 3.25l3.25 3.25" /><path d="M2.5 10.5v1.75A1.25 1.25 0 0 0 3.75 13.5h8.5a1.25 1.25 0 0 0 1.25-1.25V10.5" /></>,
  search: <><circle cx="7.2" cy="7.2" r="4.2" /><path d="m10.4 10.4 3 3" /></>,
  close: <><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></>,
  plus: <><path d="M8 3.5v9" /><path d="M3.5 8h9" /></>,
  trash: <><path d="M3 4.5h10" /><path d="M6.5 4.5V3h3v1.5" /><path d="M4.5 4.5 5 13h6l.5-8.5" /></>,
  arrowRight: <><path d="M3 8h9.5" /><path d="M9 4.5 12.5 8 9 11.5" /></>,
  tag: <><path d="M8.6 2.5H13a.5.5 0 0 1 .5.5v4.4a1 1 0 0 1-.29.7l-5.3 5.3a1 1 0 0 1-1.42 0L2.6 9.5a1 1 0 0 1 0-1.42l5.3-5.3a1 1 0 0 1 .7-.28Z" /><circle cx="10.8" cy="5.2" r="0.9" /></>,
};

function Ico({ name, size = 16, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {Icon[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------
   Donut
------------------------------------------------------------------ */
function DonutChart({ data, hovered, onHover, onSelect, totalLabel }) {
  const total = data.reduce((s, c) => s + c.total, 0);
  const size = 220, cx = size / 2, cy = size / 2, r = 88, thickness = 18;

  if (!total) {
    return (
      <div style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
        <div style={{ width: r * 2, height: r * 2, borderRadius: "50%", border: `${thickness}px solid rgba(255,255,255,0.045)` }} />
      </div>
    );
  }

  const gap = data.length > 1 ? 0.9 : 0;
  const segments = [];
  for (let i = 0, cursor = 0; i < data.length; i++) {
    const c = data[i];
    const pct = c.total / total;
    segments.push({ ...c, pct, start: cursor * 100, len: Math.max(pct * 100 - gap, 0.6) });
    cursor += pct;
  }

  const active = hovered ? segments.find((s) => s.name === hovered) : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Distribuição por categoria, total ${formatBRL(total)}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((seg) => {
          const on = hovered === seg.name;
          const c = meta(seg.name).color;
          return (
            <circle
              key={seg.name}
              className="donut-seg"
              cx={cx} cy={cy} r={r} fill="none"
              stroke={c}
              strokeWidth={on ? thickness + 7 : thickness}
              pathLength="100"
              strokeDasharray={`${seg.len} ${100 - seg.len}`}
              strokeDashoffset={-seg.start}
              strokeLinecap={segments.length > 1 ? "round" : "butt"}
              opacity={hovered && !on ? 0.28 : 1}
              onMouseEnter={() => onHover(seg.name)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect?.(seg.name)}
            />
          );
        })}
      </g>

      <text x={cx} y={cy - 4} textAnchor="middle"
        style={{ fill: "#e8eaf2", fontSize: 19, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
        {formatCompact(active ? active.total : total)}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle"
        style={{ fill: active ? meta(active.name).color : "#6b7387", fontSize: 11.5, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
        {active ? `${meta(active.name).label} · ${(active.pct * 100).toFixed(1)}%` : totalLabel}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------
   Painel de categorias (donut + legenda)
------------------------------------------------------------------ */
function CategoryPanel({ title, accent, data, total, hovered, onHover, onSelect, onSeeAll, emptyText }) {
  const visible = data.slice(0, 8);
  const rest = data.length - visible.length;

  return (
    <section className="card">
      <div className="card__head">
        <h2 className="card__title">
          <span style={{ width: 7, height: 7, borderRadius: 2, background: accent }} />
          {title}
        </h2>
        <span className="card__meta">{data.length} {data.length === 1 ? "categoria" : "categorias"}</span>
      </div>

      {data.length === 0 ? (
        <div className="empty" style={{ padding: "32px 12px" }}>
          <p className="empty__text">{emptyText}</p>
        </div>
      ) : (
        <div className="donut-wrap">
          <DonutChart data={data} hovered={hovered} onHover={onHover} onSelect={onSelect} totalLabel="total do mês" />

          <div className="legend">
            {visible.map((cat) => {
              const m = meta(cat.name);
              const pct = total ? (cat.total / total) * 100 : 0;
              const on = hovered === cat.name;
              return (
                <button
                  key={cat.name}
                  className={`legend__row${on ? " is-active" : ""}${hovered && !on ? " is-dim" : ""}`}
                  style={{ "--c": m.color }}
                  onMouseEnter={() => onHover(cat.name)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(cat.name)}
                  onBlur={() => onHover(null)}
                  onClick={() => onSelect(cat.name)}
                >
                  <span className="legend__dot" />
                  <span className="legend__name">{m.label}</span>
                  <span className="legend__bar"><i style={{ width: `${pct}%` }} /></span>
                  <span className="legend__pct">{pct.toFixed(0)}%</span>
                  <span className="legend__value">{formatBRL(cat.total)}</span>
                </button>
              );
            })}

            {rest > 0 && (
              <button className="btn btn--ghost btn--sm" style={{ marginTop: 6, alignSelf: "flex-start" }} onClick={onSeeAll}>
                +{rest} {rest === 1 ? "categoria" : "categorias"} <Ico name="arrowRight" size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------
   Gastos diários
------------------------------------------------------------------ */
function DailyBars({ days, max, today, average }) {
  return (
    <>
      <div className="bars">
        {days.map((d) => {
          const date = new Date(`${d.day}T12:00:00`);
          const weekday = date.getDay();
          const height = d.total > 0 ? Math.max(3, (d.total / max) * 100) : 2;
          const cls = [
            "bar",
            d.total === 0 && "is-empty",
            d.day > today && "is-future",
            d.day === today && "is-today",
            (weekday === 0 || weekday === 6) && "is-weekend",
            d.total > average * 2 && d.total > 0 && "is-high",
          ].filter(Boolean).join(" ");

          return (
            <div key={d.day} className={cls}>
              <div className="bar__tip">
                <b>{d.total > 0 ? formatBRL(d.total) : "sem gastos"}</b>
                <span>{date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</span>
              </div>
              <div className="bar__fill" style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
      <div className="bars__axis">
        <span>dia 1</span>
        <span>dia {Math.ceil(days.length / 2)}</span>
        <span>dia {days.length}</span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Extrai o "quem" da descrição, pra sugerir o padrão de uma regra.
   "Transferência recebida pelo Pix - FULANO DE TAL - •••.123..." -> "FULANO DE TAL"
   Quando não dá pra isolar um nome, devolve a descrição inteira — o campo
   é editável e mostramos quantos lançamentos seriam afetados antes de salvar.
------------------------------------------------------------------ */
function suggestPattern(description) {
  const parts = description.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const candidate = parts[1];
  if (candidate && candidate.length >= 4 && /[a-zA-ZÀ-ÿ]{3}/.test(candidate)) return candidate;
  return description.trim();
}

/* ------------------------------------------------------------------
   Seletor de categoria
------------------------------------------------------------------ */
const EMPTY_CAT = { label: "", color: "#8b5cf6", icon: "🏷️", kind: "expense" };

/* Paleta do formulário de categoria: tons já validados contra o fundo escuro. */
const CAT_COLORS = [
  "#fb923c", "#facc15", "#a3e635", "#4ade80", "#34d399", "#2dd4bf",
  "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#c084fc", "#e879f9",
  "#f472b6", "#fb7185", "#a8b0c2", "#94a3b8",
];

/* Categorias oferecidas no seletor: as embutidas mais as suas. */
const pickableCategories = () => [...Object.keys(CATEGORY_META), ...Object.keys(CUSTOM_META)];

function CategoryPicker({ tx, matchCount, onClose, onApply }) {
  const [pattern, setPattern] = useState(() => suggestPattern(tx.description));
  const [asRule, setAsRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  const affected = asRule ? matchCount(pattern, tx.type) : 1;

  async function pick(category) {
    if (saving) return;
    setSaving(true);
    await onApply(tx, category, { asRule, pattern });
    setSaving(false);
  }

  return (
    <div className="picker" ref={ref} role="dialog" aria-label="Escolher categoria">
      <div className="picker__list">
        {pickableCategories().map((key) => {
          const m = meta(key);
          const current = key === tx.category;
          return (
            <button key={key} className={`picker__item${current ? " is-current" : ""}`}
              style={{ "--c": m.color }} onClick={() => pick(key)} disabled={saving}>
              <span className="picker__icon" aria-hidden="true">{m.icon}</span>
              <span className="picker__name">{m.label}</span>
              {current && <span className="picker__check" aria-label="atual">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="picker__rule">
        <label className="picker__toggle">
          <input type="checkbox" checked={asRule} onChange={(e) => setAsRule(e.target.checked)} />
          <span>Sempre categorizar assim</span>
        </label>

        {asRule && (
          <>
            <input className="input picker__pattern" value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              aria-label="Texto que a descrição precisa conter" />
            <p className="picker__hint">
              {pattern.trim()
                ? <>
                    Afeta <strong>{affected}</strong> {affected === 1 ? "lançamento" : "lançamentos"} no
                    mês exibido, e vale para os próximos. Só para dinheiro{" "}
                    {tx.type === "CREDIT" ? "entrando" : "saindo"} — o sentido oposto não é tocado.
                  </>
                : "Digite um texto para casar com a descrição."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Linha de transação
------------------------------------------------------------------ */
function TransactionRow({ tx, onCategoryClick, isEditing, onEdit, matchCount, onApply }) {
  const m = meta(tx.category);
  const income = isMoneyIn(tx.category);
  return (
    <div className={`tx${isEditing ? " is-editing" : ""}`} style={{ "--c": m.color }}>
      <span className="tx__icon" aria-hidden="true">{m.icon}</span>
      <div className="tx__body">
        <div className="tx__desc" title={tx.description}>{tx.description}</div>
        <div className="tx__sub">
          <button className="chip" style={{ "--c": m.color, cursor: onCategoryClick ? "pointer" : "default" }}
            onClick={onCategoryClick ? () => onCategoryClick(tx.category) : undefined}>
            {m.label}
          </button>
          <span>{formatShortDate(tx.date)}</span>
          {tx.manualCategory && <span className="tx__manual" title="categoria definida por você">✎</span>}
        </div>
      </div>
      <span className={`tx__amount ${income ? "amount--pos" : "amount--neg"}`}>
        {income ? "+" : "−"}{formatBRL(tx.amount)}
      </span>
      <button className="tx__edit" onClick={() => onEdit(isEditing ? null : tx.id)}
        aria-label={`Mudar categoria de ${tx.description}`} aria-expanded={isEditing}>
        <Ico name="tag" size={15} />
      </button>
      {isEditing && (
        <CategoryPicker tx={tx} matchCount={matchCount} onClose={() => onEdit(null)} onApply={onApply} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Modal
------------------------------------------------------------------ */
function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <h3 className="modal__title">{title}</h3>
            {subtitle && <p className="modal__sub">{subtitle}</p>}
          </div>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Fechar">
            <Ico name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Estado vazio
------------------------------------------------------------------ */
function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">{icon}</div>
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------
   Skeleton de carregamento
------------------------------------------------------------------ */
function LoadingSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Carregando">
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 96 }} />)}
      </div>
      <div className="skel" style={{ height: 84 }} />
      <div className="grid-2">
        <div className="skel" style={{ height: 420 }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    </div>
  );
}

/* ==================================================================
   App
================================================================== */
const TABS = [
  { id: "dashboard", label: "Visão geral" },
  { id: "transacoes", label: "Transações" },
  { id: "categorias", label: "Categorias" },
  { id: "faturas", label: "Faturas" },
  { id: "contas", label: "Contas" },
];

const EMPTY_BILL = { accountId: "", amount: "", dueDate: "" };

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCat, setSelectedCat] = useState(null);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [hoveredCat, setHoveredCat] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileRef = useRef();

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAcc, setNewAcc] = useState({ name: "", bank: "", type: "CHECKING" });

  const [bills, setBills] = useState([]);
  const [billForm, setBillForm] = useState(EMPTY_BILL);
  const [savingBill, setSavingBill] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [customCats, setCustomCats] = useState([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState(EMPTY_CAT);
  const [savingCat, setSavingCat] = useState(false);

  /* ---------------- dados ---------------- */
  const fetchData = useCallback(async () => {
    try {
      const acctParam = selectedAccount ? `&accountId=${selectedAccount}` : "";
      /* As faturas não usam acctParam de propósito: o filtro de conta do topo
         costuma estar na conta corrente, e nesse caso a fatura do cartão — que
         é justamente o que vai sair dessa conta — sumiria da tela. */
      const [txRes, sumRes, accRes, billRes, catRes] = await Promise.all([
        fetch(`${API}/transactions?month=${month}${acctParam}`),
        fetch(`${API}/summary?month=${month}${acctParam}`),
        fetch(`${API}/accounts`),
        fetch(`${API}/bills?month=${month}`),
        fetch(`${API}/categories`),
      ]);
      const [txData, sumData, accData, billData, catData] = await Promise.all([
        txRes.json(), sumRes.json(), accRes.json(), billRes.json(), catRes.json(),
      ]);
      // Registrado antes dos setters: o render que consome `meta()` acontece
      // depois deste bloco, então já enxerga as categorias novas.
      registerCustomCategories(catData.custom || []);
      setCustomCats(catData.custom || []);
      setTransactions(txData);
      setSummary(sumData);
      setAccounts(accData);
      setBills(billData);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
      setToast({ type: "err", msg: "Não foi possível carregar os dados." });
    } finally {
      setLoading(false);
    }
  }, [month, selectedAccount]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------------- ações ---------------- */
  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadAccountId) return;

    setUploadStatus({ type: "info", msg: "Importando arquivo..." });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", uploadAccountId);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        const aiMsg = data.aiCategorized ? ` · ${data.aiCategorized} categorizadas por IA` : "";
        setUploadStatus({ type: "ok", msg: `${data.imported} transações importadas · ${data.skipped} duplicadas${aiMsg}` });
        fetchData();
        setTimeout(() => {
          setShowUpload(false);
          setUploadStatus(null);
          setToast({ type: "ok", msg: `${data.imported} transações importadas com sucesso.` });
        }, 1600);
      } else {
        setUploadStatus({ type: "err", msg: data.error || "Falha na importação." });
      }
    } catch {
      setUploadStatus({ type: "err", msg: "Erro de conexão durante a importação." });
    }
  }

  async function handleNewAccount() {
    if (!newAcc.name.trim() || !newAcc.bank.trim()) return;
    await fetch(`${API}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAcc.name.trim(), type: newAcc.type, bank: newAcc.bank.trim() }),
    });
    setNewAcc({ name: "", bank: "", type: "CHECKING" });
    setShowNewAccount(false);
    setToast({ type: "ok", msg: "Conta criada." });
    fetchData();
  }

  async function handleDeleteAccount(acc) {
    if (!confirm(`Apagar "${acc.name}" e todas as transações dela? Esta ação não pode ser desfeita.`)) return;
    await fetch(`${API}/accounts/${acc.id}`, { method: "DELETE" });
    if (selectedAccount === acc.id) setSelectedAccount("");
    setToast({ type: "ok", msg: "Conta removida." });
    fetchData();
  }

  /* ---------------- faturas ---------------- */
  /* Salva a fatura fechada do cartão no mês exibido. O backend faz upsert por
     (cartão, mês), então digitar de novo corrige o valor em vez de duplicar. */
  async function handleSaveBill() {
    const amount = parseMoney(billForm.amount);
    if (!billForm.accountId || !Number.isFinite(amount) || amount <= 0) return;

    setSavingBill(true);
    try {
      const res = await fetch(`${API}/bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: billForm.accountId,
          month,
          amount,
          dueDate: billForm.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBillForm(EMPTY_BILL);
      setToast({ type: "ok", msg: "Fatura salva." });
      fetchData();
    } catch {
      setToast({ type: "err", msg: "Não foi possível salvar a fatura." });
    } finally {
      setSavingBill(false);
    }
  }

  async function toggleBillPaid(bill) {
    try {
      const res = await fetch(`${API}/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: !bill.paid }),
      });
      if (!res.ok) throw new Error("falhou");
      fetchData();
    } catch {
      setToast({ type: "err", msg: "Não foi possível atualizar a fatura." });
    }
  }

  async function handleDeleteBill(bill) {
    if (!confirm(`Apagar a fatura de ${bill.accountName} deste mês?`)) return;
    await fetch(`${API}/bills/${bill.id}`, { method: "DELETE" });
    setToast({ type: "ok", msg: "Fatura removida." });
    fetchData();
  }

  /* Escolher um cartão que já tem fatura no mês carrega o valor no formulário —
     assim dá pra corrigir sem redigitar tudo. */
  function selectBillAccount(accountId) {
    const existing = bills.find((b) => b.accountId === accountId);
    setBillForm({
      accountId,
      amount: existing ? String(existing.amount).replace(".", ",") : "",
      dueDate: existing?.dueDate ? dateKey(existing.dueDate) : "",
    });
  }

  function changeMonth(delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  /* Quantos lançamentos do mês exibido casariam com o padrão da regra. */
  const matchCount = useCallback((pattern, type) => {
    const p = pattern.trim().toLowerCase();
    if (!p) return 0;
    return transactions.filter(
      (t) => t.description.toLowerCase().includes(p) && (!type || t.type === type)
    ).length;
  }, [transactions]);

  async function applyCategory(tx, category, { asRule, pattern }) {
    try {
      if (asRule) {
        const clean = pattern.trim();
        if (!clean) return;
        const res = await fetch(`${API}/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: clean, category, type: tx.type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setToast({
          type: "ok",
          msg: `Regra criada · ${data.applied} ${data.applied === 1 ? "lançamento atualizado" : "lançamentos atualizados"}.`,
        });
      } else {
        const res = await fetch(`${API}/transactions/${tx.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category }),
        });
        if (!res.ok) throw new Error("falhou");
        setToast({ type: "ok", msg: `Categorizado como ${meta(category).label}.` });
      }
      setEditingId(null);
      fetchData();
    } catch {
      setToast({ type: "err", msg: "Não foi possível salvar a categoria." });
    }
  }

  async function handleNewCategory() {
    const label = newCat.label.trim();
    if (!label || savingCat) return;
    setSavingCat(true);
    try {
      const res = await fetch(`${API}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newCat, label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewCat(EMPTY_CAT);
      setShowNewCat(false);
      setToast({ type: "ok", msg: `Categoria "${label}" criada.` });
      fetchData();
    } catch (err) {
      setToast({ type: "err", msg: err.message || "Não foi possível criar a categoria." });
    } finally {
      setSavingCat(false);
    }
  }

  /* Vira a categoria de lado no resumo. Sem isso, uma categoria criada como
     saída por engano só podia ser corrigida apagando — o que devolveria todos
     os lançamentos dela para "Outros". */
  async function toggleCategoryKind(cat) {
    const kind = cat.kind === "income" ? "expense" : "income";
    try {
      const res = await fetch(`${API}/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToast({
        type: "ok",
        msg: `"${cat.label}" agora soma nas ${kind === "income" ? "entradas" : "saídas"}.`,
      });
      fetchData();
    } catch (err) {
      setToast({ type: "err", msg: err.message || "Não foi possível mudar a categoria." });
    }
  }

  async function handleDeleteCategory(cat) {
    const used = transactions.filter((t) => t.category === cat.name).length;
    const aviso = used
      ? `\n\n${used} ${used === 1 ? "lançamento do mês exibido volta" : "lançamentos do mês exibido voltam"} para "${cat.kind === "income" ? "A classificar" : "Outros"}".`
      : "";
    if (!confirm(`Apagar a categoria "${cat.label}"?${aviso}`)) return;
    try {
      const res = await fetch(`${API}/categories/${cat.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToast({
        type: "ok",
        msg: data.moved
          ? `Categoria apagada · ${data.moved} ${data.moved === 1 ? "lançamento realocado" : "lançamentos realocados"}.`
          : "Categoria apagada.",
      });
      fetchData();
    } catch {
      setToast({ type: "err", msg: "Não foi possível apagar a categoria." });
    }
  }

  function goToCategory(name) {
    setSelectedCat(name);
    setActiveTab("transacoes");
    setHoveredCat(null);
  }

  /* ---------------- derivados ---------------- */
  const totalExpense = summary?.expenses || 0;
  const totalIncome = summary?.income || 0;
  const balance = summary?.balance || 0;
  const invested = summary?.invested || 0;
  const accountBalance = summary?.accountBalance ?? null;

  const categories = useMemo(() => (
    summary?.byCategory
      ? Object.entries(summary.byCategory)
          .map(([name, d]) => ({ name, total: d.total, count: d.count }))
          .filter((c) => c.name !== "Fatura")
          .sort((a, b) => b.total - a.total)
      : []
  ), [summary]);

  const incomeCategories = useMemo(() => (
    summary?.byIncomeCategory
      ? Object.entries(summary.byIncomeCategory)
          .map(([name, d]) => ({ name, total: d.total, count: d.count }))
          .sort((a, b) => b.total - a.total)
      : []
  ), [summary]);

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (selectedCat && t.category !== selectedCat) return false;
      if (!q) return true;
      return (
        t.description?.toLowerCase().includes(q) ||
        meta(t.category).label.toLowerCase().includes(q)
      );
    });
  }, [transactions, selectedCat, search]);

  const groupedTx = useMemo(() => {
    const groups = new Map();
    for (const tx of filteredTx) {
      const key = dateKey(tx.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tx);
    }
    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, items]) => ({
        day,
        items,
        total: items.reduce((s, t) => s + (isMoneyIn(t.category) ? t.amount : -t.amount), 0),
      }));
  }, [filteredTx]);

  const txTotal = useMemo(
    () => filteredTx.reduce((s, t) => s + (isMoneyIn(t.category) ? t.amount : -t.amount), 0),
    [filteredTx]
  );

  const { allDays, maxDaily, avgDaily, daysWithSpend, todayISO } = useMemo(() => {
    const dailySpend = {};
    transactions
      .filter((t) => !isNonExpense(t.category) && t.amount !== 0)
      .forEach((t) => {
        const day = dateKey(t.date);
        dailySpend[day] = (dailySpend[day] || 0) + Math.abs(t.amount);
      });

    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: key, total: dailySpend[key] || 0 });
    }
    const withSpend = days.filter((d) => d.total > 0);
    return {
      allDays: days,
      maxDaily: Math.max(...days.map((d) => d.total), 1),
      avgDaily: withSpend.length ? withSpend.reduce((s, d) => s + d.total, 0) / withSpend.length : 0,
      daysWithSpend: withSpend.length,
      todayISO: toISODate(new Date()),
    };
  }, [transactions, month]);

  const pending = summary?.pending ?? { total: 0, count: 0 };

  /* Previsão do mês: o dinheiro que está na conta menos as faturas fechadas que
     ainda não foram pagas. Usa o saldo das contas não-cartão (e não o
     accountBalance do summary) porque o card precisa do total real,
     independente do filtro de conta escolhido no topo. */
  const cardAccounts = useMemo(() => accounts.filter((a) => a.type === "CREDIT_CARD"), [accounts]);
  const cashBalance = useMemo(
    () => accounts.filter((a) => a.type !== "CREDIT_CARD").reduce((s, a) => s + (a.balance || 0), 0),
    [accounts]
  );
  const billsTotal = useMemo(() => bills.reduce((s, b) => s + b.amount, 0), [bills]);
  const billsOpen = useMemo(
    () => bills.filter((b) => !b.paid).reduce((s, b) => s + b.amount, 0),
    [bills]
  );
  const forecast = cashBalance - billsOpen;
  const billFormAmount = parseMoney(billForm.amount);
  const billFormValid = !!billForm.accountId && Number.isFinite(billFormAmount) && billFormAmount > 0;
  const editingBill = bills.some((b) => b.accountId === billForm.accountId);

  const monthLabel = new Date(`${month}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const committedPct = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;
  const hasData = transactions.length > 0;

  /* ---------------- render ---------------- */
  return (
    <div className="shell">
      {/* ---------- topbar ---------- */}
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="brand">
            <div className="brand__mark" aria-hidden="true">◈</div>
            <div>
              <div className="brand__name">fin<span>track</span></div>
              <div className="brand__sub">extratos OFX &amp; CSV</div>
            </div>
          </div>

          <div className="topbar__actions">
            <div className="monthnav">
              <button onClick={() => changeMonth(-1)} aria-label="Mês anterior"><Ico name="chevronLeft" size={15} /></button>
              <span className="monthnav__label">{monthLabel}</span>
              <button onClick={() => changeMonth(1)} aria-label="Próximo mês"><Ico name="chevronRight" size={15} /></button>
            </div>

            {month !== currentMonth && (
              <button className="btn btn--sm" onClick={() => setMonth(currentMonth)}>Hoje</button>
            )}

            {accounts.length > 1 && (
              <>
                <label className="sr-only" htmlFor="acc-filter">Filtrar por conta</label>
                <select id="acc-filter" className="select select--compact" value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}>
                  <option value="">Todas as contas</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} · {acc.bank}</option>
                  ))}
                </select>
              </>
            )}

            <button className="btn btn--primary" onClick={() => setShowUpload(true)}>
              <Ico name="upload" size={15} /> Importar
            </button>
          </div>
        </div>
      </header>

      <main className="main container">
        {/* ---------- tabs ---------- */}
        <div className="tabs" role="tablist" aria-label="Seções" style={{ marginBottom: 20 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className="tab"
              onClick={() => { setActiveTab(tab.id); setSelectedCat(null); setSearch(""); }}
            >
              {tab.label}
              {tab.id === "transacoes" && transactions.length > 0 && (
                <span className="tab__count">{transactions.length}</span>
              )}
              {tab.id === "faturas" && bills.length > 0 && (
                <span className="tab__count">{bills.length}</span>
              )}
              {tab.id === "contas" && accounts.length > 0 && (
                <span className="tab__count">{accounts.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading && !summary ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* ================= DASHBOARD ================= */}
            {activeTab === "dashboard" && (
              <div className="stack fade-up">
                {!hasData && accounts.length === 0 && (
                  <div className="card">
                    <EmptyState
                      icon="🚀"
                      title="Vamos começar"
                      text="Cadastre uma conta e importe seu primeiro extrato OFX ou CSV para ver seus gastos organizados aqui."
                      action={<button className="btn btn--primary" onClick={() => setActiveTab("contas")}>Criar minha primeira conta</button>}
                    />
                  </div>
                )}

                {/* entradas ainda sem classificação */}
                {pending.count > 0 && (
                  <button className="notice" onClick={() => goToCategory(PENDING)}>
                    <span className="notice__icon" aria-hidden="true">❓</span>
                    <span className="notice__body">
                      <strong>
                        {pending.count} {pending.count === 1 ? "entrada" : "entradas"} sem classificação
                        {" · "}{formatBRL(pending.total)}
                      </strong>
                      <span>
                        Já contam nas entradas do mês, mas ainda sem categoria definida.
                        Só PIX da LeverPro vira salário automaticamente.
                      </span>
                    </span>
                    <Ico name="arrowRight" size={16} />
                  </button>
                )}

                {/* KPIs */}
                <div className="kpis">
                  {accountBalance !== null && (
                    <article className="kpi" style={{ "--kpi-color": "#a78bfa" }}>
                      <div className="kpi__head">
                        <span className="kpi__icon" aria-hidden="true">🏦</span>
                        <span className="kpi__label">Saldo atual</span>
                      </div>
                      <div className="kpi__value">{formatBRL(accountBalance)}</div>
                      <div className="kpi__foot">
                        {selectedAccount ? "conta selecionada" : `${accounts.length} ${accounts.length === 1 ? "conta" : "contas"}`}
                      </div>
                    </article>
                  )}

                  <article className="kpi" style={{ "--kpi-color": "#34d399" }}>
                    <div className="kpi__head">
                      <span className="kpi__icon" aria-hidden="true">↓</span>
                      <span className="kpi__label">Entradas</span>
                    </div>
                    <div className="kpi__value">+{formatBRL(totalIncome)}</div>
                    <div className="kpi__foot">{incomeCategories.length} {incomeCategories.length === 1 ? "fonte" : "fontes"} no mês</div>
                  </article>

                  <article className="kpi" style={{ "--kpi-color": "#fb7185" }}>
                    <div className="kpi__head">
                      <span className="kpi__icon" aria-hidden="true">↑</span>
                      <span className="kpi__label">Saídas</span>
                    </div>
                    <div className="kpi__value">−{formatBRL(totalExpense)}</div>
                    <div className="kpi__foot">
                      {daysWithSpend > 0 ? `${formatBRL(avgDaily)} / dia com gasto` : "sem gastos no mês"}
                    </div>
                  </article>

                  <article className="kpi" style={{ "--kpi-color": balance >= 0 ? "#34d399" : "#fb7185" }}>
                    <div className="kpi__head">
                      <span className="kpi__icon" aria-hidden="true">{balance >= 0 ? "✓" : "!"}</span>
                      <span className="kpi__label">Resultado do mês</span>
                    </div>
                    <div className="kpi__value">{signed(balance)}</div>
                    <div className="kpi__foot">
                      {totalIncome > 0 ? `${committedPct.toFixed(0)}% da renda comprometida` : "sem renda registrada"}
                    </div>
                  </article>

                  {invested > 0 && (
                    <article className="kpi" style={{ "--kpi-color": "#38bdf8" }}>
                      <div className="kpi__head">
                        <span className="kpi__icon" aria-hidden="true">📈</span>
                        <span className="kpi__label">Investido</span>
                      </div>
                      <div className="kpi__value">{formatBRL(invested)}</div>
                      <div className="kpi__foot">
                        {totalIncome > 0 ? `${((invested / totalIncome) * 100).toFixed(0)}% da renda` : "no mês"}
                      </div>
                    </article>
                  )}
                </div>

                {/* barra de fluxo */}
                {(totalIncome > 0 || totalExpense > 0) && (
                  <section className="card">
                    <div className="card__head" style={{ marginBottom: 12 }}>
                      <h2 className="card__title">Entradas × Saídas</h2>
                      <span className="card__meta">
                        {committedPct > 100 ? "gastou mais do que entrou" : totalIncome > 0 ? `${committedPct.toFixed(0)}% comprometido` : ""}
                      </span>
                    </div>
                    <div className="flow__track">
                      <div className="flow__seg flow__seg--in"
                        style={{ width: `${(totalIncome / Math.max(totalIncome, totalExpense, 1)) * 100}%` }} />
                      <div className="flow__seg flow__seg--out"
                        style={{ width: `${(totalExpense / Math.max(totalIncome, totalExpense, 1)) * 100}%` }} />
                    </div>
                    <div className="flow__legend">
                      <span className="pos">↓ {formatBRL(totalIncome)}</span>
                      <span className={balance >= 0 ? "pos" : "neg"} style={{ fontWeight: 600 }}>{signed(balance)}</span>
                      <span className="neg">↑ {formatBRL(totalExpense)}</span>
                    </div>
                  </section>
                )}

                {/* gastos diários */}
                {hasData && (
                  <section className="card">
                    <div className="card__head">
                      <h2 className="card__title">Gastos por dia</h2>
                      <span className="card__meta">
                        {daysWithSpend} {daysWithSpend === 1 ? "dia com gasto" : "dias com gasto"} · pico {formatBRL(maxDaily)}
                      </span>
                    </div>
                    <DailyBars days={allDays} max={maxDaily} today={todayISO} average={avgDaily} />
                  </section>
                )}

                {/* categorias */}
                <div className="grid-2">
                  <CategoryPanel
                    title="Saídas por categoria" accent="#fb7185"
                    data={categories} total={totalExpense}
                    hovered={hoveredCat} onHover={setHoveredCat}
                    onSelect={goToCategory} onSeeAll={() => setActiveTab("categorias")}
                    emptyText="Nenhuma saída registrada neste mês."
                  />
                  <CategoryPanel
                    title="Entradas por categoria" accent="#34d399"
                    data={incomeCategories} total={totalIncome}
                    hovered={hoveredCat} onHover={setHoveredCat}
                    onSelect={goToCategory} onSeeAll={() => setActiveTab("categorias")}
                    emptyText="Nenhuma entrada registrada neste mês."
                  />
                </div>

                {/* últimas transações */}
                <section className="card">
                  <div className="card__head">
                    <h2 className="card__title">Últimas transações</h2>
                    <button className="btn btn--ghost btn--sm" onClick={() => setActiveTab("transacoes")}>
                      Ver todas <Ico name="arrowRight" size={14} />
                    </button>
                  </div>
                  {transactions.length === 0 ? (
                    <EmptyState
                      icon="📄"
                      title="Nenhuma transação neste mês"
                      text="Importe um extrato OFX ou CSV para começar a acompanhar seus gastos."
                      action={accounts.length > 0 && (
                        <button className="btn btn--primary" onClick={() => setShowUpload(true)}>
                          <Ico name="upload" size={15} /> Importar extrato
                        </button>
                      )}
                    />
                  ) : (
                    transactions.slice(0, 8).map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onCategoryClick={goToCategory}
                        isEditing={editingId === tx.id} onEdit={setEditingId}
                        matchCount={matchCount} onApply={applyCategory} />
                    ))
                  )}
                </section>
              </div>
            )}

            {/* ================= TRANSAÇÕES ================= */}
            {activeTab === "transacoes" && (
              <section className="card fade-up">
                <div className="card__head">
                  <div className="row row--wrap" style={{ flex: 1 }}>
                    <div className="search">
                      <span className="search__icon"><Ico name="search" size={15} /></span>
                      <input className="input" type="search" placeholder="Buscar descrição ou categoria..."
                        value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar transações" />
                    </div>
                    {selectedCat && (
                      <button className="chip chip--clear" style={{ "--c": meta(selectedCat).color }}
                        onClick={() => setSelectedCat(null)}>
                        {meta(selectedCat).icon} {meta(selectedCat).label} <Ico name="close" size={11} />
                      </button>
                    )}
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <span className="card__meta">{filteredTx.length} {filteredTx.length === 1 ? "lançamento" : "lançamentos"}</span>
                    <span className={`tx__amount ${txTotal >= 0 ? "amount--pos" : "neg"}`}>{signed(txTotal)}</span>
                  </div>
                </div>

                {filteredTx.length === 0 ? (
                  <EmptyState
                    icon="🔍"
                    title="Nada encontrado"
                    text={search || selectedCat
                      ? "Nenhuma transação corresponde a esse filtro. Tente outro termo ou limpe os filtros."
                      : "Nenhuma transação registrada neste mês."}
                    action={(search || selectedCat) && (
                      <button className="btn" onClick={() => { setSearch(""); setSelectedCat(null); }}>Limpar filtros</button>
                    )}
                  />
                ) : (
                  groupedTx.map((group) => (
                    <div key={group.day}>
                      <div className="tx-group__head">
                        <span>{formatDayLabel(group.day)}</span>
                        <span>{signed(group.total)}</span>
                      </div>
                      {group.items.map((tx) => (
                        <TransactionRow key={tx.id} tx={tx} onCategoryClick={goToCategory}
                          isEditing={editingId === tx.id} onEdit={setEditingId}
                          matchCount={matchCount} onApply={applyCategory} />
                      ))}
                    </div>
                  ))
                )}
              </section>
            )}

            {/* ================= CATEGORIAS ================= */}
            {activeTab === "categorias" && (
              <div className="stack fade-up">
                <div className="card__head" style={{ marginBottom: 0 }}>
                  <h2 className="card__title">Categorias · {monthLabel}</h2>
                  {!showNewCat && (
                    <button className="btn btn--primary" onClick={() => setShowNewCat(true)}>
                      <Ico name="plus" size={15} /> Nova categoria
                    </button>
                  )}
                </div>

                {showNewCat && (
                  <div className="card" style={{ borderColor: "var(--accent-line)" }}>
                    <div className="card__head" style={{ marginBottom: 14 }}>
                      <h3 className="card__title">Nova categoria</h3>
                      <button className="btn btn--ghost btn--icon"
                        onClick={() => { setShowNewCat(false); setNewCat(EMPTY_CAT); }} aria-label="Cancelar">
                        <Ico name="close" />
                      </button>
                    </div>

                    <div className="catform">
                      <label className="field catform__name">
                        <span className="field__label">Nome</span>
                        <input className="input" value={newCat.label} maxLength={24}
                          placeholder="Ex: Pet, Educação, Freela"
                          onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} />
                      </label>

                      <label className="field catform__icon">
                        <span className="field__label">Ícone</span>
                        <input className="input" value={newCat.icon} maxLength={4}
                          style={{ textAlign: "center", fontSize: 18 }}
                          onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} />
                      </label>

                      <div className="field catform__kind">
                        <span className="field__label">Tipo</span>
                        <div className="segmented" role="group">
                          <button type="button" aria-pressed={newCat.kind === "expense"}
                            onClick={() => setNewCat({ ...newCat, kind: "expense" })}>↑ Saída</button>
                          <button type="button" aria-pressed={newCat.kind === "income"}
                            onClick={() => setNewCat({ ...newCat, kind: "income" })}>↓ Entrada</button>
                        </div>
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: 14 }}>
                      <span className="field__label">Cor</span>
                      <div className="swatches">
                        {CAT_COLORS.map((c) => (
                          <button key={c} type="button" className="swatch" style={{ "--c": c }}
                            aria-label={`Cor ${c}`} aria-pressed={newCat.color === c}
                            onClick={() => setNewCat({ ...newCat, color: c })} />
                        ))}
                      </div>
                    </div>

                    <div className="row" style={{ marginTop: 16, gap: 12 }}>
                      <span className="chip" style={{ "--c": newCat.color }}>
                        {newCat.icon} {newCat.label.trim() || "Prévia"}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {newCat.kind === "income" ? "soma nas entradas" : "soma nas saídas"}
                      </span>
                      <span className="spacer" />
                      <button className="btn btn--primary" onClick={handleNewCategory}
                        disabled={!newCat.label.trim() || savingCat}>
                        {savingCat ? "Salvando..." : "Criar categoria"}
                      </button>
                    </div>
                  </div>
                )}

                {customCats.length > 0 && (
                  <div>
                    <div className="card__head">
                      <h2 className="card__title">Suas categorias</h2>
                      <span className="card__meta">{customCats.length}</span>
                    </div>
                    <div className="grid-auto">
                      {customCats.map((cat) => (
                        <div key={cat.id} className="cat-card cat-card--own" style={{ "--c": cat.color }}>
                          <div className="row" style={{ gap: 11, minWidth: 0 }}>
                            <span className="cat-card__icon" aria-hidden="true">{cat.icon}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="cat-card__name">{cat.label}</div>
                              {/* o lado do resumo saiu daqui: agora é o próprio
                                  botão ao lado, que mostra e troca de uma vez */}
                              <div className="cat-card__count">
                                {transactions.filter((t) => t.category === cat.name).length} no mês
                              </div>
                            </div>
                            <span className="spacer" />
                            <button className="btn btn--ghost btn--sm"
                              onClick={() => toggleCategoryKind(cat)}
                              title={`Passar para ${cat.kind === "income" ? "saídas" : "entradas"}`}
                              aria-label={`${cat.label} soma nas ${cat.kind === "income" ? "entradas" : "saídas"}. Trocar para ${cat.kind === "income" ? "saídas" : "entradas"}`}>
                              {cat.kind === "income" ? "↓ Entrada" : "↑ Saída"}
                            </button>
                            <button className="btn btn--ghost btn--icon btn--sm btn--danger"
                              onClick={() => handleDeleteCategory(cat)}
                              aria-label={`Apagar categoria ${cat.label}`}>
                              <Ico name="trash" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {categories.length === 0 && incomeCategories.length === 0 ? (
                  <div className="card">
                    <EmptyState icon="🏷️" title="Sem movimento neste mês"
                      text="Assim que houver transações importadas, elas aparecerão agrupadas por categoria aqui." />
                  </div>
                ) : (
                  [
                    { title: "Saídas", list: categories, total: totalExpense },
                    { title: "Entradas", list: incomeCategories, total: totalIncome },
                  ].filter((s) => s.list.length > 0).map((section) => (
                    <div key={section.title}>
                      <div className="card__head">
                        <h2 className="card__title">{section.title}</h2>
                        <span className="card__meta">{formatBRL(section.total)}</span>
                      </div>
                      <div className="grid-auto">
                        {section.list.map((cat) => {
                          const m = meta(cat.name);
                          const pct = section.total ? (cat.total / section.total) * 100 : 0;
                          return (
                            <button key={cat.name} className="cat-card" style={{ "--c": m.color }}
                              onClick={() => goToCategory(cat.name)}>
                              <div className="cat-card__top">
                                <div className="row" style={{ gap: 11, minWidth: 0 }}>
                                  <span className="cat-card__icon" aria-hidden="true">{m.icon}</span>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="cat-card__name">{m.label}</div>
                                    <div className="cat-card__count">{cat.count} {cat.count === 1 ? "lançamento" : "lançamentos"}</div>
                                  </div>
                                </div>
                                <div className="cat-card__value">{formatBRL(cat.total)}</div>
                              </div>
                              <div className="meter"><i style={{ width: `${pct}%` }} /></div>
                              <div className="cat-card__count" style={{ marginTop: 7, textAlign: "right" }}>
                                {pct.toFixed(1)}% do total
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ================= FATURAS ================= */}
            {activeTab === "faturas" && (
              <div className="stack fade-up">
                <div className="card__head" style={{ marginBottom: 0 }}>
                  <h2 className="card__title">Faturas fechadas · {monthLabel}</h2>
                  <span className="card__meta">valor digitado a partir do app do banco</span>
                </div>

                {cardAccounts.length === 0 ? (
                  <div className="card">
                    <EmptyState
                      icon="💳"
                      title="Nenhum cartão cadastrado"
                      text="Cadastre uma conta do tipo Cartão de Crédito para poder lançar o valor da fatura fechada aqui."
                      action={
                        <button className="btn btn--primary"
                          onClick={() => { setActiveTab("contas"); setShowNewAccount(true); setNewAcc({ name: "", bank: "", type: "CREDIT_CARD" }); }}>
                          <Ico name="plus" size={15} /> Cadastrar cartão
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className="kpis">
                      <article className="kpi" style={{ "--kpi-color": "#64748b" }}>
                        <div className="kpi__head">
                          <span className="kpi__icon" aria-hidden="true">💳</span>
                          <span className="kpi__label">Faturas do mês</span>
                        </div>
                        <div className="kpi__value">{formatBRL(billsTotal)}</div>
                        <div className="kpi__foot">
                          {bills.length} {bills.length === 1 ? "cartão lançado" : "cartões lançados"}
                        </div>
                      </article>

                      <article className="kpi" style={{ "--kpi-color": "#fb7185" }}>
                        <div className="kpi__head">
                          <span className="kpi__icon" aria-hidden="true">⏳</span>
                          <span className="kpi__label">Ainda a pagar</span>
                        </div>
                        <div className="kpi__value">−{formatBRL(billsOpen)}</div>
                        <div className="kpi__foot">
                          {billsOpen > 0 ? "vai sair da conta" : "tudo quitado"}
                        </div>
                      </article>

                      <article className="kpi" style={{ "--kpi-color": "#a78bfa" }}>
                        <div className="kpi__head">
                          <span className="kpi__icon" aria-hidden="true">🏦</span>
                          <span className="kpi__label">Saldo em conta</span>
                        </div>
                        <div className="kpi__value">{formatBRL(cashBalance)}</div>
                        <div className="kpi__foot">sem contar cartões</div>
                      </article>

                      <article className="kpi" style={{ "--kpi-color": forecast >= 0 ? "#34d399" : "#fb7185" }}>
                        <div className="kpi__head">
                          <span className="kpi__icon" aria-hidden="true">{forecast >= 0 ? "✓" : "!"}</span>
                          <span className="kpi__label">Sobra prevista</span>
                        </div>
                        <div className="kpi__value">{signed(forecast)}</div>
                        <div className="kpi__foot">saldo menos as faturas em aberto</div>
                      </article>
                    </div>

                    <section className="card">
                      <div className="card__head" style={{ marginBottom: 14 }}>
                        <h3 className="card__title">{editingBill ? "Atualizar fatura" : "Lançar fatura"}</h3>
                        <span className="card__meta">mês de referência: {monthLabel}</span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                        <label className="field">
                          <span className="field__label">Cartão</span>
                          <select className="select" value={billForm.accountId}
                            onChange={(e) => selectBillAccount(e.target.value)}>
                            <option value="">Selecione um cartão...</option>
                            {cardAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>{acc.name} · {acc.bank}</option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span className="field__label">Valor da fatura</span>
                          <input className="input" inputMode="decimal" placeholder="Ex: 1.234,56"
                            value={billForm.amount}
                            onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter" && billFormValid) handleSaveBill(); }} />
                        </label>

                        <label className="field">
                          <span className="field__label">Vencimento (opcional)</span>
                          <input className="input" type="date" value={billForm.dueDate}
                            onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })} />
                        </label>
                      </div>

                      <button className="btn btn--primary" style={{ marginTop: 14 }}
                        onClick={handleSaveBill} disabled={!billFormValid || savingBill}>
                        {savingBill ? "Salvando..." : editingBill ? "Atualizar fatura" : "Salvar fatura"}
                      </button>

                      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                        Um valor por cartão por mês. Lançar de novo o mesmo cartão substitui o valor anterior.
                      </p>
                    </section>

                    {bills.length === 0 ? (
                      <div className="card">
                        <EmptyState
                          icon="🧾"
                          title="Nenhuma fatura lançada neste mês"
                          text="Digite acima o valor que fechou no app do banco. Ele entra na sobra prevista até você marcar como paga."
                        />
                      </div>
                    ) : (
                      bills.map((bill) => (
                        <div key={bill.id} className="account">
                          <div className="row" style={{ gap: 13, minWidth: 0 }}>
                            <span className="account__icon" aria-hidden="true">{bill.paid ? "✅" : "💳"}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="account__name">{bill.accountName}</div>
                              <div className="account__meta">
                                {bill.paid ? "paga" : "em aberto"}
                                {bill.dueDate && ` · vence ${formatShortDate(bill.dueDate)}`}
                              </div>
                            </div>
                          </div>
                          <div className="account__actions">
                            <span className={`tx__amount ${bill.paid ? "muted" : "amount--neg"}`}>
                              {formatBRL(bill.amount)}
                            </span>
                            <button className="btn" onClick={() => toggleBillPaid(bill)}>
                              {bill.paid ? "Reabrir" : "Marcar paga"}
                            </button>
                            <button className="btn btn--danger btn--icon" onClick={() => handleDeleteBill(bill)}
                              aria-label={`Apagar fatura de ${bill.accountName}`}>
                              <Ico name="trash" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}

            {/* ================= CONTAS ================= */}
            {activeTab === "contas" && (
              <div className="stack fade-up">
                <div className="card__head" style={{ marginBottom: 0 }}>
                  <h2 className="card__title">Minhas contas</h2>
                  {!showNewAccount && (
                    <button className="btn btn--primary" onClick={() => setShowNewAccount(true)}>
                      <Ico name="plus" size={15} /> Nova conta
                    </button>
                  )}
                </div>

                {showNewAccount && (
                  <div className="card" style={{ borderColor: "var(--accent-line)" }}>
                    <div className="card__head" style={{ marginBottom: 14 }}>
                      <h3 className="card__title">Nova conta</h3>
                      <button className="btn btn--ghost btn--icon" onClick={() => setShowNewAccount(false)} aria-label="Cancelar">
                        <Ico name="close" />
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <label className="field">
                        <span className="field__label">Nome</span>
                        <input className="input" value={newAcc.name} placeholder="Ex: Nubank Conta"
                          onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field__label">Banco</span>
                        <input className="input" value={newAcc.bank} placeholder="Ex: Nubank"
                          onChange={(e) => setNewAcc({ ...newAcc, bank: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field__label">Tipo</span>
                        <select className="select" value={newAcc.type}
                          onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value })}>
                          {Object.entries(ACCOUNT_TYPES).map(([value, t]) => (
                            <option key={value} value={value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button className="btn btn--primary" style={{ marginTop: 14 }}
                      onClick={handleNewAccount} disabled={!newAcc.name.trim() || !newAcc.bank.trim()}>
                      Salvar conta
                    </button>
                  </div>
                )}

                {accounts.length === 0 && !showNewAccount ? (
                  <div className="card">
                    <EmptyState
                      icon="🏦"
                      title="Nenhuma conta cadastrada"
                      text="Crie uma conta para poder importar extratos e acompanhar seus lançamentos."
                      action={<button className="btn btn--primary" onClick={() => setShowNewAccount(true)}>
                        <Ico name="plus" size={15} /> Criar conta
                      </button>}
                    />
                  </div>
                ) : (
                  accounts.map((acc) => {
                    const t = ACCOUNT_TYPES[acc.type] || { label: acc.type, icon: "🏦" };
                    return (
                      <div key={acc.id} className="account">
                        <div className="row" style={{ gap: 13, minWidth: 0 }}>
                          <span className="account__icon" aria-hidden="true">{t.icon}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="account__name">{acc.name}</div>
                            <div className="account__meta">{acc.bank} · {t.label}</div>
                          </div>
                        </div>
                        <div className="account__actions">
                          <button className="btn" onClick={() => { setUploadAccountId(acc.id); setShowUpload(true); }}>
                            <Ico name="upload" size={15} /> Importar
                          </button>
                          <button className="btn btn--danger btn--icon" onClick={() => handleDeleteAccount(acc)}
                            aria-label={`Apagar conta ${acc.name}`}>
                            <Ico name="trash" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ---------- footer ---------- */}
      <footer className="footer container">
        <span>fintrack · importação OFX/CSV</span>
        <span>{transactions.length} {transactions.length === 1 ? "transação carregada" : "transações carregadas"}</span>
      </footer>

      {/* ---------- modal de upload ---------- */}
      {showUpload && (
        <Modal
          title="Importar extrato"
          subtitle="Aceita arquivos .ofx, .qfx e .csv exportados pelo seu banco."
          onClose={() => { setShowUpload(false); setUploadStatus(null); }}
        >
          {accounts.length === 0 ? (
            <>
              <div className="alert alert--warn">
                Você precisa cadastrar uma conta antes de importar um extrato.
              </div>
              <button className="btn btn--primary btn--block" style={{ marginTop: 14 }}
                onClick={() => { setShowUpload(false); setActiveTab("contas"); setShowNewAccount(true); }}>
                Criar conta agora
              </button>
            </>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              <label className="field">
                <span className="field__label">Conta de destino</span>
                <select className="select" value={uploadAccountId} onChange={(e) => setUploadAccountId(e.target.value)}>
                  <option value="">Selecione uma conta...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} · {acc.bank}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Arquivo</span>
                <input ref={fileRef} className="input input--file" type="file" accept=".ofx,.qfx,.csv" />
              </label>

              <button className="btn btn--primary btn--block" onClick={handleUpload}
                disabled={!uploadAccountId || uploadStatus?.type === "info"}>
                {uploadStatus?.type === "info" ? "Importando..." : "Importar extrato"}
              </button>

              {uploadStatus && (
                <div className={`alert alert--${uploadStatus.type}`}>{uploadStatus.msg}</div>
              )}

              <p className="muted" style={{ fontSize: 12 }}>
                Lançamentos duplicados são detectados e ignorados automaticamente.
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* ---------- toast ---------- */}
      {toast && (
        <div className={`toast toast--${toast.type}`} role="status">
          <span aria-hidden="true">{toast.type === "ok" ? "✅" : "⚠️"}</span>
          <span>{toast.msg}</span>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setToast(null)} aria-label="Fechar aviso">
            <Ico name="close" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
