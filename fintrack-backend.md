# fintrack — Backend Node/TypeScript

Projeto completo para integrar automaticamente as movimentações do Nubank
via Pluggy API, categorizar gastos com IA, e disparar alertas.

---

## 📁 Estrutura do Projeto

```
fintrack/
├── package.json
├── tsconfig.json
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts              # Entry point + Express server
│   ├── pluggy/
│   │   ├── client.ts         # Pluggy API client
│   │   └── sync.ts           # Sincronização de transações
│   ├── categorizer/
│   │   └── index.ts          # Categorização automática
│   ├── alerts/
│   │   └── index.ts          # Sistema de alertas
│   ├── cron/
│   │   └── scheduler.ts      # Jobs agendados
│   └── api/
│       └── routes.ts         # API REST pro dashboard
```

---

## 1. package.json

```json
{
  "name": "fintrack",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "@prisma/client": "^5.10.0",
    "node-cron": "^3.0.3",
    "axios": "^1.6.7",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "prisma": "^5.10.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node-cron": "^3.0.11"
  }
}
```

---

## 2. .env.example

```env
# Pluggy — crie sua conta em https://pluggy.ai
PLUGGY_CLIENT_ID=seu_client_id
PLUGGY_CLIENT_SECRET=seu_client_secret

# ID do item (conta Nubank) — gerado após conectar a conta
PLUGGY_ITEM_ID=

# Banco de dados
DATABASE_URL="file:./dev.db"

# Telegram (opcional, pra alertas)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Porta
PORT=3001
```

---

## 3. prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Transaction {
  id          String   @id @default(uuid())
  externalId  String   @unique  // ID da Pluggy
  date        DateTime
  description String
  amount      Float
  category    String   @default("Outros")
  type        String   // DEBIT ou CREDIT
  accountId   String
  rawData     String?  // JSON original da Pluggy
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model SyncLog {
  id        String   @id @default(uuid())
  status    String   // success | error
  txCount   Int      @default(0)
  message   String?
  createdAt DateTime @default(now())
}

