import type { ClientSiteOut } from "../api/clients";
import type {
  ClientEquipmentComponentOut,
  ClientEquipmentOut,
  EquipmentCatalogOut,
} from "../api/equipmentCatalog";
import type {
  CatalogBrand,
  CatalogModel,
  EquipmentCatalog,
  EquipmentCategory,
  EquipmentItem,
  InstalledComponentView,
  NewEquipmentData,
} from "../components/v0-ui/clients/ClientEquipmentManager";
import {
  buildTechnicalSpecRows,
  resolveCategoryFieldDefinitions,
  technicalDataFromCatalog,
} from "./categoryFieldDefinitions";
import { normalizeCategoryIconKey } from "./equipmentCategoryIcons";
import { isPendingIdentificationBrand } from "./equipmentPendingIdentification";

function categorySlugFromCatalog(category: EquipmentCatalogOut["category"]): EquipmentCategory {
  return normalizeCategoryIconKey(category.icon_key, category.name);
}

function brandKey(brand: string, categoryId: string): string {
  return `${categoryId}::${brand.trim().toLowerCase()}`;
}

function parseBtu(capacity: string | null | undefined): number | undefined {
  if (!capacity) return undefined;
  const match = capacity.replace(/\./g, "").match(/(\d{3,6})/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function pickPrimaryComponent(components: ClientEquipmentComponentOut[]): ClientEquipmentComponentOut | null {
  if (!components.length) return null;
  return (
    components.find((c) => c.catalog.component_type === "CONDENSADORA") ??
    components.find((c) => c.catalog.component_type === "EVAPORADORA") ??
    components[0]
  );
}

function formatModelLabel(components: ClientEquipmentComponentOut[]): string {
  if (components.length === 0) return "—";
  if (components.length === 1) return components[0].catalog.model;
  const cond = components.filter((c) => c.catalog.component_type === "CONDENSADORA");
  const evaps = components.filter((c) => c.catalog.component_type === "EVAPORADORA");
  if (cond.length === 1 && evaps.length >= 1) {
    return `${cond[0].catalog.model} + ${evaps.length} evaporadora${evaps.length > 1 ? "s" : ""}`;
  }
  return `${components[0].catalog.model} (+${components.length - 1} peça${components.length > 2 ? "s" : ""})`;
}

function hasAnyManual(components: ClientEquipmentComponentOut[]): boolean {
  return components.some((c) => Boolean(c.catalog.manual_url));
}

function pushCatalogModel(
  models: CatalogModel[],
  item: EquipmentCatalogOut,
  bKey: string,
  category: EquipmentCategory,
  opts: { name: string; componentType: CatalogModel["componentType"] },
): void {
  const fieldDefinitions = resolveCategoryFieldDefinitions(item.category);
  const technicalData = technicalDataFromCatalog(item);
  models.push({
    id: item.id,
    brandId: bKey,
    categoryId: item.category_id,
    name: opts.name,
    category,
    componentType: opts.componentType,
    specs: {
      gasType: (item.fluid_type ?? technicalData.fluid_type ?? undefined) as string | undefined,
      capacityBTU: parseBtu(item.capacity ?? technicalData.capacity),
      voltage: (item.voltage ?? technicalData.voltage ?? undefined) as string | undefined,
    },
    fieldDefinitions,
    technicalData,
    technicalSpecs: buildTechnicalSpecRows(fieldDefinitions, technicalData),
    hasManual: Boolean(item.manual_url),
  });
}

/** ID do catálogo na API (mesmo quando há várias linhas virtuais evap/cond). */
export function resolveCatalogEntryId(model: CatalogModel): string {
  return model.id;
}

export function buildEquipmentCatalogView(items: EquipmentCatalogOut[]): EquipmentCatalog {
  const brandMap = new Map<string, CatalogBrand>();
  const models: CatalogModel[] = [];

  for (const item of items) {
    // O item placeholder ("Marca não identificada") não deve aparecer como
    // opção normal de marca/modelo no seletor — só é usado explicitamente
    // pelo botão "Não sei a marca/modelo" (fetchPendingIdentificationCatalog).
    if (isPendingIdentificationBrand(item.brand)) continue;
    const category = categorySlugFromCatalog(item.category);
    const bKey = brandKey(item.brand, item.category_id);
    if (!brandMap.has(bKey)) {
      brandMap.set(bKey, {
        id: bKey,
        name: item.brand,
        categories: [category],
      });
    } else {
      const brand = brandMap.get(bKey)!;
      if (!brand.categories.includes(category)) {
        brand.categories.push(category);
      }
    }

    const evap = (item.model_evaporator ?? "").trim();
    const cond = (item.model_condenser ?? "").trim();
    const displayName = (item.model ?? "").trim() || evap || cond || "—";
    const isSplitPair = Boolean(evap && cond);
    const pickerComponentType: CatalogModel["componentType"] =
      isSplitPair && (item.component_type === "EVAPORADORA" || item.component_type === "CONDENSADORA")
        ? item.component_type
        : "UNICO";

    // Linha principal (wizard padrão) — climatizador/geladeira etc. sempre como UNICO.
    pushCatalogModel(models, item, bKey, category, {
      name: displayName,
      componentType: pickerComponentType,
    });

    // Peças separadas para fluxo Multi-Split (condensadora / evaporadora).
    if (evap && evap !== displayName) {
      pushCatalogModel(models, item, bKey, category, {
        name: evap,
        componentType: "EVAPORADORA",
      });
    }
    if (cond && cond !== displayName) {
      pushCatalogModel(models, item, bKey, category, {
        name: cond,
        componentType: "CONDENSADORA",
      });
    }
  }

  return {
    brands: Array.from(brandMap.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    models,
  };
}

function mapComponentToView(c: ClientEquipmentComponentOut): InstalledComponentView {
  const defs = resolveCategoryFieldDefinitions(c.catalog.category);
  const technicalData = technicalDataFromCatalog(c.catalog);
  return {
    id: c.id,
    componentType: c.catalog.component_type,
    brand: c.catalog.brand,
    model: c.catalog.model,
    capacity: c.catalog.capacity,
    manualUrl: c.catalog.manual_url,
    serialNumber: c.serial_number ?? "",
    fieldDefinitions: defs,
    technicalData,
    technicalSpecs: buildTechnicalSpecRows(defs, technicalData),
  };
}

function resolveSiteName(siteId: number | null | undefined, sites?: ClientSiteOut[]): string | undefined {
  if (siteId == null || !sites?.length) return undefined;
  return sites.find((s) => s.id === siteId)?.name;
}

export function mapClientEquipmentToView(row: ClientEquipmentOut, sites?: ClientSiteOut[]): EquipmentItem {
  const components = row.components ?? [];
  const primary = pickPrimaryComponent(components);
  const catalog = primary?.catalog;
  const legacyBrand = row.legacy_fabricante?.trim();
  const legacyModel = row.legacy_modelo?.trim();
  const legacySerial = row.legacy_serial?.trim();
  const legacyBtu = row.legacy_capacidade_btu ?? undefined;
  const category = catalog
    ? categorySlugFromCatalog(catalog.category)
    : legacyBrand || legacyModel
      ? "ar_condicionado"
      : "outros";
  const bKey = catalog ? brandKey(catalog.brand, catalog.category_id) : legacyBrand ? `legacy::${legacyBrand.toLowerCase()}` : "";
  const fieldDefinitions = catalog ? resolveCategoryFieldDefinitions(catalog.category) : [];
  const technicalData = catalog ? technicalDataFromCatalog(catalog) : {};
  const technicalSpecs = buildTechnicalSpecRows(fieldDefinitions, technicalData);

  const serials = components
    .map((c) => c.serial_number?.trim())
    .filter(Boolean)
    .join(" / ");

  return {
    id: row.id,
    category,
    categoryName: catalog?.category.name,
    brandId: bKey,
    brandName: catalog?.brand ?? legacyBrand ?? "—",
    modelId: primary?.catalog_id ?? "",
    modelName: components.length > 0 ? formatModelLabel(components) : legacyModel ?? row.tag ?? "—",
    serialNumber: serials || primary?.serial_number || legacySerial || "",
    tag: row.tag,
    installationReference: row.installation_reference ?? "",
    location: row.tag,
    clientSiteId: row.client_site_id ?? null,
    siteName: resolveSiteName(row.client_site_id, sites),
    installationDate: row.installation_date ?? "",
    manufactureYear: row.manufacture_year ?? null,
    gasChargeKg: row.gas_charge_kg ?? null,
    notes: row.notes ?? null,
    status: row.is_active ? "ativo" : "inativo",
    specs: {
      gasType: (catalog?.fluid_type ?? technicalData.fluid_type) as string | undefined,
      capacityBTU:
        parseBtu(catalog?.capacity ?? (technicalData.capacity != null ? String(technicalData.capacity) : undefined)) ??
        legacyBtu,
      voltage: (catalog?.voltage ?? technicalData.voltage) as string | undefined,
    },
    fieldDefinitions,
    technicalData,
    technicalSpecs,
    legacyEquipmentId: row.legacy_equipment_id,
    publicToken: row.public_token ?? null,
    qrcodeCodeId: row.qrcode_code_id ?? null,
    hasManual: hasAnyManual(components),
    canDelete: row.can_delete ?? false,
    deleteBlockReason: row.delete_block_reason ?? null,
    components: components.map(mapComponentToView),
    pendingIdentification: row.pending_identification ?? isPendingIdentificationBrand(legacyBrand),
  };
}

export function newEquipmentDataToCreatePayload(data: NewEquipmentData) {
  const installationDate = data.installationDate?.trim() ? data.installationDate.trim() : null;
  const siteId = data.clientSiteId != null && data.clientSiteId > 0 ? data.clientSiteId : null;
  const siteFields = siteId != null ? { client_site_id: siteId } : {};
  const qrcode = data.qrcodeCodeId?.trim() || null;
  const extraFields = {
    manufacture_year: data.manufactureYear ?? null,
    gas_charge_kg: data.gasChargeKg ?? null,
    notes: data.notes?.trim() || null,
  };
  if (data.components && data.components.length > 0) {
    return {
      tag: data.tag.trim(),
      installation_reference: data.installationReference?.trim() || null,
      installation_date: installationDate,
      qrcode_code_id: qrcode,
      ...siteFields,
      ...extraFields,
      components: data.components.map((c) => ({
        catalog_id: c.catalogId,
        serial_number: c.serialNumber.trim() || null,
      })),
    };
  }
  return {
    tag: data.tag.trim(),
    installation_reference: data.installationReference?.trim() || null,
    installation_date: installationDate,
    qrcode_code_id: qrcode,
    ...siteFields,
    ...extraFields,
    components: [
      {
        catalog_id: data.modelId ?? "",
        serial_number: (data.serialNumber ?? "").trim() || null,
      },
    ],
  };
}

export function equipmentCategoryToApi(_category: EquipmentCategory): string {
  return _category;
}

/** Primeira URL de manual entre os componentes (para download legado). */
export function firstManualUrlFromInstallation(row: ClientEquipmentOut): string | null {
  for (const c of row.components ?? []) {
    if (c.catalog.manual_url) return c.catalog.manual_url;
  }
  return null;
}
