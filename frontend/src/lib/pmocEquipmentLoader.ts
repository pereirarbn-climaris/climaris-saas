import { listClientHvacEquipments, listClientSites } from "../api/clients";
import { listClientCatalogEquipments, type ClientEquipmentOut } from "../api/equipmentCatalog";
import { mapClientEquipmentToView } from "./clientEquipmentAdapter";

export type PmocEquipmentOption = {
  id: number;
  identificacao: string;
  fabricante: string | null;
  modelo: string | null;
  capacidade_btu: number | null;
  local_instalacao: string | null;
  equipment_type_key: string | null;
  equipment_type_label: string | null;
};

function normalizeEquipmentType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function mapCatalogRow(
  row: ClientEquipmentOut,
  sites: Awaited<ReturnType<typeof listClientSites>>,
): PmocEquipmentOption | null {
  if (row.legacy_equipment_id == null) return null;
  const view = mapClientEquipmentToView(row, sites);
  return {
    id: row.legacy_equipment_id,
    identificacao: row.tag,
    fabricante: view.brandName !== "—" ? view.brandName : null,
    modelo: view.modelName !== "—" ? view.modelName : null,
    capacidade_btu: view.specs.capacityBTU ?? null,
    local_instalacao: row.installation_reference?.trim() || row.tag,
    equipment_type_key: normalizeEquipmentType(row.components[0]?.catalog.category?.name ?? null),
    equipment_type_label: row.components[0]?.catalog.category?.name ?? null,
  };
}

function formatLegacyModelLabel(row: Awaited<ReturnType<typeof listClientHvacEquipments>>[number]): string | null {
  const cond = row.modelo_condensadora?.trim();
  const evap = row.modelo_evaporadora?.trim();
  if (cond && evap) return `${cond} + ${evap}`;
  const modelo = row.modelo?.trim();
  if (modelo) return modelo;
  if (cond) return cond;
  if (evap) return evap;
  return null;
}

function mapLegacyRow(row: Awaited<ReturnType<typeof listClientHvacEquipments>>[number]): PmocEquipmentOption {
  const installationType = row.categoria_instalacao?.trim() || null;
  return {
    id: row.id,
    identificacao: row.identificacao,
    fabricante: row.fabricante?.trim() || null,
    modelo: formatLegacyModelLabel(row),
    capacidade_btu: row.capacidade_btu,
    local_instalacao: row.local_instalacao ?? row.identificacao,
    equipment_type_key: normalizeEquipmentType(installationType),
    equipment_type_label: installationType,
  };
}

/** Equipamentos selecionáveis no PMOC — mesma fonte do cadastro do cliente (catálogo v2). */
export async function loadPmocEquipmentsForSite(
  clientId: number,
  siteId?: number | null,
): Promise<{ items: PmocEquipmentOption[]; otherSitesCount: number }> {
  const [catalogRows, sites] = await Promise.all([
    listClientCatalogEquipments(clientId, { only_active: true }),
    listClientSites(clientId).catch(() => []),
  ]);

  const hasSelectedSite = typeof siteId === "number" && Number.isFinite(siteId) && siteId > 0;
  const siteItems = catalogRows
    .filter((row) => (hasSelectedSite ? row.client_site_id === siteId : row.client_site_id == null))
    .map((row) => mapCatalogRow(row, sites))
    .filter((row): row is PmocEquipmentOption => row != null);

  const otherSitesCount = catalogRows.filter((row) =>
    hasSelectedSite ? row.client_site_id != null && row.client_site_id !== siteId : row.client_site_id != null,
  ).length;

  if (siteItems.length > 0) {
    return { items: siteItems, otherSitesCount };
  }

  const legacyRows = await listClientHvacEquipments(clientId, {
    only_active: true,
    client_site_id: hasSelectedSite ? siteId : undefined,
  });

  return {
    items: legacyRows
      .filter((row) => (hasSelectedSite ? row.client_site_id === siteId : row.client_site_id == null))
      .map(mapLegacyRow),
    otherSitesCount,
  };
}
