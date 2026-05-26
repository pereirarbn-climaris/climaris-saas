import type { PmocPlanOut } from "../api/pmoc";

export type PmocIdentificationField = {
  label: string;
  value: string;
};

function pickSnapString(snap: Record<string, unknown>, key: string, fallback = ""): string {
  const val = snap[key];
  if (val != null && String(val).trim()) return String(val).trim();
  return fallback;
}

function formatPostalCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

function formatCnpjCpf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return raw.trim();
}

/** Endereço completo a partir do snapshot congelado (fallback no cadastro do cliente). */
export function pmocEstablishmentAddress(plan: PmocPlanOut): string {
  const snap = (plan.establishment_snapshot ?? {}) as Record<string, unknown>;
  const street = pickSnapString(snap, "address_street");
  const number = pickSnapString(snap, "address_number");
  const district = pickSnapString(snap, "address_district");
  const city = pickSnapString(snap, "address_city", plan.client?.address_city ?? "");
  const state = pickSnapString(snap, "address_state", plan.client?.address_state ?? "");
  const cep = formatPostalCode(pickSnapString(snap, "address_postal_code"));

  const line1 = street && number ? `${street}, ${number}` : street || number;
  const segments: string[] = [];
  if (line1) segments.push(line1);
  if (district) segments.push(district);
  const cityState = city && state ? `${city}/${state}` : city || state;
  if (cityState) segments.push(cityState);
  if (cep) segments.push(`CEP: ${cep}`);
  return segments.length > 0 ? segments.join(" — ") : "—";
}

/** Campos padronizados para identificação do estabelecimento no laudo PMOC. */
export function pmocIdentificationFields(plan: PmocPlanOut): PmocIdentificationField[] {
  const snap = (plan.establishment_snapshot ?? {}) as Record<string, unknown>;
  const legalName = pickSnapString(snap, "name", plan.client?.name ?? "");
  const tradeName = pickSnapString(snap, "trade_name", plan.client?.trade_name ?? "");
  const document = pickSnapString(snap, "document", plan.client?.document ?? "");
  const obra = plan.establishment_name?.trim() || pickSnapString(snap, "site_name");

  const fields: PmocIdentificationField[] = [];

  if (legalName) {
    fields.push({
      label: "Nome/Razão Social",
      value: tradeName && tradeName !== legalName ? `${legalName} (${tradeName})` : legalName,
    });
  }

  if (document) {
    fields.push({ label: "CNPJ", value: formatCnpjCpf(document) });
  }

  if (obra) {
    fields.push({ label: "Obra/Unidade", value: obra });
  }

  fields.push({ label: "Endereço Completo", value: pmocEstablishmentAddress(plan) });

  if (plan.responsible_name?.trim()) {
    fields.push({ label: "Responsável Técnico", value: plan.responsible_name.trim() });
  }

  return fields;
}

/** Nome da obra/unidade exibido na listagem de PMOCs. */
export function pmocEstablishmentLabel(plan: PmocPlanOut): string {
  if (plan.establishment_name?.trim()) return plan.establishment_name.trim();
  const snap = plan.establishment_snapshot;
  const fromSnap = snap?.site_name;
  if (typeof fromSnap === "string" && fromSnap.trim()) return fromSnap.trim();
  return "—";
}

export function pmocSiteLocationHint(plan: PmocPlanOut): string {
  const snap = plan.establishment_snapshot;
  const city = typeof snap?.address_city === "string" ? snap.address_city : plan.client?.address_city;
  const state = typeof snap?.address_state === "string" ? snap.address_state : plan.client?.address_state;
  const parts = [city, state].filter(Boolean);
  return parts.length > 0 ? parts.join("/") : "";
}
