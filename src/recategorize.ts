import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { categorize } from "./categorizer";

const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany();
  let updated = 0;
  for (const t of txs) {
    const newCat = categorize(t.description, t.amount, t.type);
    if (newCat !== t.category) {
      await prisma.transaction.update({ where: { id: t.id }, data: { category: newCat } });
      console.log(`${t.description.trim()} → ${newCat}`);
      updated++;
    }
  }
  console.log(`\n${updated} transacoes atualizadas.`);
}

main().finally(() => prisma.$disconnect());
