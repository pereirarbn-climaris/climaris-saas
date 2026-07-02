import { siteConfig } from "./site-config";

export type PublicWebsiteSettings = {
  hero_title: string;
  hero_subtitle: string;
  seo_title: string;
  seo_description: string;
  contact_email: string;
  contact_phone: string | null;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  is_verified_cnpj: boolean;
  cnpj_verified_at: string | null;
  dpo_name: string | null;
  dpo_email: string | null;
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal: string;
  services: string[];
  screenshots: Record<string, string | null>;
};

export const defaultPublicSettings: PublicWebsiteSettings = {
  hero_title:
    "Aumente a produtividade da sua equipe de campo e a rentabilidade dos seus contratos",
  hero_subtitle:
    "O Climaris é o software B2B de gestão para empresas de climatização e refrigeração: contratos, orçamentos, OS, financeiro e conformidade técnica (PMOC) em uma plataforma.",
  seo_title: siteConfig.title,
  seo_description: siteConfig.description,
  contact_email: siteConfig.email,
  contact_phone: siteConfig.phone || null,
  legal_name: siteConfig.legalName,
  trade_name: null,
  cnpj: siteConfig.cnpj || null,
  is_verified_cnpj: false,
  cnpj_verified_at: null,
  dpo_name: null,
  dpo_email: null,
  address_street: siteConfig.address.street,
  address_city: siteConfig.address.city,
  address_state: siteConfig.address.state,
  address_postal: siteConfig.address.postalCode,
  services: [...siteConfig.services],
  screenshots: {},
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function resolveAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export async function fetchPublicWebsiteSettings(): Promise<PublicWebsiteSettings> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/public/website`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return defaultPublicSettings;
    const data = (await response.json()) as PublicWebsiteSettings;
    return { ...defaultPublicSettings, ...data };
  } catch {
    return defaultPublicSettings;
  }
}

export function screenshotUrl(
  settings: PublicWebsiteSettings,
  slot: "hero" | "dashboard" | "finance" | "orders",
  fallback: string,
): string {
  return resolveAssetUrl(settings.screenshots[slot]) ?? fallback;
}
