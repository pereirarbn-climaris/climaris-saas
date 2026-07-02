import type { PmocCreateTab } from "../components/pmoc/PmocCreateStatusBanner";

export type PmocCreateValidationIssue = {
  code: string;
  field: string;
  message: string;
  tab: PmocCreateTab;
};

export type PmocCreateDraft = {
  clientId: string;
  siteId: string;
  resolvedSiteId: string;
  requiresSite: boolean;
  equipmentIds: number[];
  planTitle: string;
  responsibleName: string;
  selectedBtuSum: number;
};

export type PmocCreateValidationResult = {
  ok: boolean;
  message: string;
  issues: PmocCreateValidationIssue[];
  highlights: {
    missingClient: boolean;
    missingSite: boolean;
    missingEquipment: boolean;
    missingRt: boolean;
  };
  firstTab?: PmocCreateTab;
};

export function validatePmocCreateDraft(draft: PmocCreateDraft): PmocCreateValidationResult {
  const issues: PmocCreateValidationIssue[] = [];

  if (!draft.clientId.trim()) {
    issues.push({
      code: "missing_client",
      field: "clientId",
      message: "Selecione o cliente titular do PMOC.",
      tab: "identification",
    });
  }

  if (draft.clientId.trim() && draft.requiresSite && !draft.resolvedSiteId.trim()) {
    issues.push({
      code: "missing_site",
      field: "siteId",
      message: "Selecione a obra ou filial vinculada ao plano.",
      tab: "identification",
    });
  }

  if ((draft.requiresSite ? draft.resolvedSiteId.trim() : draft.clientId.trim()) && draft.equipmentIds.length < 1) {
    issues.push({
      code: "missing_equipment",
      field: "equipmentIds",
      message: "Vincule ao menos um equipamento ao PMOC.",
      tab: "identification",
    });
  }

  if (!draft.responsibleName.trim()) {
    issues.push({
      code: "missing_rt",
      field: "rtData.responsibleName",
      message: "Informe o responsável técnico (RT) na aba Ar & ART.",
      tab: "air",
    });
  }

  if (!draft.planTitle.trim() || draft.planTitle.trim().length < 3) {
    issues.push({
      code: "missing_title",
      field: "title",
      message: "Informe um título com pelo menos 3 caracteres.",
      tab: "identification",
    });
  }

  const highlights = {
    missingClient: issues.some((i) => i.code === "missing_client"),
    missingSite: issues.some((i) => i.code === "missing_site"),
    missingEquipment: issues.some((i) => i.code === "missing_equipment"),
    missingRt: issues.some((i) => i.code === "missing_rt"),
  };

  return {
    ok: issues.length === 0,
    message: issues[0]?.message ?? "Corrija os campos obrigatórios antes de salvar o PMOC.",
    issues,
    highlights,
    firstTab: issues[0]?.tab,
  };
}

export function parsePmocCreateApiErrors(body: unknown): PmocCreateValidationIssue[] {
  if (!body || typeof body !== "object") return [];
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return [];
  const errors = (detail as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .filter((row): row is PmocCreateValidationIssue => {
      if (!row || typeof row !== "object") return false;
      const o = row as Record<string, unknown>;
      return typeof o.code === "string" && typeof o.tab === "string";
    })
    .map((row) => ({
      code: row.code,
      field: String((row as { field?: string }).field ?? ""),
      message: String((row as { message?: string }).message ?? ""),
      tab: row.tab as PmocCreateTab,
    }));
}
