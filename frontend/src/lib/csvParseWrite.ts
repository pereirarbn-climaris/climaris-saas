/** Escapa campo para linha CSV (RFC 4180). */
export function escapeCsvField(value: string): string {
  const v = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Primeira linha lógica do arquivo (respeitando aspas; quebra só fora de aspas). */
export function readFirstCsvRecordLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === "\r" && text[i + 1] === "\n") {
      return text.slice(0, i);
    }
    if (!inQuotes && c === "\n") {
      return text.slice(0, i).replace(/\r$/, "");
    }
    if (!inQuotes && c === "\r") {
      return text.slice(0, i);
    }
  }
  const one = text.split(/\r?\n/, 1)[0];
  return one ?? text;
}

/**
 * Excel em português costuma exportar CSV com `;`. Conta separadores fora de aspas na primeira linha.
 */
export function detectCsvDelimiter(firstLine: string): "," | ";" | "\t" {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i]!;
    if (c === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ",") commas++;
    else if (c === ";") semis++;
    else if (c === "\t") tabs++;
  }
  if (tabs > 0 && tabs >= semis && tabs >= commas) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/**
 * Parser CSV/TSV com delimitador configurável (`,` `;` ou tab), aspas RFC4180 e quebras de linha dentro de campos.
 */
export function parseCsvWithDelimiter(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const D = delimiter;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === D) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  while (rows.length && rows[rows.length - 1]!.every((cell) => cell.trim() === "")) {
    rows.pop();
  }
  return rows;
}

/**
 * Parser CSV com vírgula (compatível com exportações US / API).
 */
export function parseCsv(text: string): string[][] {
  return parseCsvWithDelimiter(text, ",");
}

export function csvMatrixToObjects(matrix: string[][]): Record<string, string>[] {
  if (matrix.length === 0) return [];
  const rawHeaders = matrix[0]!.map((h) => h.replace(/^\ufeff/, "").trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]!;
    const o: Record<string, string> = {};
    rawHeaders.forEach((h, i) => {
      o[h] = cells[i] ?? "";
    });
    out.push(o);
  }
  return out;
}

export function writeCsv(headers: readonly string[], dataRows: Record<string, string>[]): string {
  const lines: string[] = [headers.map(escapeCsvField).join(",")];
  for (const row of dataRows) {
    lines.push(headers.map((h) => escapeCsvField(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}
