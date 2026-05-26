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
};

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
  return {
    id: row.id,
    identificacao: row.identificacao,
    fabricante: row.fabricante?.trim() || null,
    modelo: formatLegacyModelLabel(row),
    capacidade_btu: row.capacidade_btu,
    local_instalacao: row.local_instalacao ?? row.identificacao,
  };
}

/** Equipamentos selecionáveis no PMOC — mesma fonte do cadastro do cliente (catálogo v2). */
export async function loadPmocEquipmentsForSite(
  clientId: number,
  siteId: number,
): Promise<{ items: PmocEquipmentOption[]; otherSitesCount: number }> {
  const [catalogRows, sites] = await Promise.all([
    listClientCatalogEquipments(clientId, { only_active: true }),
    listClientSites(clientId).catch(() => []),
  ]);

  const siteItems = catalogRows
    .filter((row) => row.client_site_id === siteId)
    .map((row) => mapCatalogRow(row, sites))
    .filter((row): row is PmocEquipmentOption => row != null);

  const otherSitesCount = catalogRows.filter(
    (row) => row.client_site_id != null && row.client_site_id !== siteId,
  ).length;

  if (siteItems.length > 0) {
    return { items: siteItems, otherSitesCount };
  }

  const legacyRows = await listClientHvacEquipments(clientId, {
    only_active: true,
    client_site_id: siteId,
  });

  return {
    items: legacyRows.map(mapLegacyRow),
    otherSitesCount,
  };
}
