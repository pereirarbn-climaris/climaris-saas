import type { PublicEquipmentHistoryEntry, PublicEquipmentPagePayload } from "../api/publicEquipment";
import type { TenantOut } from "../api/auth";
import type { EquipmentHistoryRowOut } from "../api/clients";
import type {
  EquipmentCategory,
  EquipmentProfileData,
  MaintenanceEvent,
  MaintenanceEventType,
  ProviderCompany,
  TechnicalSpec,
} from "../components/v0-ui/clients/PublicEquipmentProfileView v2";
import type { EquipmentItem } from "../components/v0-ui/clients/ClientEquipmentManager";
import { buildTechnicalSpecRows, type TechnicalSpecRow } from "./categoryFieldDefinitions";
import { buildPublicEquipmentUrl } from "./publicEquipmentUrl";
import { mapEquipmentHistoryToTimeline, sortTimelineEntries } from "./equipmentHistory";
import type { EquipmentHistoryTimelineEntry } from "../components/equipment/EquipmentHistoryTimeline";

const SPEC_KEY_ICONS: Record<string, TechnicalSpec["icon"]> = {
  capacity: "capacity",
  capacidade: "capacity",
  voltage: "voltage",
  voltagem: "voltage",
  fluid_type: "gas",
  tipo_gas: "gas",
  gas: "gas",
  power: "power",
  potencia: "power",
  weight: "weight",
  peso: "weight",
  dimension: "dimension",
  dimensao: "dimension",
  efficiency: "efficiency",
  noise: "noise",
  ruido: "noise",
};

function inferSpecIcon(key: string, label: string): TechnicalSpec["icon"] | undefined {
  const k = key.toLowerCase();
  if (SPEC_KEY_ICONS[k]) return SPEC_KEY_ICONS[k];
  const l = label.toLowerCase();
  if (l.includes("capac") || l.includes("btu") || l.includes("m³")) return "capacity";
  if (l.includes("tens") || l.includes("volt")) return "voltage";
  if (l.includes("gás") || l.includes("gas") || l.includes("fluid")) return "gas";
  if (l.includes("potên") || l.includes("watt")) return "power";
  return undefined;
}

