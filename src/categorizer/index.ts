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
  { pattern: /supermercado|mercado|carrefour|extra\s|atacadão|assaí/i, category: "Mercado" },
  { pattern: /hortifruti|sacolão|verdemar|boulevard\s*bh/i, category: "Mercado" },

  // Transporte
  { pattern: /uber(?!\s*eats)|99\s*app|cabify|lyft/i, category: "Transporte" },
  { pattern: /posto|shell|petrob|ipiranga|gasolina|estaciona/i, category: "Transporte" },
  { pattern: /bhbus|metro|bilhete|passagem/i, category: "Transporte" },
  { pattern: /pneus|auto\s*center|mecanica|oficina|borracharia/i, category: "Transporte" },

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

  // Seguros
  { pattern: /hdi\s*seguros|porto\s*seguro|bradesco\s*seguros|seguro|seguros\s*sa/i, category: "Seguros" },

  // Transferencias
  { pattern: /pix\s+enviado|transferência\s+enviado|ted\s+enviado/i, category: "Transferencias" },

  // Fatura (pagamento interno cartao)
  { pattern: /pagamento\s+de\s+fatura/i, category: "Fatura" },

  // Renda
  { pattern: /salário|salario|pix\s+receb|transferência\s+receb|ted\s+receb/i, category: "Renda" },
];

export function categorize(description: string, amount: number, type?: string): string {
  const match = RULES.find((r) => r.pattern.test(description));
  if (match) return match.category;

  // CREDIT no extrato = dinheiro entrando
  if (type === "CREDIT") return "Renda";

  // Valor negativo na conta corrente = saida
  if (amount < 0) return "Outros";

  // DEBIT com valor positivo = gasto no cartao de credito
  if (type === "DEBIT") return "Outros";

  return "Outros";
}
