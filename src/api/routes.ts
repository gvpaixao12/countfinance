import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { syncAllItems, getItemIds } from "../pluggy/sync";
import { getPluggyClient } from "../pluggy/client";

const prisma = new PrismaClient();
const router = Router();

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

  // Renda = categoria "Renda"
  // Fatura = pagamento interno do cartao (nao conta como receita nem despesa)
  // Todo o resto = despesa (inclusive DEBIT com valor positivo do cartao de credito)
  const incomeTxs = transactions.filter((t) => t.category === "Renda");
  const expenseTxs = transactions.filter((t) => t.category !== "Renda" && t.category !== "Fatura");

  const income = incomeTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = expenseTxs.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCategory: Record<string, { total: number; count: number }> = {};
  expenseTxs.forEach((t) => {
    if (!byCategory[t.category]) byCategory[t.category] = { total: 0, count: 0 };
    byCategory[t.category].total += Math.abs(t.amount);
    byCategory[t.category].count++;
  });

  res.json({ month, income, expenses, balance: income - expenses, byCategory });
});

// GET /api/alerts
router.get("/alerts", async (_req, res) => {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(alerts);
});

// POST /api/sync — trigger manual (sincroniza todas as contas)
router.post("/sync", async (_req, res) => {
  const itemIds = getItemIds();

  if (!itemIds.length) {
    return res.status(400).json({ error: "PLUGGY_ITEM_IDS nao configurado. Conecte uma conta primeiro." });
  }

  const pluggy = getPluggyClient();
  const result = await syncAllItems(pluggy);
  res.json(result);
});

// GET /api/balances — saldo real das contas via Pluggy
router.get("/balances", async (_req, res) => {
  const itemIds = getItemIds();
  if (!itemIds.length) {
    return res.json({ total: 0, accounts: [] });
  }

  try {
    const pluggy = getPluggyClient();
    const accounts: any[] = [];

    for (const itemId of itemIds) {
      const accountsResponse = await pluggy.fetchAccounts(itemId);
      for (const account of accountsResponse.results) {
        accounts.push({
          id: account.id,
          name: account.name || account.marketingName || "Conta",
          type: account.type,
          subtype: account.subtype,
          balance: account.balance,
          currencyCode: account.currencyCode,
        });
      }
    }

    const bankAccounts = accounts.filter((a) => a.type === "BANK");
    const totalBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);

    res.json({ total: totalBalance, accounts });
  } catch (error: any) {
    console.error("[balances] Erro ao buscar saldos:", error.message);
    res.json({ total: 0, accounts: [] });
  }
});

// GET /api/bills — faturas do cartao de credito via Pluggy
router.get("/bills", async (req, res) => {
  const itemIds = getItemIds();
  const filterAccountId = req.query.accountId as string | undefined;
  if (!itemIds.length) {
    return res.json([]);
  }

  try {
    const pluggy = getPluggyClient();
    const allBills: any[] = [];

    for (const itemId of itemIds) {
      const accountsResponse = await pluggy.fetchAccounts(itemId, "CREDIT");
      let creditAccounts = accountsResponse.results;

      if (filterAccountId) {
        creditAccounts = creditAccounts.filter((a) => a.id === filterAccountId);
      }

      for (const account of creditAccounts) {
        const billsResponse = await pluggy.fetchCreditCardBills(account.id);
        const bills = billsResponse.results;
        const accountName = account.name || account.marketingName || "Cartao";
        const brand = account.creditData?.brand || null;
        const creditLimit = account.creditData?.creditLimit || null;
        const availableLimit = account.creditData?.availableCreditLimit || null;

        for (const bill of bills) {
          allBills.push({
            id: bill.id,
            dueDate: bill.dueDate,
            totalAmount: bill.totalAmount,
            minimumPayment: bill.minimumPaymentAmount,
            currencyCode: bill.totalAmountCurrencyCode,
            accountName,
            brand,
            creditLimit,
            availableLimit,
            status: "CLOSED",
          });
        }

        // Fatura aberta (ainda nao fechou): usa o saldo do cartao e estima o proximo vencimento
        const now = new Date();
        const lastBillDueDate = bills.length > 0
          ? new Date(Math.max(...bills.map((b) => new Date(b.dueDate).getTime())))
          : null;

        const hasFutureBill = bills.some((b) => new Date(b.dueDate) >= now);

        if (!hasFutureBill && account.balance > 0) {
          // Estima proximo vencimento: mesmo dia do ultimo, mes seguinte
          let nextDueDate: Date;
          if (lastBillDueDate) {
            nextDueDate = new Date(lastBillDueDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          } else if (account.creditData?.balanceDueDate) {
            nextDueDate = new Date(account.creditData.balanceDueDate);
            if (nextDueDate < now) nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          } else {
            nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
          }

          allBills.push({
            id: `open-${account.id}`,
            dueDate: nextDueDate.toISOString(),
            totalAmount: account.balance,
            minimumPayment: null,
            currencyCode: account.currencyCode,
            accountName,
            brand,
            creditLimit,
            availableLimit,
            status: "OPEN",
          });
        }
      }
    }

    // Ordena por data de vencimento
    allBills.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    res.json(allBills);
  } catch (error: any) {
    console.error("[bills] Erro ao buscar faturas:", error.message);
    res.json([]);
  }
});

// GET /api/investments — investimentos via Pluggy
router.get("/investments", async (_req, res) => {
  const itemIds = getItemIds();
  if (!itemIds.length) {
    return res.json([]);
  }

  try {
    const pluggy = getPluggyClient();
    const allInvestments: any[] = [];

    for (const itemId of itemIds) {
      const response = await pluggy.fetchInvestments(itemId);

      for (const inv of response.results) {
        allInvestments.push({
          id: inv.id,
          name: inv.name,
          type: inv.type,
          subtype: inv.subtype,
          balance: inv.balance,
          amount: inv.amount,
          amountOriginal: inv.amountOriginal,
          amountProfit: inv.amountProfit,
          currencyCode: inv.currencyCode,
          rate: inv.rate,
          rateType: inv.rateType,
          fixedAnnualRate: inv.fixedAnnualRate,
          lastMonthRate: inv.lastMonthRate,
          lastTwelveMonthsRate: inv.lastTwelveMonthsRate,
          annualRate: inv.annualRate,
          status: inv.status,
          dueDate: inv.dueDate,
          issuer: inv.issuer,
          institution: inv.institution?.name || null,
          date: inv.date,
          itemId: inv.itemId,
        });
      }
    }

    res.json(allInvestments);
  } catch (error: any) {
    console.error("[investments] Erro ao buscar investimentos:", error.message);
    res.json([]);
  }
});

// GET /api/budgets
router.get("/budgets", async (_req, res) => {
  res.json(await prisma.budget.findMany());
});

// POST /api/budgets
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
