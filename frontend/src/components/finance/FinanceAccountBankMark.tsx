import type { FinanceBankAccountOut, FinanceBankCatalogRow, FinanceGatewaysOut } from "../../api/finance";
import { apiUrl } from "../../lib/apiUrl";
import markStyles from "./FinanceAccountBankMark.module.css";

export type BankPickerEntry = { bank: string; label: string; slug: string; logoUrl: string | null; Logo: () => JSX.Element };

export const MP_BANK = "Mercado Pago";
export const STONE_BANK = "Stone";

function LogoBradesco() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#CC092F" />
      <path fill="#fff" d="M8 10h16v2H8zm0 5h12v2H8zm0 5h16v2H8z" opacity="0.95" />
    </svg>
  );
}

function LogoSantander() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#EC0000" />
      <path fill="#fff" d="M16 7c-3 4-6 7-6 11a6 6 0 1 0 12 0c0-4-3-7-6-11z" />
    </svg>
  );
}

function LogoBancoDoBrasil() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#185EA8" />
      <path fill="#FEF317" d="M16 9l5 8H11z" />
    </svg>
  );
}

function LogoCaixa() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#0065B7" />
      <path fill="#F7941D" d="M8 22h16v3H8z" />
      <path fill="#fff" d="M10 10h12v8H10z" opacity="0.2" />
    </svg>
  );
}

function LogoItau() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#EC7000" />
      <rect x="14" y="8" width="4" height="16" fill="#003DA5" rx="1" />
    </svg>
  );
}

function LogoInter() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#1a1a1a" />
      <rect x="6" y="14" width="20" height="5" rx="1" fill="#FF7A00" />
    </svg>
  );
}

function LogoNubank() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#820AD1" />
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M11 22V10m0 0c0 3.8 2.8 6 5.5 6S22 14.5 22 11"
      />
    </svg>
  );
}

function LogoOutros() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="color-mix(in srgb, var(--color-text-muted) 25%, var(--color-surface))" />
      <path
        fill="var(--color-text-muted)"
        d="M8 24V12l4-2v14l-4 2zm8-2V10l4-2v14l-4 2zm8 2V8l4-2v18l-4 2z"
      />
    </svg>
  );
}

function LogoAsaas() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#0066FF" />
      <ellipse cx="16" cy="16" rx="7" ry="5" fill="none" stroke="#fff" strokeWidth="2" />
      <path fill="#fff" d="M12 16h8v1.5h-8z" />
    </svg>
  );
}

function LogoMercadoPagoPicker() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="24" r="14" fill="#009ee3" />
      <circle cx="30" cy="24" r="14" fill="#0a0080" />
    </svg>
  );
}

/** Marca Stone / Pagar.me: “S” legível no verde (o path anterior confundia-se com “G” em tamanho pequeno). */
function LogoStone() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#00A868" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#fff"
        fontSize="17"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
      >
        S
      </text>
    </svg>
  );
}

export const SLUG_LOGOS: Record<string, () => JSX.Element> = {
  bradesco: LogoBradesco,
  santander: LogoSantander,
  banco_do_brasil: LogoBancoDoBrasil,
  caixa_economica: LogoCaixa,
  itau: LogoItau,
  inter: LogoInter,
  nubank: LogoNubank,
  outros: LogoOutros,
  asaas: LogoAsaas,
  mercado_pago: LogoMercadoPagoPicker,
  stone: LogoStone,
};

export const FALLBACK_BANK_PICK: BankPickerEntry[] = [
  { slug: "bradesco", bank: "Bradesco", label: "Bradesco", logoUrl: null, Logo: LogoBradesco },
  { slug: "santander", bank: "Santander", label: "Santander", logoUrl: null, Logo: LogoSantander },
  { slug: "banco_do_brasil", bank: "Banco do Brasil", label: "Banco do Brasil", logoUrl: null, Logo: LogoBancoDoBrasil },
  { slug: "caixa_economica", bank: "Caixa Econômica", label: "Caixa", logoUrl: null, Logo: LogoCaixa },
  { slug: "itau", bank: "Itaú", label: "Itaú", logoUrl: null, Logo: LogoItau },
  { slug: "inter", bank: "Inter", label: "Inter", logoUrl: null, Logo: LogoInter },
  { slug: "nubank", bank: "Nubank", label: "Nubank", logoUrl: null, Logo: LogoNubank },
  { slug: "outros", bank: "Outros", label: "Outros", logoUrl: null, Logo: LogoOutros },
  { slug: "asaas", bank: "Asaas", label: "Asaas", logoUrl: null, Logo: LogoAsaas },
  { slug: "mercado_pago", bank: MP_BANK, label: "Mercado Pago", logoUrl: null, Logo: LogoMercadoPagoPicker },
  { slug: "stone", bank: STONE_BANK, label: "Stone / Pagar.me", logoUrl: null, Logo: LogoStone },
];

export function pickerImgSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function combinedBlob(a: FinanceBankAccountOut): string {
  return normalizeLabel(`${a.bank_name || ""} ${a.name}`);
}

function isGatewayMercadoPagoAccount(a: FinanceBankAccountOut, gw: FinanceGatewaysOut | null): boolean {
  return gw?.mercadopago?.finance_bank_account_id === a.id;
}

function isGatewayStoneAccount(a: FinanceBankAccountOut, gw: FinanceGatewaysOut | null): boolean {
  return gw?.stone?.finance_bank_account_id === a.id;
}

