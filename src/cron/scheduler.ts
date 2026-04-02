import cron from "node-cron";
import { syncAllItems, getItemIds } from "../pluggy/sync";
import { getPluggyClient } from "../pluggy/client";

export function startScheduler() {
  const itemIds = getItemIds();

  if (!itemIds.length) {
    console.log("[cron] PLUGGY_ITEM_IDS nao configurado — scheduler desativado. Conecte uma conta primeiro.");
    return;
  }

  const pluggy = getPluggyClient();

  // Sincronizar a cada 4 horas
  cron.schedule("0 */4 * * *", async () => {
    console.log("[cron] Sincronizacao agendada iniciada");
    await syncAllItems(pluggy);
  });

  // Checar alertas a cada hora
  cron.schedule("0 * * * *", async () => {
    const { checkAlerts } = await import("../alerts");
    await checkAlerts();
  });

  console.log(`[cron] Scheduler iniciado — ${itemIds.length} item(ns), sync a cada 4h, alertas a cada 1h`);
}
