import { digitsOnly, digitsOnlyPhoneForApi } from "./brMask";
import {
  csvMatrixToObjects,
  detectCsvDelimiter,
  parseCsv,
  parseCsvWithDelimiter,
  readFirstCsvRecordLine,
  writeCsv,
} from "./csvParseWrite";

const CLIMARIS_CLIENT_IMPORT_HEADERS = [
  "id",
  "name",
  "document",
  "tax_id_kind",
  "optante_mei",
  "phone",
  "whatsapp",
  "email",
  "trade_name",
  "contact_person_name",
  "state_registration",
  "ie_indicator",
  "municipal_registration",
  "address_street",
  "address_number",
  "address_complement",
  "address_district",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
  "address_ibge_code",
  "preventive_campaign_opt_out",
  "is_active",
] as const;

function normalizeImportHeaderLabel(raw: string): string {
  return raw
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapeia cabeçalhos originais → chave normalizada (uma entrada por coluna). */
function buildNormalizedHeaderMap(rawHeaders: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of rawHeaders) {
    map[h] = normalizeImportHeaderLabel(h);
  }
  return map;
}

/**
 * Mapeia o cabeçalho já normalizado para uma chave canónica.
 * O Excel às vezes exporta sufixos estranhos (ex.: "Nome+H46", "Telefone+K12") — tratamos como Nome / Telefone.
 */
function headerCanonicalKey(normalizedHeader: string): string | null {
  const t = normalizedHeader.trim();
  if (!t) return null;

  if (t === "nome" || t.startsWith("nome+") || t.startsWith("nome +")) return "nome";

  if (t === "telefone 2" || t.startsWith("telefone 2+") || t === "telefone2" || t.startsWith("telefone2+")) {
    return "telefone 2";
  }
  if (t === "telefone" || t === "telefones" || t.startsWith("telefone+") || t.startsWith("telefones+")) {
    return "telefone";
  }

  if (t === "endereco" || t.startsWith("endereco+") || t.startsWith("endereco +")) return "endereco";
  if (t === "email" || t.startsWith("email+")) return "email";
  if (t === "cpf" || t.startsWith("cpf+")) return "cpf";
  if (t === "observacao referencia" || (t.includes("observacao") && t.includes("referencia"))) {
    return "observacao referencia";
  }
  return null;
}

function getByCanonical(row: Record<string, string>, headerMap: Record<string, string>, canonicals: string[]): string {
  for (const raw of Object.keys(row)) {
    const nk = headerMap[raw];
    if (!nk) continue;
    const c = headerCanonicalKey(nk);
    if (c && canonicals.includes(c)) return row[raw] ?? "";
  }
  return "";
}

function looksLikeMinhaAgendaClientExport(rawHeaders: string[]): boolean {
  const canon = new Set<string>();
  for (const h of rawHeaders) {
    const c = headerCanonicalKey(normalizeImportHeaderLabel(h));
    if (c) canon.add(c);
  }
  return canon.has("nome") && canon.has("telefone") && canon.has("endereco");
}

