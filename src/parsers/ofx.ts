export interface ParsedTransaction {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
}

export interface ParsedStatement {
  accountType: "CHECKING" | "CREDIT_CARD" | "SAVINGS";
  accountId: string;
  balance: number | null;
  transactions: ParsedTransaction[];
}

export function parseOFX(content: string): ParsedStatement {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Detect account type
  const isCreditCard = lines.includes("<CREDITCARDMSGSRSV1") || lines.includes("<CCSTMTRS");
  const accountType = isCreditCard ? "CREDIT_CARD" : "CHECKING";

  // Extract account ID
  const acctIdMatch = lines.match(/<ACCTID>([^\n<]+)/);
  const accountId = acctIdMatch ? acctIdMatch[1].trim() : "unknown";

  // Extract balance
  const balMatch = lines.match(/<BALAMT>([^\n<]+)/);
  const balance = balMatch ? parseFloat(balMatch[1].trim()) : null;

  // Extract transactions
  const transactions: ParsedTransaction[] = [];

  // Split by STMTTRN blocks
  const txBlocks = lines.split(/<STMTTRN>/i).slice(1);

  for (const block of txBlocks) {
    const endIdx = block.indexOf("</STMTTRN>");
    const txContent = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const getValue = (tag: string): string => {
      const match = txContent.match(new RegExp(`<${tag}>([^\\n<]+)`, "i"));
      return match ? match[1].trim() : "";
    };

    const dateStr = getValue("DTPOSTED");
    const amountStr = getValue("TRNAMT");
    const fitId = getValue("FITID");
    const memo = getValue("MEMO") || getValue("NAME") || "Sem descricao";
    const trnType = getValue("TRNTYPE");

    if (!dateStr || !amountStr) continue;

    // Parse date: YYYYMMDD or YYYYMMDDHHMMSS
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const date = new Date(year, month, day);

    const amount = parseFloat(amountStr);
    const type: "DEBIT" | "CREDIT" = amount < 0 || trnType === "DEBIT" ? "DEBIT" : "CREDIT";

    transactions.push({
      externalId: fitId || `ofx-${dateStr}-${Math.abs(amount)}-${memo.substring(0, 20)}`,
      date,
      description: memo,
      amount: Math.abs(amount),
      type,
    });
  }

  return { accountType, accountId, balance, transactions };
}
