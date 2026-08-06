/**
 * Lista enviada pro prompt da IA e usada pra validar a resposta dela.
 * De proposito NAO inclui "Salario" nem PENDING: a IA nao tem como saber de
 * quem veio um PIX, entao nao deve poder chutar salario nem marcar pendencia.
 */
const AI_CATEGORIES = [
  "Alimentacao", "Mercado", "Transporte", "Moradia", "Assinaturas",
  "Saude", "Compras", "Lazer", "Seguros", "Transferencias", "Fatura",
  "Emprestimos", "Investimentos", "Rendimentos", "Renda", "Outros",
];

/** Todas as categorias do sistema — e o que a interface oferece pro usuario. */
export const CATEGORIES = [
  "Salario", "Renda", "Rendimentos", "Emprestimos", "Investimentos",
  "Alimentacao", "Mercado", "Transporte", "Moradia", "Assinaturas",
  "Saude", "Compras", "Lazer", "Seguros", "Transferencias", "Fatura",
  "Outros", "AClassificar",
];

/**
 * Caixa de entrada de dinheiro que ainda nao sabemos o que e.
 * Fica de fora de CATEGORIES de proposito: a IA nao deve escolher esta
 * categoria (pra isso ela ja tem "Outros"), e o summary a trata como
 * neutra — nao entra nem em receita nem em despesa.
 */
export const PENDING = "AClassificar";

const RULES: Array<{ pattern: RegExp; category: string }> = [
  // Alimentacao
  { pattern: /ifood|rappi|uber\s*eats|zé delivery|aiqfome/i, category: "Alimentacao" },
  { pattern: /padaria|panificadora|restaurante|lanchonete|pizzaria|burger|sushi/i, category: "Alimentacao" },
  { pattern: /starbucks|mcdonald|subway|bk\s|habib/i, category: "Alimentacao" },
  { pattern: /caffe|café|coffee|tropeiro|bella roma|dona faust/i, category: "Alimentacao" },
  { pattern: /casa de carnes|açougue|churrascaria|espetinho/i, category: "Alimentacao" },
  { pattern: /komilao|buguer|lanches|alimentacao ltda|alimentação|alexbaldi/i, category: "Alimentacao" },
  { pattern: /sorvete|sorveteria|doceria|confeitaria/i, category: "Alimentacao" },

  // Mercado
  { pattern: /supermercado|mercado(?!\s*pago|\s*livre)|carrefour|extra\s|atacadão|assaí/i, category: "Mercado" },
  { pattern: /hortifruti|sacolão|verdemar|boulevard\s*bh|wizmart/i, category: "Mercado" },

  // Transporte
  { pattern: /uber(?!\s*eats)|99\s*app|cabify|lyft/i, category: "Transporte" },
  { pattern: /posto|shell|petrob|ipiranga|gasolina|estaciona/i, category: "Transporte" },
  { pattern: /bhbus|metro|bilhete(?!ria)|passagem/i, category: "Transporte" },
  { pattern: /pneus|auto\s*center|mecanica|oficina|borracharia/i, category: "Transporte" },
  { pattern: /estapar/i, category: "Transporte" },
  { pattern: /ral\s+administra/i, category: "Transporte" },

  // Moradia
  { pattern: /aluguel|condomínio|condo|cemig|copasa|sabesp|luz|energia|água|gás/i, category: "Moradia" },
  { pattern: /internet|vivo\s+fibra|claro\s+net|oi\s+fibra/i, category: "Moradia" },

  // Assinaturas
  { pattern: /netflix|spotify|disney|hbo|amazon\s*prime|youtube\s*pre|apple/i, category: "Assinaturas" },
  { pattern: /chatgpt|claude\.ai|openai|github|notion|figma/i, category: "Assinaturas" },
  { pattern: /lovable|vercel|heroku|subscription/i, category: "Assinaturas" },

  // Saude
  { pattern: /farmácia|drogaria|droga\s*raia|araújo|pague\s*menos|ultrafarma/i, category: "Saude" },
  { pattern: /droga\s*clara|droga\s*minas|farma|drog[a ]/i, category: "Saude" },
  { pattern: /academia|smart\s*fit|gym|unimed|sulamerica|amil|plano.*saúde/i, category: "Saude" },

  // Compras
  { pattern: /amazon|mercado\s*livre|shopee|magalu|casas\s*bahia|americanas/i, category: "Compras" },
  { pattern: /aliexpress|shein|renner|c&a|riachuelo|zara/i, category: "Compras" },
  { pattern: /puma|nike|fisia|adidas|youcom|rommanel|hering/i, category: "Compras" },
  { pattern: /kabum|artigos\s*esport|quiosque|keoto/i, category: "Compras" },

  // Lazer
  { pattern: /arena\s*mrv|cinema|teatro|ingresso|show|estádio|parque/i, category: "Lazer" },
  { pattern: /balad/i, category: "Lazer" },

  // Seguros
  { pattern: /hdi\s*seguros|porto\s*seguro|bradesco\s*seguros|seguro|seguros\s*sa|centauro\s*vida|previdencia/i, category: "Seguros" },

  // Transferencias (pix/ted enviados)
  { pattern: /transfer[eê]ncia\s+enviad|pix\s+enviad|ted\s+enviad/i, category: "Transferencias" },

  // Fatura (pagamento interno cartao + movimentos de credito interno)
  { pattern: /pagamento\s+de\s+fatura/i, category: "Fatura" },
  { pattern: /valor\s+adicionado\s+na\s+conta\s+por\s+cart/i, category: "Fatura" },

  // Emprestimos
  { pattern: /dep[oó]sito\s+de\s+empr[eé]stimo|parcela\s+empr[eé]stimo|empr[eé]stimo/i, category: "Emprestimos" },

  // Investimentos
  { pattern: /aplica[çc][aã]o\s+rdb|aplica[çc][aã]o\s+cdb|tesouro\s+direto|resgate\s+rdb|resgate\s+cdb/i, category: "Investimentos" },
  { pattern: /investimento|aplica[çc][aã]o\s+autom|resgate\s+autom/i, category: "Investimentos" },

  // Rendimentos
  { pattern: /rendimento|juros\s+s\/\s*capital|dividendo|provento/i, category: "Rendimentos" },

  // Salario — so o que temos certeza. "Renda" fica reservada pra outras
  // entradas recorrentes (freela, aluguel) que voce classificar depois.
  // IMPORTANTE: estas regras vem DEPOIS das de "enviado" (acima) de proposito,
  // senao um pix enviado PARA a LeverPro seria contado como salario.
  { pattern: /lever\s*-?\s*pro/i, category: "Salario" },
  { pattern: /sal[áa]rio|folha\s+de\s+pagamento/i, category: "Salario" },

  // Qualquer outra entrada fica pendente de classificacao manual.
  // Antes isso tudo virava "Renda", o que inflava a receita do mes com pix
  // de amigos, reembolsos e estornos.
  { pattern: /transfer[eê]ncia\s+recebid|pix\s+receb|ted\s+receb|reembolso\s+receb/i, category: PENDING },
];