function extractCep(address: string): string | null {
  const m = address.match(/\b(\d{5})-?(\d{3})\b/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function extractCityState(address: string): { city: string; state: string } | null {
  const m = address.match(/([\p{L}\s'.-]+)\/([A-Z]{2})\s*$/iu);
  if (!m) return null;
  const city = m[1]!.replace(/\s+/g, " ").trim();
  const state = m[2]!.toUpperCase();
  if (city.length < 2 || state.length !== 2) return null;
  return { city, state };
}

function normalizePhoneDigits(raw: string): string {
  let d = digitsOnly(raw);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(0, 11);
  return d;
}

function firstRawKeyForCanonical(headerMap: Record<string, string>, canonical: string): string | null {
  for (const [raw, nk] of Object.entries(headerMap)) {
    if (headerCanonicalKey(nk) === canonical) return raw;
  }
  return null;
}

/**
 * Planilhas da Minha Agenda / Excel: endereço com quebra de linha pode virar linha extra com Nome e Telefone vazios.
 * Junta essa linha ao cliente anterior (mesmo campo Endereço / Observação).
 */
function mergeMinhaAgendaContinuationRows(
  rows: Record<string, string>[],
  headerMap: Record<string, string>,
): Record<string, string>[] {
  const endKey = firstRawKeyForCanonical(headerMap, "endereco");
  const obsKey = firstRawKeyForCanonical(headerMap, "observacao referencia");
  const out: Record<string, string>[] = [];

  for (const src of rows) {
    const name = getByCanonical(src, headerMap, ["nome"]).trim();
    const tel1 = normalizePhoneDigits(getByCanonical(src, headerMap, ["telefone"]));
    const tel2 = normalizePhoneDigits(getByCanonical(src, headerMap, ["telefone 2"]));
    const endereco = getByCanonical(src, headerMap, ["endereco"]).trim();
    const hasIdentity = Boolean(name || tel1 || tel2);

    if (hasIdentity) {
      out.push({ ...src });
      continue;
    }

    if (!out.length) continue;

    const prev = out[out.length - 1]!;

    if (endKey && endereco) {
      const prevEnd = (prev[endKey] ?? "").trim();
      prev[endKey] = prevEnd ? `${prevEnd}\n${endereco}` : endereco;
    }

    if (obsKey) {
      const obsExtra = (src[obsKey] ?? "").trim();
      if (obsExtra) {
        const prevObs = (prev[obsKey] ?? "").trim();
        prev[obsKey] = prevObs ? `${prevObs}\n${obsExtra}` : obsExtra;
      }
    }
  }

  return out;
}

/**
 * Converte texto CSV exportado pelo app Minha Agenda (colunas Nome, Telefone, Endereço, etc.)
 * para o CSV de importação do Climaris.
 */
function parseMinhaAgendaMatrix(textNorm: string): string[][] {
  const firstLine = readFirstCsvRecordLine(textNorm);
  const delimiter = detectCsvDelimiter(firstLine);
  const byDelim = parseCsvWithDelimiter(textNorm, delimiter);
  const headersDelim = byDelim[0]?.map((h) => h.replace(/^\ufeff/, "").trim()) ?? [];
  if (looksLikeMinhaAgendaClientExport(headersDelim)) return byDelim;

  const byComma = parseCsv(textNorm);
  const headersComma = byComma[0]?.map((h) => h.replace(/^\ufeff/, "").trim()) ?? [];
  if (looksLikeMinhaAgendaClientExport(headersComma)) return byComma;

  return byDelim;
}

export function minhaAgendaClientsCsvTextToClimaris(csvText: string): string {
  const textNorm = csvText.replace(/^\ufeff/, "");
  const matrix = parseMinhaAgendaMatrix(textNorm);
  if (matrix.length < 2) {
    throw new Error("O arquivo precisa ter cabeçalho e ao menos uma linha de dados.");
  }
  const rawHeaders = matrix[0]!.map((h) => h.replace(/^\ufeff/, "").trim());
  if (!looksLikeMinhaAgendaClientExport(rawHeaders)) {
    throw new Error(
      "Este arquivo não parece o export de clientes da Minha Agenda (colunas Nome, Telefone e Endereço). " +
        "Se salvou pelo Excel em português, use CSV separado por ponto-e-vírgula (;) — o import detecta automaticamente."
    );
  }
  const headerMap = buildNormalizedHeaderMap(rawHeaders);
  const objects = mergeMinhaAgendaContinuationRows(csvMatrixToObjects(matrix), headerMap);
  const climarisRows: Record<string, string>[] = [];

  for (const src of objects) {
    const name = getByCanonical(src, headerMap, ["nome"]).trim();
    if (!name) continue;

    const tel1 = normalizePhoneDigits(getByCanonical(src, headerMap, ["telefone"]));
    const tel2 = normalizePhoneDigits(getByCanonical(src, headerMap, ["telefone 2"]));
    const merged = tel1 || tel2;
    const phone = merged ? digitsOnlyPhoneForApi(merged) : "";
    const whatsapp = phone;

    const email = getByCanonical(src, headerMap, ["email"]).trim().toLowerCase();
    const endereco = getByCanonical(src, headerMap, ["endereco"]).trim();
    const obs = getByCanonical(src, headerMap, ["observacao referencia"]).trim();
    const cpfRaw = getByCanonical(src, headerMap, ["cpf"]).trim();
    const cpfDigits = digitsOnly(cpfRaw);

    let document = "";
    let taxKind: "cpf" | "cnpj" = "cpf";
    if (cpfDigits.length === 11) {
      document = cpfDigits;
      taxKind = "cpf";
    } else if (cpfDigits.length === 14) {
      document = cpfDigits;
      taxKind = "cnpj";
    }

    const cep = endereco ? extractCep(endereco) : null;
    const citySt = endereco ? extractCityState(endereco) : null;

    const complementParts = [obs].filter(Boolean);
    const complement = complementParts.join(" — ") || "";

    const row: Record<string, string> = {};
    for (const h of CLIMARIS_CLIENT_IMPORT_HEADERS) row[h] = "";
    row.name = name;
    row.document = document;
    row.tax_id_kind = taxKind;
    row.optante_mei = "0";
    row.phone = phone;
    row.whatsapp = whatsapp;
    row.email = email;
    row.address_street = endereco;
    row.address_complement = complement || "";
    if (cep) row.address_postal_code = cep;
    if (citySt) {
      row.address_city = citySt.city;
      row.address_state = citySt.state;
    }
    row.address_country = "Brasil";
    row.preventive_campaign_opt_out = "0";
    row.is_active = "1";
    climarisRows.push(row);
  }

  if (climarisRows.length === 0) {
    throw new Error("Nenhuma linha válida encontrada (todos os nomes estavam vazios).");
  }

  return "\ufeff" + writeCsv(CLIMARIS_CLIENT_IMPORT_HEADERS, climarisRows);
}

export async function minhaAgendaClientsFileToClimarisCsvFile(file: File): Promise<File> {
  const text = await file.text();
  const out = minhaAgendaClientsCsvTextToClimaris(text);
  const base = file.name.replace(/\.[^.]+$/, "") || "clientes";
  return new File([out], `${base}-climaris-import.csv`, { type: "text/csv;charset=utf-8" });
}
