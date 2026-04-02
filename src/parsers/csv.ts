import { ParsedTransaction } from "./ofx";

export function parseCSV(content: string): ParsedTransaction[] {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const separator = header.includes(";") ? ";" : ",";
  const columns = header.split(separator).map((c) => c.trim().replace(/"/g, ""));

  // Auto-detect column mapping
  const dateCol = columns.findIndex((c) => /^(data|date)$/i.test(c));
  const descCol = columns.findIndex((c) => /^(descri|title|descrição|descricao|memo|hist|lancamento)/.test(c));
  const amountCol = columns.findIndex((c) => /^(valor|amount|value|quantia)$/i.test(c));
  const categoryCol = columns.findIndex((c) => /^(categor)/i.test(c));

  if (dateCol < 0 || amountCol < 0) {
    // Try Nubank format: date,category,title,amount
    if (columns.length >= 4) {
      return parseNubankCSV(lines.slice(1), separator);
    }
    return [];
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i], separator);
    if (values.length <= Math.max(dateCol, amountCol)) continue;

    const dateStr = values[dateCol]?.replace(/"/g, "").trim();
    const desc = values[descCol >= 0 ? descCol : 1]?.replace(/"/g, "").trim() || "Sem descricao";
    const amountStr = values[amountCol]?.replace(/"/g, "").trim();

    if (!dateStr || !amountStr) continue;

    const date = parseDate(dateStr);
    if (!date) continue;

    const amount = parseAmount(amountStr);
    const type: "DEBIT" | "CREDIT" = amount < 0 ? "DEBIT" : "CREDIT";

    transactions.push({
      externalId: `csv-${dateStr}-${Math.abs(amount)}-${desc.substring(0, 20)}`,
      date,
      description: desc,
      amount: Math.abs(amount),
      type,
    });
  }

  return transactions;
}

function parseNubankCSV(lines: string[], sep: string): ParsedTransaction[] {
  // Nubank format: date,category,title,amount
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const values = splitCSVLine(line, sep);
    if (values.length < 4) continue;

    const dateStr = values[0]?.replace(/"/g, "").trim();
    const desc = values[2]?.replace(/"/g, "").trim() || values[1]?.replace(/"/g, "").trim() || "Sem descricao";
    const amountStr = values[3]?.replace(/"/g, "").trim();

    if (!dateStr || !amountStr) continue;

    const date = parseDate(dateStr);
    if (!date) continue;

    const amount = parseAmount(amountStr);
    const type: "DEBIT" | "CREDIT" = amount < 0 ? "DEBIT" : "CREDIT";

    transactions.push({
      externalId: `csv-${dateStr}-${Math.abs(amount)}-${desc.substring(0, 20)}`,
      date,
      description: desc,
      amount: Math.abs(amount),
      type,
    });
  }

  return transactions;
}

function splitCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === sep && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseDate(str: string): Date | null {
  // DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(str: string): number {
  // Handle BRL format: 1.234,56 or -1.234,56
  const cleaned = str.replace(/[R$\s]/g, "");

  if (cleaned.includes(",") && (cleaned.indexOf(",") > cleaned.lastIndexOf("."))) {
    // Brazilian format: 1.234,56
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return parseFloat(cleaned);
}
