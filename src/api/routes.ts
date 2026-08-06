import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import { parseOFX } from "../parsers/ofx";
import { parseCSV } from "../parsers/csv";
import { categorize, categorizeBatchWithAI, PENDING, CATEGORIES } from "../categorizer";

const prisma = new PrismaClient();
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============ ACCOUNTS ============

// GET /api/accounts
router.get("/accounts", async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { createdAt: "desc" } });
  res.json(accounts);
});

// POST /api/accounts
router.post("/accounts", async (req, res) => {
  const { name, type, bank } = req.body;
  const account = await prisma.account.create({ data: { name, type, bank } });
  res.json(account);
});

// DELETE /api/accounts/:id
router.delete("/accounts/:id", async (req, res) => {
  await prisma.transaction.deleteMany({ where: { accountId: req.params.id } });
  await prisma.account.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============ UPLOAD ============

// POST /api/upload — importa OFX ou CSV
router.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  const accountId = req.body.accountId;

  if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  if (!accountId) return res.status(400).json({ error: "accountId obrigatorio" });

  const content = file.buffer.toString("utf-8");
  const ext = file.originalname.toLowerCase();

  try {
    let transactions;

    if (ext.endsWith(".ofx") || ext.endsWith(".qfx")) {
      const parsed = parseOFX(content);
      transactions = parsed.transactions;

      // Salva saldo da conta se disponivel no OFX
      if (parsed.balance !== null) {
        await prisma.account.update({
          where: { id: accountId },
          data: { balance: parsed.balance },
        });
      }
    } else if (ext.endsWith(".csv")) {
      transactions = parseCSV(content);
    } else {
      return res.status(400).json({ error: "Formato nao suportado. Use .ofx ou .csv" });
    }

    // Categoriza: regras do usuario, depois regex, depois IA pra quem ficou "Outros"
    const userRules = await prisma.categoryRule.findMany();
    const categorized = transactions.map((tx, index) => ({
      ...tx,
      index,
      category: categorize(tx.description, tx.amount, tx.type, userRules),
    }));

    // Envia os "Outros" pro Groq categorizar
    const othersForAI = categorized
      .filter((t) => t.category === "Outros")
      .map((t) => ({ description: t.description, amount: t.amount, type: t.type, index: t.index }));

    const aiCategories = await categorizeBatchWithAI(othersForAI);

    // Aplica resultados da IA
    for (const [index, category] of aiCategories) {
      categorized[index].category = category;
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let aiCategorized = aiCategories.size;

    for (const tx of categorized) {
      try {
        const existing = await prisma.transaction.findUnique({
          where: { externalId: tx.externalId },
        });

        if (existing) {
          // Ja existia: atualiza os dados, mas preserva a categoria se voce a
          // escolheu na mao. Sem isso, reimportar o extrato apagaria seu trabalho.
          await prisma.transaction.update({
            where: { externalId: tx.externalId },
            data: existing.manualCategory
              ? { description: tx.description, amount: tx.amount }
              : { description: tx.description, amount: tx.amount, category: tx.category },
          });
          skipped++;
        } else {
          await prisma.transaction.create({
            data: {
              externalId: tx.externalId,
              date: tx.date,
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
              accountId,
              category: tx.category,
            },
          });
          imported++;
        }
      } catch {
        failed++;
      }
    }

    res.json({ success: true, imported, skipped, failed, aiCategorized, total: transactions.length });
  } catch (error: any) {
    console.error("[upload] Erro ao processar arquivo:", error.message);
    res.status(500).json({ error: "Erro ao processar arquivo: " + error.message });
  }
});

// ============ TRANSACTIONS ============

// GET /api/transactions?month=2026-03&category=Alimentacao&accountId=xxx
router.get("/transactions", async (req, res) => {
  const { month, category, limit, accountId } = req.query;
  const where: any = {};

  if (month) {
    const [year, m] = (month as string).split("-").map(Number);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lt: new Date(year, m, 1),
    };
  }

  if (category) where.category = category;
  if (accountId) where.accountId = accountId;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit ? parseInt(limit as string) : 200,
  });

  res.json(transactions);
});

// ============ CATEGORIAS ============

// Categorias embutidas que somam como entrada. As criadas pelo usuario declaram
// isso no campo `kind`.
const BUILTIN_INCOME = ["Salario", "Renda", "Rendimentos", "Emprestimos", PENDING];

