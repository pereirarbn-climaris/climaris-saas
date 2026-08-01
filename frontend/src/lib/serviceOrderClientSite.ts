import type { ClientSiteOut } from "../api/clients";
import { listClientHvacEquipments } from "../api/clients";
import type { EquipmentOut } from "../api/clients";
import { formatClientAddressLine } from "./clientComboboxAdapter";

/** Valor do select quando o serviço é na matriz (cadastro principal). */
export const SERVICE_ORDER_MATRIX_SITE_VALUE = "__matrix__";

export function isServiceOrderMatrixSite(value: string | null | undefined): boolean {
  return !value || value === SERVICE_ORDER_MATRIX_SITE_VALUE;
}

export function clientSiteIdForApi(value: string | null | undefined): number | undefined {
  if (isServiceOrderMatrixSite(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function clientSiteIdFromApi(siteId: number | null | undefined): string {
  if (siteId != null && siteId > 0) return String(siteId);
  return SERVICE_ORDER_MATRIX_SITE_VALUE;
}

export function clientSiteLabel(site: ClientSiteOut): string {
  const parts = [site.name, site.city, site.state].filter(Boolean);
  return parts.join(" · ");
}

export function formatClientSiteAddressLine(site: ClientSiteOut): string | undefined {
  return formatClientAddressLine({
    address_street: site.street,
    address_number: site.number,
    address_complement: site.complement,
    address_district: site.neighborhood,
    address_city: site.city,
    address_state: site.state,
  });
}

export function resolveServiceOrderAddressLabel(
  client: Parameters<typeof formatClientAddressLine>[0] | null | undefined,
  site: ClientSiteOut | null | undefined,
  siteId: string | null | undefined,
): string | undefined {
  if (!isServiceOrderMatrixSite(siteId) && site) {
    return formatClientSiteAddressLine(site);
  }
  return client ? formatClientAddressLine(client) : undefined;
}

/** Equipamentos do cliente filtrados por matriz ou filial selecionada. */
export async function loadServiceOrderEquipmentsForSite(
  clientId: number,
  siteId?: number | null,
): Promise<EquipmentOut[]> {
  const hasSelectedSite = typeof siteId === "number" && Number.isFinite(siteId) && siteId > 0;
  const rows = await listClientHvacEquipments(clientId, {
    only_active: true,
    client_site_id: hasSelectedSite ? siteId : undefined,
  });
  if (hasSelectedSite) {
    return rows.filter((row) => row.client_site_id === siteId);
  }
  return rows.filter((row) => row.client_site_id == null);
}