model Alert {
  id        String   @id @default(uuid())
  type      String   // budget_warning | large_expense | income_received
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Budget {
  id       String @id @default(uuid())
  category String @unique
  limit    Float
}
```

---

## 4. src/pluggy/client.ts — Cliente da API Pluggy

```typescript
import axios, { AxiosInstance } from "axios";

const PLUGGY_BASE = "https://api.pluggy.ai";

export class PluggyClient {
  private api: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private clientId: string,
    private clientSecret: string
  ) {
    this.api = axios.create({ baseURL: PLUGGY_BASE });
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const { data } = await this.api.post("/auth", {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    this.accessToken = data.apiKey;
    // Token dura 2h, renovamos com 10min de margem
    this.tokenExpiry = Date.now() + 110 * 60 * 1000;
    return this.accessToken!;
  }

  private async request(method: string, path: string, params?: any) {
    const token = await this.authenticate();
    const { data } = await this.api.request({
      method,
      url: path,
      headers: { "X-API-KEY": token },
      params: method === "GET" ? params : undefined,
      data: method !== "GET" ? params : undefined,
    });
    return data;
  }

  // Buscar todas as transações de um item (conta)
  async getTransactions(itemId: string, from?: string, to?: string) {
    const allTx: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.request("GET", `/transactions`, {
        itemId,
        from: from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        to: to || new Date().toISOString().split("T")[0],
        pageSize: 500,
        page,
      });

      allTx.push(...result.results);
      hasMore = result.results.length === 500;
      page++;
    }

    return allTx;
  }

  // Buscar saldo da conta
  async getAccounts(itemId: string) {
    return this.request("GET", `/accounts`, { itemId });
  }

  // Gerar link de conexão (Connect Token)
  async createConnectToken(itemId?: string) {
    return this.request("POST", "/connect_token", {
      ...(itemId ? { itemId } : {}),
    });
  }
}
```

---

## 5. src/pluggy/sync.ts — Sincronização

```typescript
import { PrismaClient } from "@prisma/client";
import { PluggyClient } from "./client";
import { categorize } from "../categorizer";
import { checkAlerts } from "../alerts";

const prisma = new PrismaClient();

export async function syncTransactions(pluggy: PluggyClient, itemId: string) {
  console.log("[sync] Iniciando sincronização...");

  try {
    // Buscar última transação no banco pra saber de onde começar
    const lastTx = await prisma.transaction.findFirst({
      orderBy: { date: "desc" },
    });

    const from = lastTx
      ? new Date(lastTx.date).toISOString().split("T")[0]
      : undefined; // Se não tem nada, pega últimos 30 dias (padrão)

    const transactions = await pluggy.getTransactions(itemId, from);
    let newCount = 0;

    for (const tx of transactions) {
      // Upsert — se já existe, atualiza; se não, cria
      const category = categorize(tx.description, tx.amount);

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
          type: tx.type, // DEBIT ou CREDIT
          accountId: tx.accountId,
          category,
          rawData: JSON.stringify(tx),
        },
      });
      newCount++;
    }

    // Checar alertas após sincronizar
    await checkAlerts();

    // Log
    await prisma.syncLog.create({
      data: { status: "success", txCount: newCount },
    });

    console.log(`[sync] ${newCount} transações processadas.`);
    return { success: true, count: newCount };
  } catch (error: any) {
    console.error("[sync] Erro:", error.message);
    await prisma.syncLog.create({
      data: { status: "error", message: error.message },
    });
    return { success: false, error: error.message };
  }
}
```

---

## 6. src/categorizer/index.ts — Categorização automática

```typescript
// Regras de categorização baseadas em padrões do Nubank
const RULES: Array<{ pattern: RegExp; category: string }> = [
  // Alimentação
  { pattern: /ifood|rappi|uber\s*eats|zé delivery|aiqfome/i, category: "Alimentação" },
  { pattern: /padaria|restaurante|lanchonete|pizzaria|burger|sushi/i, category: "Alimentação" },
  { pattern: /starbucks|mcdonald|subway|bk\s|habib/i, category: "Alimentação" },

  // Mercado
  { pattern: /supermercado|mercado|carrefour|extra\s|atacadão|assaí|bh\s/i, category: "Mercado" },
  { pattern: /hortifruti|sacolão|verdemar/i, category: "Mercado" },

  // Transporte
  { pattern: /uber(?!\s*eats)|99|cabify|lyft/i, category: "Transporte" },
  { pattern: /posto|shell|petrob|ipiranga|gasolina|estaciona/i, category: "Transporte" },
  { pattern: /bhbus|metro|bilhete|passagem/i, category: "Transporte" },

  // Moradia
  { pattern: /aluguel|condomínio|condo|cemig|copasa|sabesp|luz|energia|água|gás/i, category: "Moradia" },
  { pattern: /internet|vivo\s+fibra|claro\s+net|oi\s+fibra/i, category: "Moradia" },

  // Assinaturas
  { pattern: /netflix|spotify|disney|hbo|amazon\s*prime|youtube\s*pre|apple/i, category: "Assinaturas" },
  { pattern: /chatgpt|claude|openai|github|notion|figma/i, category: "Assinaturas" },

  // Saúde
  { pattern: /farmácia|drogaria|droga\s*raia|araújo|pague\s*menos|ultrafarma/i, category: "Saúde" },
  { pattern: /academia|smart\s*fit|gym|unimed|sulamerica|amil|plano.*saúde/i, category: "Saúde" },

  // Compras
  { pattern: /amazon|mercado\s*livre|shopee|magalu|casas\s*bahia|americanas/i, category: "Compras" },
  { pattern: /aliexpress|shein|renner|c&a|riachuelo|zara/i, category: "Compras" },

  // Renda
  { pattern: /salário|salario|pix\s+receb|transferência\s+receb|ted\s+receb/i, category: "Renda" },
];

export function categorize(description: string, amount: number): string {
  // Créditos sem match são "Renda" por padrão
  if (amount > 0) {
    const match = RULES.find((r) => r.pattern.test(description));
    return match?.category || "Renda";
  }

  // Débitos
  const match = RULES.find((r) => r.pattern.test(description));
  return match?.category || "Outros";
}
```

---

## 7. src/alerts/index.ts — Alertas

```typescript
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