function catalogMatch(
  a: FinanceBankAccountOut,
  catalog: readonly FinanceBankCatalogRow[],
): FinanceBankCatalogRow | null {
  const blob = combinedBlob(a);
  const bankNorm = normalizeLabel(a.bank_name || "");
  const nameNorm = normalizeLabel(a.name);

  const scored: { row: FinanceBankCatalogRow; score: number }[] = [];
  for (const row of catalog) {
    const bn = normalizeLabel(row.bank_name);
    const dl = normalizeLabel(row.display_label);
    const slugAsWords = normalizeLabel(row.slug.replace(/_/g, " "));

    let score = 0;
    if (bankNorm && bankNorm === bn) score = 100;
    else if (bankNorm && bn.length >= 3 && bankNorm.includes(bn)) score = 80;
    else if (bankNorm && bn.length >= 3 && bn.includes(bankNorm)) score = 75;
    else if (nameNorm && bn.length >= 3 && nameNorm.includes(bn)) score = 70;
    else if (blob && bn.length >= 4 && blob.includes(bn)) score = 60;
    else if (dl.length >= 3 && blob.includes(dl)) score = 55;
    else if (slugAsWords.length >= 4 && blob.includes(slugAsWords)) score = 50;

    if (score > 0) scored.push({ row, score });
  }
  scored.sort((x, y) => y.score - x.score || y.row.bank_name.length - x.row.bank_name.length);
  return scored[0]?.row ?? null;
}

type ResolvedMark =
  | { kind: "img"; src: string; title: string }
  | { kind: "slug"; slug: string; title: string }
  | { kind: "letter"; letter: string; title: string };

function resolveFinanceBankMark(
  a: FinanceBankAccountOut,
  gateways: FinanceGatewaysOut | null,
  catalog: readonly FinanceBankCatalogRow[] | null | undefined,
): ResolvedMark {
  const blob = combinedBlob(a);

  const cat = catalog?.length ? catalogMatch(a, catalog) : null;
  if (cat?.logo_url) {
    const src = pickerImgSrc(cat.logo_url);
    if (src) return { kind: "img", src, title: cat.display_label || cat.bank_name };
  }

  if (isGatewayMercadoPagoAccount(a, gateways) || blob.includes("mercado pago") || blob.includes("mercadopago")) {
    return { kind: "slug", slug: "mercado_pago", title: "Mercado Pago" };
  }
  if (isGatewayStoneAccount(a, gateways) || /\bstone\b/.test(blob) || blob.includes("pagar.me") || blob.includes("pagarme")) {
    return { kind: "slug", slug: "stone", title: "Stone / Pagar.me" };
  }
  if (blob.includes("asaas")) {
    return { kind: "slug", slug: "asaas", title: "Asaas" };
  }

  if (a.account_type === "cash") {
    return { kind: "slug", slug: "caixa_economica", title: "Caixa" };
  }

  if (cat) {
    return { kind: "slug", slug: cat.slug, title: cat.display_label || cat.bank_name };
  }

  const heuristics: [RegExp, string, string][] = [
    [/\bbradesco\b/, "bradesco", "Bradesco"],
    [/\bsantander\b/, "santander", "Santander"],
    [/\bbanco do brasil\b|\bbb\b/, "banco_do_brasil", "Banco do Brasil"],
    [/\b(caixa economica|cef)\b/, "caixa_economica", "Caixa"],
    [/\b(itau|itaú)\b/, "itau", "Itaú"],
    [/\binter\b/, "inter", "Inter"],
    [/\bnubank\b/, "nubank", "Nubank"],
  ];
  for (const [re, slug, title] of heuristics) {
    if (re.test(blob)) return { kind: "slug", slug, title };
  }
  if (blob.includes("caixa") || blob.includes("cef")) {
    return { kind: "slug", slug: "caixa_economica", title: "Caixa" };
  }

  const label = (a.bank_name || a.name || "?").trim();
  const letter = label ? label.slice(0, 1).toUpperCase() : "?";
  return { kind: "letter", letter, title: label || "Conta" };
}

export function financeAccountConfigProvider(
  row: FinanceBankAccountOut,
  gw: FinanceGatewaysOut | null,
): "asaas" | "mercadopago" | "stone" | "none" {
  const blob = `${row.bank_name || ""} ${row.name}`.toLowerCase();
  if (blob.includes("asaas")) return "asaas";
  if (blob.includes("mercado") || gw?.mercadopago?.finance_bank_account_id === row.id) return "mercadopago";
  if (blob.includes("stone") || blob.includes("pagar") || gw?.stone?.finance_bank_account_id === row.id) return "stone";
  return "none";
}

type MarkProps = {
  account: FinanceBankAccountOut;
  gateways: FinanceGatewaysOut | null;
  catalog?: readonly FinanceBankCatalogRow[] | null;
  variant?: "card" | "inline";
};

export function FinanceAccountBankMark({ account, gateways, catalog, variant = "card" }: MarkProps) {
  const resolved = resolveFinanceBankMark(account, gateways, catalog ?? null);
  const isInline = variant === "inline";
  const brandClass = isInline ? markStyles.brandInline : markStyles.brand;
  const dotClass = isInline ? markStyles.bankDotInline : markStyles.bankDot;

  if (resolved.kind === "img") {
    return (
      <div className={brandClass} title={resolved.title}>
        <img src={resolved.src} alt="" />
      </div>
    );
  }
  if (resolved.kind === "slug") {
    const Logo = SLUG_LOGOS[resolved.slug] ?? LogoOutros;
    return (
      <div className={brandClass} title={resolved.title}>
        <Logo />
      </div>
    );
  }
  return (
    <div className={dotClass} title={resolved.title}>
      {resolved.letter}
    </div>
  );
}