/**
 * Chave usada em Transaction.category: sem acento, sem espaco.
 * O range de diacriticos vai escapado (̀-ͯ) em vez de literal — com
 * caracteres combinantes crus o arquivo depende do encoding pra funcionar, e
 * "Salario" virava "Salrio", furando a checagem de colisao com as embutidas.
 */
const DIACRITICS = new RegExp("[\u0300-\u036f]", "g");

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^(\d)/, "C$1");
}

/** Nomes validos para categorizar: embutidas + criadas pelo usuario. */
async function validCategoryNames(): Promise<string[]> {
  const custom = await prisma.category.findMany();
  return [...CATEGORIES, ...custom.map((c: any) => c.name)];
}

// GET /api/categories — o que a interface oferece no seletor
router.get("/categories", async (_req, res) => {
  const custom = await prisma.category.findMany({ orderBy: { createdAt: "asc" } });
  res.json({
    builtin: CATEGORIES,
    custom: custom.map((c: any) => ({
      id: c.id, name: c.name, label: c.label, color: c.color, icon: c.icon, kind: c.kind,
    })),
  });
});

// POST /api/categories — cria uma categoria propria
router.post("/categories", async (req, res) => {
  const label = (req.body.label || "").trim();
  const kind = req.body.kind === "income" ? "income" : "expense";
  const color = (req.body.color || "").trim() || "#a8b0c2";
  const icon = (req.body.icon || "").trim() || "🏷️";

  if (!label) return res.status(400).json({ error: "Informe um nome" });
  if (label.length > 24) return res.status(400).json({ error: "Nome muito longo (max 24)" });
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "Cor invalida" });

  const name = slugify(label);
  if (!name) return res.status(400).json({ error: "Nome precisa ter letras ou numeros" });

  // Comparacao sem diferenciar maiusculas: "A classificar" vira o slug
  // "Aclassificar", que nao bate com a embutida "AClassificar" byte a byte —
  // e o usuario acabaria com duas categorias identicas na tela.
  const taken = (await validCategoryNames()).map((n) => n.toLowerCase());
  const existingLabels = (await prisma.category.findMany()).map((c: any) => c.label.toLowerCase());
  if (taken.includes(name.toLowerCase()) || existingLabels.includes(label.toLowerCase())) {
    return res.status(409).json({ error: "Ja existe uma categoria com esse nome" });
  }

  const category = await prisma.category.create({ data: { name, label, color, icon, kind } });
  res.json(category);
});

// PATCH /api/categories/:id — muda o lado do resumo (entrada/saida) e a aparencia.
// O `name` fica de fora de proposito: e ele que esta gravado em cada Transaction
// e em cada CategoryRule, entao renomear a chave orfanaria tudo que ja foi
// categorizado. Trocar `label` resolve o caso real (o nome exibido estava ruim).
router.patch("/categories/:id", async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Categoria nao encontrada" });

  const data: any = {};

  if (req.body.kind !== undefined) {
    data.kind = req.body.kind === "income" ? "income" : "expense";
  }

  if (req.body.label !== undefined) {
    const label = (req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "Informe um nome" });
    if (label.length > 24) return res.status(400).json({ error: "Nome muito longo (max 24)" });

    const taken = (await prisma.category.findMany())
      .filter((c: any) => c.id !== category.id)
      .map((c: any) => c.label.toLowerCase());
    if (taken.includes(label.toLowerCase())) {
      return res.status(409).json({ error: "Ja existe uma categoria com esse nome" });
    }
    data.label = label;
  }

  if (req.body.color !== undefined) {
    const color = (req.body.color || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "Cor invalida" });
    data.color = color;
  }

  if (req.body.icon !== undefined) {
    const icon = (req.body.icon || "").trim();
    if (!icon) return res.status(400).json({ error: "Informe um icone" });
    data.icon = icon;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar" });
  }

  res.json(await prisma.category.update({ where: { id: category.id }, data }));
});

