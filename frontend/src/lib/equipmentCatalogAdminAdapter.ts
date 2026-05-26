import type { EquipmentCategoryOut } from "../api/equipmentCatalog";
import {
  formatTechnicalSummary,
  resolveCategoryFieldDefinitions,
  serializeTechnicalDataForApi,
  technicalDataFromCatalog,
} from "./categoryFieldDefinitions";
import { isAcLikeIconKey, normalizeCategoryIconKey } from "./equipmentCategoryIcons";
import type {
  CatalogEquipment,
  CatalogMetrics,
  CategoryOption,
  NewCatalogEquipmentData,
} from "../components/v0-ui/admin/AdminEquipmentCatalogView";
import type { EquipmentCatalogOut } from "../api/equipmentCatalog";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mapApiCategoryToOption(item: EquipmentCategoryOut): CategoryOption {
  const fieldDefinitions = resolveCategoryFieldDefinitions(item);
  return {
    id: item.id,
    name: item.name,
    iconKey: normalizeCategoryIconKey(item.icon_key, item.name),
    sortOrder: item.sort_order,
    hasFluidType: item.has_fluid_type,
    hasCapacity: item.has_capacity,
    hasVoltage: item.has_voltage,
    fieldDefinitions,
  };
}

export function mapCatalogItemToView(item: EquipmentCatalogOut): CatalogEquipment {
  const fieldDefinitions = resolveCategoryFieldDefinitions(item.category);
  const technicalData = technicalDataFromCatalog(item);
  return {
    id: item.id,
    categoryId: item.category_id,
    categoryName: item.category.name,
    categoryIconKey: normalizeCategoryIconKey(item.category.icon_key, item.category.name),
    marca: item.brand,
    modelo: item.model,
    modelEvaporator: item.model_evaporator ?? "",
    modelCondenser: item.model_condenser ?? "",
    technicalData,
    technicalSummary: formatTechnicalSummary(fieldDefinitions, technicalData),
    manualUrl: item.manual_url,
    manualId: item.manual_id,
    manualTitle: item.manual?.title ?? null,
    createdAt: "",
    updatedAt: "",
  };
}

export function buildCatalogMetrics(items: CatalogEquipment[], total?: number): CatalogMetrics {
  return {
    totalModelos: total ?? items.length,
    totalArCondicionado: items.filter((e) =>
      isAcLikeIconKey(e.categoryIconKey ?? normalizeCategoryIconKey(null, e.categoryName)),
    ).length,
    totalGeladeiraBebedouro: items.filter((e) => {
      const k = e.categoryIconKey ?? normalizeCategoryIconKey(null, e.categoryName);
      return k === "geladeira" || k === "bebedouro";
    }).length,
    totalComManual: items.filter((e) => Boolean(e.manualUrl)).length,
  };
}

/** Valor de formulário opcional: null/undefined/vazio → não envia no multipart. */
function optionalFormValue(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
}

function requireCategoryUuid(categoryId: string | undefined): string {
  const id = optionalFormValue(categoryId);
  if (!id || !UUID_RE.test(id)) {
    throw new Error(
      "Categoria inválida. Selecione uma categoria na lista (o ID deve ser um UUID, não o nome).",
    );
  }
  return id;
}

function appendFormField(fd: FormData, key: string, value: string | null | undefined): void {
  const normalized = optionalFormValue(value);
  if (normalized === undefined) return;
  fd.append(key, normalized);
}

function appendModelFields(fd: FormData, data: NewCatalogEquipmentData): void {
  const evap = optionalFormValue(data.modelEvaporator);
  const cond = optionalFormValue(data.modelCondenser);
  const legacyModel = optionalFormValue(data.modelo);
  if (evap) fd.append("model_evaporator", evap);
  if (cond) fd.append("model_condenser", cond);
  if (!evap && !cond && legacyModel) {
    fd.append("model", legacyModel);
  }
}

/** Log de diagnóstico (dev): lista chaves do FormData sem vazar o binário do PDF. */
export function inspectCatalogFormData(fd: FormData): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD) return;
  for (const [key, value] of fd.entries()) {
    if (value instanceof File) {
      console.debug("[catalog-form]", key, {
        name: value.name,
        size: value.size,
        type: value.type,
      });
    } else {
      console.debug("[catalog-form]", key, value);
    }
  }
}

/** Monta FormData multipart para POST/PATCH do catálogo. */
export function newCatalogDataToFormData(data: NewCatalogEquipmentData): FormData {
  const fd = new FormData();
  fd.append("category_id", requireCategoryUuid(data.categoryId));

  const brand = optionalFormValue(data.marca);
  if (!brand) {
    throw new Error("Marca é obrigatória.");
  }
  fd.append("brand", brand);

  appendModelFields(fd, data);
  if (data.fieldDefinitions.length > 0) {
    const payload = serializeTechnicalDataForApi(data.fieldDefinitions, data.technicalData);
    if (Object.keys(payload).length > 0) {
      fd.append("technical_data", JSON.stringify(payload));
    }
  }

  if (data.removeManual) {
    fd.append("clear_manual", "true");
  } else if (data.manualPdf) {
    const title =
      optionalFormValue(data.manualTitle) ??
      optionalFormValue(data.manualPdf.name.replace(/\.pdf$/i, "")) ??
      "Manual tecnico";
    appendFormField(fd, "manual_title", title);
    fd.append("manual_pdf", data.manualPdf, data.manualPdf.name || "manual.pdf");
  } else if (data.manualMode === "existing") {
    const manualId = optionalFormValue(data.manualId);
    if (!manualId || !UUID_RE.test(manualId)) {
      throw new Error("Selecione um manual válido da lista ou escolha \"Sem manual\".");
    }
    fd.append("manual_id", manualId);
  }

  const manuals = data.acManuals;
  if (manuals) {
    if (manuals.usuario.pdf) {
      fd.append("manual_usuario_pdf", manuals.usuario.pdf, manuals.usuario.pdf.name || "manual-usuario.pdf");
    }
    if (manuals.servico.pdf) {
      fd.append("manual_servico_pdf", manuals.servico.pdf, manuals.servico.pdf.name || "manual-servico.pdf");
    }
    if (manuals.instalacao.pdf && !data.manualPdf) {
      fd.append("manual_instalacao_pdf", manuals.instalacao.pdf, manuals.instalacao.pdf.name || "manual-instalacao.pdf");
    }
    if (manuals.existingManualId && data.manualMode === "existing" && !data.manualId) {
      fd.append("manual_id", manuals.existingManualId);
    }
  }

  return fd;
}

export function shouldUseExistingManualEndpoint(data: NewCatalogEquipmentData): boolean {
  const linkedId = data.manualId || data.acManuals?.existingManualId || "";
  return data.manualMode === "existing" && Boolean(linkedId) && !data.manualPdf;
}