function parseOsNumber(title: string): string | undefined {
  const match = title.match(/OS\s*#?\s*(\d+)/i);
  return match ? match[1] : undefined;
}

function cleanEventTitle(title: string): string {
  return title
    .replace(/^OS\s*#\d+\s*concluída\s*—\s*/i, "")
    .replace(/^OS\s*#\d+\s*—\s*/i, "")
    .trim();
}

function mapHistoryKind(kind: string): MaintenanceEventType {
  if (kind === "servico" || kind === "ordem_concluida") return "servico";
  if (kind === "instalacao") return "instalacao";
  if (kind === "garantia") return "garantia";
  return "registro";
}

export function mapTechnicalSpecsToProfile(
  rows: Array<{ key: string; label: string; value: string }>,
): TechnicalSpec[] {
  return rows.map((row) => ({
    id: row.key,
    label: row.label,
    value: row.value,
    icon: inferSpecIcon(row.key, row.label),
  }));
}

export function mapTechnicalSpecRowsToProfile(rows: TechnicalSpecRow[]): TechnicalSpec[] {
  return mapTechnicalSpecsToProfile(rows);
}

export function mapTimelineToMaintenanceEvents(
  entries: EquipmentHistoryTimelineEntry[],
): MaintenanceEvent[] {
  return entries.map((entry, index) => {
    const osNumber = parseOsNumber(entry.title);
    return {
      id: `${entry.occurred_at}-${index}`,
      date: entry.occurred_at,
      osNumber,
      title: cleanEventTitle(entry.title) || entry.title,
      description: entry.detail ?? undefined,
      technicianName: entry.changed_by_user_name ?? undefined,
      origin: entry.detail ?? undefined,
      orderStatus: entry.order_status_label ?? undefined,
      checklistItems: entry.checklist_items,
      type: mapHistoryKind(entry.kind),
    };
  });
}

export function mapPublicHistoryEntries(entries: PublicEquipmentHistoryEntry[]): MaintenanceEvent[] {
  const sorted = sortTimelineEntries(
    entries.map((e) => ({
      occurred_at: e.occurred_at,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
    })),
  );
  return sorted.map((entry, index) => {
    const osNumber = parseOsNumber(entry.title);
    return {
      id: `${entry.occurred_at}-${index}`,
      date: entry.occurred_at,
      osNumber,
      title: cleanEventTitle(entry.title) || entry.title,
      description: entry.detail ?? undefined,
      type: mapHistoryKind(entry.kind),
    };
  });
}

export function mapHistoryRowsToMaintenanceEvents(rows: EquipmentHistoryRowOut[]): MaintenanceEvent[] {
  return mapTimelineToMaintenanceEvents(mapEquipmentHistoryToTimeline(rows));
}

export function resolveProfileCategory(
  categorySlug: string,
  categoryName?: string | null,
): EquipmentCategory {
  const slug = categorySlug.toLowerCase();
  if (
    slug === "ar_condicionado" ||
    slug === "climatizador" ||
    slug === "geladeira" ||
    slug === "bebedouro" ||
    slug === "freezer"
  ) {
    return slug;
  }
  const name = (categoryName ?? slug).toLowerCase();
  if (name.includes("climatiz")) return "climatizador";
  if (name.includes("geladeira")) return "geladeira";
  if (name.includes("bebedouro")) return "bebedouro";
  if (name.includes("freezer")) return "freezer";
  if (name.includes("ar") && name.includes("cond")) return "ar_condicionado";
  return "ar_condicionado";
}

function formatTenantStreetLine(tenant: TenantOut): string | undefined {
  const parts: string[] = [];
  const street = tenant.address_street?.trim();
  const number = tenant.address_number?.trim();
  const complement = tenant.address_complement?.trim();
  const district = tenant.address_district?.trim();
  if (street) {
    let line = street;
    if (number) line = `${line}, ${number}`;
    if (complement) line = `${line} — ${complement}`;
    parts.push(line);
  }
  if (district) parts.push(district);
  return parts.length ? parts.join(" — ") : undefined;
}

export function mapTenantOutToProvider(tenant: TenantOut): ProviderCompany {
  const doc = tenant.tax_document?.trim() || tenant.cnpj?.trim();
  return {
    name: tenant.name,
    cnpj: doc || undefined,
    phone: tenant.phone?.trim() || undefined,
    email: tenant.email?.trim() || undefined,
    website: tenant.website?.trim() || undefined,
    address: formatTenantStreetLine(tenant),
    city: tenant.address_city?.trim() || undefined,
    state: tenant.address_state?.trim() || undefined,
    logoUrl: tenant.logo_url?.trim() || undefined,
  };
}

function mapPublicPayloadToProvider(data: PublicEquipmentPagePayload): ProviderCompany {
  return {
    name: data.tenant_name,
    cnpj: data.tenant_cnpj?.trim() || undefined,
    phone: data.tenant_phone?.trim() || undefined,
    email: data.tenant_email?.trim() || undefined,
    website: data.tenant_website?.trim() || undefined,
    address: data.tenant_address?.trim() || undefined,
    city: data.tenant_city?.trim() || undefined,
    state: data.tenant_state?.trim() || undefined,
    logoUrl: data.tenant_logo_url?.trim() || undefined,
  };
}

export function mapPublicPayloadToProfile(
  data: PublicEquipmentPagePayload,
  token: string,
): EquipmentProfileData {
  return {
    id: token,
    tag: data.identificacao,
    brand: data.fabricante?.trim() || "—",
    model: data.modelo?.trim() || "—",
    serialNumber: data.serial?.trim() || "—",
    status: data.is_active ? "ativo" : "inativo",
    category: resolveProfileCategory(data.tipo, data.category_name),
    technicalSpecs: mapTechnicalSpecsToProfile(data.technical_specs),
    maintenanceHistory: mapPublicHistoryEntries(data.entries),
    provider: mapPublicPayloadToProvider(data),
    publicUrl: buildPublicEquipmentUrl(data.qrcode_code_id?.trim() || token),
  };
}

function collectEquipmentSpecs(item: EquipmentItem): TechnicalSpec[] {
  if (item.technicalSpecs?.length) {
    return mapTechnicalSpecRowsToProfile(item.technicalSpecs);
  }
  const defs = item.fieldDefinitions ?? [];
  const data = item.technicalData ?? {};
  if (defs.length) {
    return mapTechnicalSpecRowsToProfile(buildTechnicalSpecRows(defs, data));
  }
  return [];
}

export function mapEquipmentItemToProfile(
  item: EquipmentItem,
  options: {
    provider: ProviderCompany;
    maintenanceHistory: MaintenanceEvent[];
    publicUrl?: string | null;
  },
): EquipmentProfileData {
  const specs = collectEquipmentSpecs(item);

  return {
    id: item.id,
    tag: item.tag || item.location,
    brand: item.brandName || "—",
    model: item.modelName || "—",
    serialNumber: item.serialNumber || "—",
    qrcodeCodeId: item.qrcodeCodeId?.trim() || undefined,
    status: item.status,
    category: resolveProfileCategory(item.category, item.categoryName),
    technicalSpecs: specs,
    maintenanceHistory: options.maintenanceHistory,
    provider: options.provider,
    publicUrl: options.publicUrl ?? undefined,
    installationDate: item.installationDate || undefined,
    installationSiteLabel: item.siteName?.trim() || undefined,
  };
}
