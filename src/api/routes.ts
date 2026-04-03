import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import { parseOFX } from "../parsers/ofx";
import { parseCSV } from "../parsers/csv";
import { categorize, categorizeBatchWithAI } from "../categorizer";

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

    // Categoriza: regex primeiro, depois IA pra quem ficou "Outros"
    const categorized = transactions.map((tx, index) => ({
      ...tx,
      index,
      category: categorize(tx.description, tx.amount, tx.type),
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
    let aiCategorized = aiCategories.size;

    for (const tx of categorized) {
      try {
        await prisma.transaction.upsert({
          where: { externalId: tx.externalId },
          update: { description: tx.description, amount: tx.amount, category: tx.category },
          create: {
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
      } catch {
        skipped++;
      }
    }

    res.json({ success: true, imported, skipped, aiCategorized, total: transactions.length });
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

  const notExpense = ["Renda", "Fatura", "Investimentos", "Rendimentos", "Emprestimos"];
  const incomeCategories = ["Renda", "Rendimentos", "Emprestimos"];

  const incomeTxs = transactions.filter((t: any) => incomeCategories.includes(t.category));
  const investmentTxs = transactions.filter((t: any) => t.category === "Investimentos");
  const expenseTxs = transactions.filter((t: any) => !notExpense.includes(t.category));

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

  res.json({ month, income, expenses, balance: income - expenses, invested, accountBalance, byCategory, byIncomeCategory });
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
