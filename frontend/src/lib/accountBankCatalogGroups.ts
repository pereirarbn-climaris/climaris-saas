import type { FinanceBankCatalogRow } from "../api/finance";
import {
  FALLBACK_BANK_PICK,
  MP_BANK,
  SLUG_LOGOS,
  type BankPickerEntry,
} from "../components/finance/FinanceAccountBankMark";

export type BankInstitutionCategory = "traditional" | "digital" | "gateway" | "internal";

export type BankPickerEntryWithCategory = BankPickerEntry & {
  category: BankInstitutionCategory;
};

export type AccountKind = "checking" | "savings" | "investment" | "digital_wallet" | "cash" | "other";

export type IntegrationProvider = "mercadopago" | "stone" | "asaas";

const TRADITIONAL_SLUGS = new Set([
  "bradesco",
  "santander",
  "banco_do_brasil",
  "caixa_economica",
  "itau",
  "outros",
]);

const DIGITAL_SLUGS = new Set(["inter", "nubank"]);

const GATEWAY_SLUGS = new Set(["asaas", "mercado_pago", "stone"]);

export const INTERNAL_CASH_ENTRY: BankPickerEntry = {
  slug: "internal_cash",
  bank: "Caixa",
  label: "Caixa / dinheiro",
  logoUrl: null,
  Logo: SLUG_LOGOS.caixa_economica,
};

export const BANK_CATEGORY_LABELS: Record<BankInstitutionCategory, string> = {
  traditional: "Bancos tradicionais",
  digital: "Contas digitais",
  gateway: "Gateways de pagamento",
  internal: "Contas internas / caixa",
};

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Conta poupança",
  investment: "Conta de investimento",
  digital_wallet: "Carteira digital",
  cash: "Caixa / dinheiro",
  other: "Outros",
};

export function categorizeBankSlug(slug: string): BankInstitutionCategory {
  if (slug === "internal_cash") return "internal";
  if (GATEWAY_SLUGS.has(slug)) return "gateway";
  if (DIGITAL_SLUGS.has(slug)) return "digital";
  if (TRADITIONAL_SLUGS.has(slug)) return "traditional";
  return "traditional";
}

export function enrichBankPickList(entries: BankPickerEntry[]): BankPickerEntryWithCategory[] {
  return entries.map((entry) => ({
    ...entry,
    category: categorizeBankSlug(entry.slug),
  }));
}

export function groupBanksByCategory(entries: BankPickerEntryWithCategory[]) {
  const order: BankInstitutionCategory[] = ["traditional", "digital", "gateway", "internal"];
  const buckets = new Map<BankInstitutionCategory, BankPickerEntryWithCategory[]>();
  for (const cat of order) buckets.set(cat, []);
  for (const entry of entries) {
    buckets.get(entry.category)?.push(entry);
  }
  return order
    .map((id) => ({
      id,
      title: BANK_CATEGORY_LABELS[id],
      items: buckets.get(id) ?? [],
    }))
    .filter((g) => g.items.length > 0);
}

export function catalogRowToPickerEntry(row: FinanceBankCatalogRow): BankPickerEntry {
  return {
    bank: row.bank_name,
    label: row.slug === "stone" ? "Stone / Pagar.me" : row.display_label,
    slug: row.slug,
    logoUrl: row.logo_url,
    Logo: SLUG_LOGOS[row.slug] ?? SLUG_LOGOS.outros,
  };
}

export function buildBankPickListFromCatalog(rows: FinanceBankCatalogRow[]): BankPickerEntry[] {
  const fromCatalog = rows.map(catalogRowToPickerEntry);
  const hasInternal = fromCatalog.some((e) => e.slug === "internal_cash");
  return hasInternal ? fromCatalog : [...fromCatalog, INTERNAL_CASH_ENTRY];
}

export function buildBankPickListWithFallback(rows: FinanceBankCatalogRow[] | null): BankPickerEntry[] {
  if (rows?.length) return buildBankPickListFromCatalog(rows);
  return [...FALLBACK_BANK_PICK, INTERNAL_CASH_ENTRY];
}

export function integrationForSlug(slug: string): IntegrationProvider | null {
  if (slug === "mercado_pago") return "mercadopago";
  if (slug === "stone") return "stone";
  if (slug === "asaas") return "asaas";
  return null;
}

export function defaultAccountKindForSlug(slug: string): AccountKind {
  if (slug === "internal_cash") return "cash";
  if (slug === "mercado_pago" || slug === "asaas") return "digital_wallet";
  return "checking";
}

export function accountKindsForSlug(slug: string): AccountKind[] {
  if (slug === "internal_cash") return ["cash"];
  if (slug === "mercado_pago" || slug === "asaas") {
    return ["digital_wallet", "checking", "other"];
  }
  if (slug === "stone") return ["checking", "digital_wallet", "other"];
  return ["checking", "savings", "investment", "digital_wallet", "other"];
}

export function defaultAccountName(bankLabel: string, kind: AccountKind): string {
  if (kind === "cash") return "Caixa";
  return `${bankLabel} — ${KIND_LABEL[kind]}`;
}

export function isDuplicateAccountName(
  name: string,
  accounts: { name: string }[],
  ignoreName?: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  const ignore = ignoreName?.trim().toLowerCase();
  return accounts.some((a) => {
    const existing = a.name.trim().toLowerCase();
    if (ignore && existing === ignore) return false;
    return existing === normalized;
  });
}

export function bankNameForPickerEntry(entry: BankPickerEntry): string {
  if (entry.slug === "internal_cash") return "Caixa";
  if (entry.slug === "mercado_pago") return MP_BANK;
  return entry.bank;
}