export type UserRule = { pattern: string; category: string; type?: string | null };

/**
 * Regras que o usuario criou na interface ("sempre categorizar assim").
 *
 * Comparacao por substring, nao regex: o texto vem de um campo de formulario e
 * um regex malformado ali quebraria a importacao inteira.
 *
 * A regra so vale para o mesmo sentido do dinheiro (`type`). Sem isso, uma regra
 * "FULANO -> Renda" criada a partir de um PIX recebido tambem capturaria os PIX
 * enviados para o FULANO, transformando gasto em receita.
 */
export function matchUserRule(
  description: string,
  rules: UserRule[],
  type?: string
): string | null {
  const desc = description.toLowerCase();
  const hit = rules.find(
    (r) =>
      r.pattern.trim() !== "" &&
      desc.includes(r.pattern.toLowerCase()) &&
      (!r.type || !type || r.type === type)
  );
  return hit ? hit.category : null;
}

export function categorize(
  description: string,
  amount: number,
  type?: string,
  userRules: UserRule[] = []
): string {
  // O que o usuario definiu explicitamente ganha das regras embutidas.
  const fromUser = matchUserRule(description, userRules, type);
  if (fromUser) return fromUser;

  const match = RULES.find((r) => r.pattern.test(description));
  if (match) return match.category;

  // Os parsers gravam amount sempre positivo (Math.abs); quem carrega o sinal
  // e o type. Entrada sem regra fica pendente — nao chutamos que e salario.
  if (type === "CREDIT") return PENDING;

  return "Outros";
}

// Categoriza em lote usando Groq AI para transacoes que cairam em "Outros"
export async function categorizeBatchWithAI(
  transactions: Array<{ description: string; amount: number; type?: string; index: number }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  const uncategorized = transactions.filter(
    (t) => categorize(t.description, t.amount, t.type) === "Outros"
  );

  if (uncategorized.length === 0) return result;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return result;

  // Monta lista pra IA
  const items = uncategorized.map((t, i) => `${i + 1}. "${t.description}" (R$ ${Math.abs(t.amount).toFixed(2)}, ${t.type})`).join("\n");

  const prompt = `Categorize cada transação bancária brasileira em UMA das categorias:
${AI_CATEGORIES.join(", ")}

Transações:
${items}

Responda APENAS no formato JSON array, sem explicação:
[{"id": 1, "category": "Categoria"}]

Regras:
- Compra no débito em estabelecimento de comida = Alimentacao
- WizmartMg, minimercados pequenos = Mercado
- PIX enviado para pessoa física = Transferencias
- Se não souber, use "Outros"`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      console.error("[groq] Erro:", res.status, await res.text());
      return result;
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extrai JSON da resposta
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return result;

    const parsed: Array<{ id: number; category: string }> = JSON.parse(jsonMatch[0]);

    for (const item of parsed) {
      const tx = uncategorized[item.id - 1];
      if (tx && AI_CATEGORIES.includes(item.category)) {
        result.set(tx.index, item.category);
      }
    }

    console.log(`[groq] ${result.size}/${uncategorized.length} transacoes categorizadas por IA`);
  } catch (err: any) {
    console.error("[groq] Erro ao categorizar:", err.message);
  }

  return result;
}