export async function checkAlerts() {
  const budgets = await prisma.budget.findMany();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const budget of budgets) {
    // Somar gastos da categoria no mês atual
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
        `⚠️ ${budget.category}: R$ ${spent.toFixed(2)} de R$ ${budget.limit.toFixed(2)} (${pct.toFixed(0)}%)`
      );
    }
  }

  // Alerta pra gastos grandes (> R$ 500)
  const recentBig = await prisma.transaction.findMany({
    where: {
      amount: { lt: -500 },
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // últimas 2h
    },
  });

  for (const tx of recentBig) {
    await createAlert(
      "large_expense",
      `🔴 Gasto alto: ${tx.description} — R$ ${Math.abs(tx.amount).toFixed(2)}`
    );
  }
}

async function createAlert(type: string, message: string) {
  // Evitar duplicatas
  const exists = await prisma.alert.findFirst({
    where: { message, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (exists) return;

  await prisma.alert.create({ data: { type, message } });

  // Enviar pro Telegram se configurado
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }
      );
    } catch (e) {
      console.error("[alert] Falha ao enviar Telegram:", e);
    }
  }
}
```

---

## 8. src/cron/scheduler.ts — Agendamento

```typescript
import cron from "node-cron";
import { syncTransactions } from "../pluggy/sync";
import { PluggyClient } from "../pluggy/client";

export function startScheduler() {
  const pluggy = new PluggyClient(
    process.env.PLUGGY_CLIENT_ID!,
    process.env.PLUGGY_CLIENT_SECRET!
  );
  const itemId = process.env.PLUGGY_ITEM_ID!;

  // Sincronizar a cada 4 horas
  cron.schedule("0 */4 * * *", async () => {
    console.log("[cron] Sincronização agendada iniciada");
    await syncTransactions(pluggy, itemId);
  });

  // Checar alertas a cada hora
  cron.schedule("0 * * * *", async () => {
    const { checkAlerts } = await import("../alerts");
    await checkAlerts();
  });

  console.log("[cron] Scheduler iniciado — sync a cada 4h, alertas a cada 1h");
}
```

---

## 9. src/api/routes.ts — API REST

```typescript
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { syncTransactions } from "../pluggy/sync";
import { PluggyClient } from "../pluggy/client";

const prisma = new PrismaClient();
const router = Router();

// GET /api/transactions?month=2026-03&category=Alimentação
router.get("/transactions", async (req, res) => {
  const { month, category, limit } = req.query;

  const where: any = {};

  if (month) {
    const [year, m] = (month as string).split("-").map(Number);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lt: new Date(year, m, 1),
    };
  }

  if (category) where.category = category;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit ? parseInt(limit as string) : 200,
  });

  res.json(transactions);
});

// GET /api/summary?month=2026-03
router.get("/summary", async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 1);

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end } },
  });

  const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  // Agrupar por categoria
  const byCategory: Record<string, { total: number; count: number }> = {};
  transactions
    .filter((t) => t.amount < 0)
    .forEach((t) => {
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

// POST /api/sync — trigger manual
router.post("/sync", async (_req, res) => {
  const pluggy = new PluggyClient(
    process.env.PLUGGY_CLIENT_ID!,
    process.env.PLUGGY_CLIENT_SECRET!
  );
  const result = await syncTransactions(pluggy, process.env.PLUGGY_ITEM_ID!);
  res.json(result);
});

// CRUD de budgets
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
```

---

## 10. src/index.ts — Entry point

```typescript
import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./api/routes";
import { startScheduler } from "./cron/scheduler";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", routes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🟣 fintrack rodando em http://localhost:${PORT}`);
  startScheduler();
});
```

---

## 🚀 Como rodar

```bash
# 1. Clonar e instalar
git clone <repo>
cd fintrack
npm install

# 2. Configurar variáveis
cp .env.example .env
# Editar .env com suas credenciais da Pluggy

# 3. Criar banco
npx prisma db push

# 4. Rodar
npm run dev
```

## 🔗 Conectar o Nubank

1. Crie uma conta gratuita em **https://pluggy.ai**
2. No painel da Pluggy, pegue o `CLIENT_ID` e `CLIENT_SECRET`
3. Use o Connect Widget da Pluggy pra autenticar sua conta Nubank
4. O widget gera um `ITEM_ID` — coloque no `.env`
5. Pronto! O cron sincroniza automaticamente a cada 4h

## 📲 Alertas via Telegram (opcional)

1. Crie um bot com o @BotFather no Telegram
2. Pegue o token e seu chat_id
3. Coloque no `.env`
4. Alertas de orçamento e gastos altos chegam direto no Telegram