// DELETE /api/categories/:id — remove e realoca os lancamentos que a usavam
router.delete("/categories/:id", async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Categoria nao encontrada" });

  // Lancamentos orfaos voltam pro balde certo do seu lado do resumo, em vez de
  // ficarem apontando pra uma categoria que nao existe mais.
  const fallback = category.kind === "income" ? PENDING : "Outros";
  const moved = await prisma.transaction.updateMany({
    where: { category: category.name },
    data: { category: fallback, manualCategory: false },
  });
  await prisma.categoryRule.deleteMany({ where: { category: category.name } });
  await prisma.category.delete({ where: { id: category.id } });

  res.json({ ok: true, moved: moved.count, fallback });
});

// PATCH /api/transactions/:id — recategoriza um lancamento
router.patch("/transactions/:id", async (req, res) => {
  const { category } = req.body;

  if (!category || !(await validCategoryNames()).includes(category)) {
    return res.status(400).json({ error: "Categoria invalida" });
  }

  try {
    const tx = await prisma.transaction.update({
      where: { id: req.params.id },
      data: { category, manualCategory: true },
    });
    res.json(tx);
  } catch {
    res.status(404).json({ error: "Transacao nao encontrada" });
  }
});

// ============ REGRAS DO USUARIO ============

// GET /api/rules
router.get("/rules", async (_req, res) => {
  const rules = await prisma.categoryRule.findMany({ orderBy: { createdAt: "desc" } });
  res.json(rules);
});

// POST /api/rules — cria a regra e ja aplica nas transacoes existentes
router.post("/rules", async (req, res) => {
  const pattern = (req.body.pattern || "").trim();
  const { category } = req.body;
  const type = req.body.type === "DEBIT" || req.body.type === "CREDIT" ? req.body.type : null;

  if (!pattern) return res.status(400).json({ error: "Padrao vazio" });
  if (!category || !(await validCategoryNames()).includes(category)) {
    return res.status(400).json({ error: "Categoria invalida" });
  }

  const rule = await prisma.categoryRule.upsert({
    where: { pattern_type: { pattern, type } },
    update: { category },
    create: { pattern, category, type },
  });

  // SQLite no Prisma nao suporta `contains` case-insensitive, entao o filtro
  // e feito em memoria. A base e pessoal (centenas de linhas), cabe tranquilo.
  // O filtro por `type` impede que uma regra de dinheiro que entra capture
  // tambem os lancamentos enviados para a mesma pessoa.
  const all = await prisma.transaction.findMany();
  const needle = pattern.toLowerCase();
  const targets = all.filter(
    (t: any) =>
      t.description.toLowerCase().includes(needle) &&
      t.category !== category &&
      !t.manualCategory &&
      (!type || t.type === type)
  );

  for (const t of targets) {
    await prisma.transaction.update({ where: { id: t.id }, data: { category } });
  }

  res.json({ rule, applied: targets.length });
});

// DELETE /api/rules/:id — remove a regra (nao reverte o que ja foi aplicado)
router.delete("/rules/:id", async (req, res) => {
  try {
    await prisma.categoryRule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Regra nao encontrada" });
  }
});

// GET /api/summary?month=2026-03&accountId=xxx
router.get("/summary", async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const accountId = req.query.accountId as string | undefined;
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 1);

  const where: any = { date: { gte: start, lt: end } };
  if (accountId) where.accountId = accountId;

  const transactions = await prisma.transaction.findMany({ where });

  // PENDING conta como entrada: e dinheiro que de fato caiu na conta, e o card
  // "Entradas por categoria" tem que mostrar tudo que entrou. Ele aparece como
  // fatia propria ("A classificar"), entao da pra ver que falta categorizar sem
  // que o valor suma do relatorio. O campo `pending` abaixo alimenta o aviso.
  //
  // Categorias criadas pelo usuario entram pelo `kind`: as de entrada se juntam
  // as embutidas; as de saida caem naturalmente em expenseTxs.
  const customCats = await prisma.category.findMany();
  const customIncome = customCats.filter((c: any) => c.kind === "income").map((c: any) => c.name);

  const notExpense = [...BUILTIN_INCOME, "Fatura", "Investimentos", ...customIncome];
  const incomeCategories = [...BUILTIN_INCOME, ...customIncome];

  const incomeTxs = transactions.filter((t: any) => incomeCategories.includes(t.category));
  const investmentTxs = transactions.filter((t: any) => t.category === "Investimentos");
  const expenseTxs = transactions.filter((t: any) => !notExpense.includes(t.category));
  const pendingTxs = transactions.filter((t: any) => t.category === PENDING);

  const income = incomeTxs.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
  const expenses = expenseTxs.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
  const invested = investmentTxs.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);

  // Gastos por categoria
  const byCategory: Record<string, { total: number; count: number }> = {};
  expenseTxs.forEach((t: any) => {
    if (!byCategory[t.category]) byCategory[t.category] = { total: 0, count: 0 };
    byCategory[t.category].total += Math.abs(t.amount);
    byCategory[t.category].count++;
  });

  // Entradas por categoria
  const byIncomeCategory: Record<string, { total: number; count: number }> = {};
  incomeTxs.forEach((t: any) => {
    if (!byIncomeCategory[t.category]) byIncomeCategory[t.category] = { total: 0, count: 0 };
    byIncomeCategory[t.category].total += Math.abs(t.amount);
    byIncomeCategory[t.category].count++;
  });

  // Saldo da conta
  const accountWhere: any = {};
  if (accountId) accountWhere.id = accountId;
  const accs = await prisma.account.findMany({ where: accountWhere });
  const accountBalance = accs.reduce((s: number, a: any) => s + (a.balance || 0), 0);

  const pending = {
    total: pendingTxs.reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    count: pendingTxs.length,
  };

  res.json({ month, income, expenses, balance: income - expenses, invested, accountBalance, byCategory, byIncomeCategory, pending });
});

