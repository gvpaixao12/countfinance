import { PrismaClient } from "@prisma/client";
import { PluggyClient } from "pluggy-sdk";
import { categorize } from "../categorizer";
import { checkAlerts } from "../alerts";

const prisma = new PrismaClient();

export function getItemIds(): string[] {
  const raw = process.env.PLUGGY_ITEM_IDS || "";
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

export async function syncTransactions(pluggy: PluggyClient, itemId: string) {
  console.log(`[sync] Sincronizando item ${itemId}...`);

  try {
    const accountsResponse = await pluggy.fetchAccounts(itemId);
    const accounts = accountsResponse.results;

    if (!accounts.length) {
      console.log(`[sync] Nenhuma conta encontrada para item ${itemId}.`);
      return { success: true, count: 0, itemId };
    }

    const lastTx = await prisma.transaction.findFirst({
      orderBy: { date: "desc" },
    });

    const from = lastTx
      ? new Date(lastTx.date).toISOString().split("T")[0]
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const to = new Date().toISOString().split("T")[0];

    let newCount = 0;

    for (const account of accounts) {
      const allTx = await pluggy.fetchAllTransactions(account.id, { from, to });

      for (const tx of allTx) {
        const category = categorize(tx.description, tx.amount, tx.type);

        await prisma.transaction.upsert({
          where: { externalId: tx.id },
          update: {
            description: tx.description,
            amount: tx.amount,
            category,
          },
          create: {
            externalId: tx.id,
            date: new Date(tx.date),
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            accountId: account.id,
            category,
            rawData: JSON.stringify(tx),
          },
        });
        newCount++;
      }
    }

    console.log(`[sync] Item ${itemId}: ${newCount} transacoes processadas.`);
    return { success: true, count: newCount, itemId };
  } catch (error: any) {
    console.error(`[sync] Erro no item ${itemId}:`, error.message);
    return { success: false, error: error.message, itemId };
  }
}

export async function syncAllItems(pluggy: PluggyClient) {
  const itemIds = getItemIds();

  if (!itemIds.length) {
    console.log("[sync] Nenhum PLUGGY_ITEM_IDS configurado.");
    return { success: false, error: "Nenhum item configurado" };
  }

  console.log(`[sync] Sincronizando ${itemIds.length} item(ns)...`);

  const results = [];
  let totalCount = 0;

  for (const itemId of itemIds) {
    const result = await syncTransactions(pluggy, itemId);
    results.push(result);
    if (result.success && result.count) totalCount += result.count;
  }

  await checkAlerts();

  await prisma.syncLog.create({
    data: {
      status: results.every((r) => r.success) ? "success" : "partial",
      txCount: totalCount,
      message: `${itemIds.length} item(ns) sincronizados`,
    },
  });

  console.log(`[sync] Total: ${totalCount} transacoes em ${itemIds.length} item(ns).`);
  return { success: true, totalCount, results };
}
