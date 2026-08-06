import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { categorize } from "./categorizer";

const prisma = new PrismaClient();

/**
 * Reaplica as regras de categorizacao nas transacoes ja importadas.
 * Nao precisa do arquivo original — le e reescreve direto no banco.
 *
 *   npm run recategorize -- --dry    mostra o que mudaria, sem gravar
 *   npm run recategorize             aplica
 */
async function main() {
  const dry = process.argv.includes("--dry");
  const txs = await prisma.transaction.findMany({ orderBy: { date: "desc" } });
  const userRules = await prisma.categoryRule.findMany();

  let updated = 0;
  let kept = 0;

  for (const t of txs) {
    // Escolha manual manda: nunca sobrescreve.
    if (t.manualCategory) {
      kept++;
      continue;
    }

    const next = categorize(t.description, t.amount, t.type, userRules);
    if (next === t.category) continue;

    // Este script so roda as regras regex — a IA nao participa. Sem esta
    // guarda, toda transacao que o Groq classificou e que nao bate em regex
    // seria rebaixada para "Outros", jogando fora o trabalho da IA.
    if (next === "Outros" && t.category !== "Outros") {
      console.log(`mantido  ${t.category.padEnd(14)} ${t.description.trim().slice(0, 60)}`);
      kept++;
      continue;
    }

    console.log(`${dry ? "mudaria " : "alterado"} ${t.category.padEnd(14)} -> ${next.padEnd(14)} ${t.description.trim().slice(0, 60)}`);
    if (!dry) {
      await prisma.transaction.update({ where: { id: t.id }, data: { category: next } });
    }
    updated++;
  }

  console.log(
    `\n${updated} ${dry ? "mudariam" : "atualizadas"}, ${kept} preservadas de ${txs.length} transacoes.` +
      (dry ? "\n*** DRY RUN — nada foi gravado ***" : "")
  );
}

main().finally(() => prisma.$disconnect());