// ============ FATURAS DE CARTAO ============

const MONTH_RE = /^\d{4}-\d{2}$/;

// Vencimento chega como "2026-08-10". Fixamos meio-dia UTC pra que o dia nao
// escorregue quando a data for lida no fuso do Brasil (mesma logica do front).
function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/bills?month=2026-08 — sem month, devolve todas
router.get("/bills", async (req, res) => {
  const month = req.query.month as string | undefined;

  const bills = await prisma.cardBill.findMany({
    where: month ? { month } : {},
    orderBy: [{ month: "desc" }, { createdAt: "asc" }],
  });

  // Junta o nome do cartao pra lista nao precisar cruzar isso na tela.
  const accounts = await prisma.account.findMany();
  const byId = new Map(accounts.map((a: any) => [a.id, a]));

  res.json(
    bills.map((b: any) => {
      const acc = byId.get(b.accountId);
      return { ...b, accountName: acc?.name ?? "Conta removida", accountBank: acc?.bank ?? "" };
    })
  );
});

// POST /api/bills — cria ou sobrescreve a fatura daquele cartao naquele mes
router.post("/bills", async (req, res) => {
  const { accountId, month, dueDate } = req.body;
  const amount = Number(req.body.amount);

  if (!accountId) return res.status(400).json({ error: "accountId obrigatorio" });
  if (!MONTH_RE.test(month || "")) return res.status(400).json({ error: "Mes invalido (use AAAA-MM)" });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Valor invalido" });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: "Conta nao encontrada" });

  const due = parseDueDate(dueDate);

  const bill = await prisma.cardBill.upsert({
    where: { accountId_month: { accountId, month } },
    update: { amount, dueDate: due },
    create: { accountId, month, amount, dueDate: due },
  });

  res.json(bill);
});

// PATCH /api/bills/:id — ajusta valor, vencimento ou marca como paga
router.patch("/bills/:id", async (req, res) => {
  const data: any = {};

  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valor invalido" });
    }
    data.amount = amount;
  }
  if (req.body.dueDate !== undefined) data.dueDate = parseDueDate(req.body.dueDate);
  if (req.body.paid !== undefined) data.paid = Boolean(req.body.paid);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar" });
  }

  try {
    res.json(await prisma.cardBill.update({ where: { id: req.params.id }, data }));
  } catch {
    res.status(404).json({ error: "Fatura nao encontrada" });
  }
});

// DELETE /api/bills/:id
router.delete("/bills/:id", async (req, res) => {
  try {
    await prisma.cardBill.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Fatura nao encontrada" });
  }
});

// ============ ALERTS & BUDGETS ============

router.get("/alerts", async (_req, res) => {
  const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  res.json(alerts);
});

router.get("/budgets", async (_req, res) => {
  res.json(await prisma.budget.findMany());
});

router.post("/budgets", async (req, res) => {
  const { category, limit } = req.body;
  const budget = await prisma.budget.upsert({
    where: { category },
    update: { limit },
    create: { category, limit },
  });
  res.json(budget);
});

export default router;
