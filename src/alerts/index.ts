import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

export async function checkAlerts() {
  const budgets = await prisma.budget.findMany();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const budget of budgets) {
    const result = await prisma.transaction.aggregate({
      where: {
        category: budget.category,
        amount: { lt: 0 },
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const spent = Math.abs(result._sum.amount || 0);
    const pct = (spent / budget.limit) * 100;

    if (pct >= 90) {
      await createAlert(
        "budget_warning",
        `${budget.category}: R$ ${spent.toFixed(2)} de R$ ${budget.limit.toFixed(2)} (${pct.toFixed(0)}%)`
      );
    }
  }

  const recentBig = await prisma.transaction.findMany({
    where: {
      amount: { lt: -500 },
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
  });

  for (const tx of recentBig) {
    await createAlert(
      "large_expense",
      `Gasto alto: ${tx.description} - R$ ${Math.abs(tx.amount).toFixed(2)}`
    );
  }
}

async function createAlert(type: string, message: string) {
  const exists = await prisma.alert.findFirst({
    where: { message, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (exists) return;

  await prisma.alert.create({ data: { type, message } });

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
        }
      );
    } catch (e) {
      console.error("[alert] Falha ao enviar Telegram:", e);
    }
  }
}
