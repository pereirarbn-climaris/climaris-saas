import type {
  PreventiveClientGroup,
  PreventiveItem,
  PreventiveMessageModel,
  PreventiveModelAttachment,
  PreventiveModelAutomation,
  PreventiveSettings,
} from "../api/preventiveMaintenance";
import { apiUrl } from "./apiUrl";

export type { PreventiveMessageModel, PreventiveModelAutomation, PreventiveModelAttachment };
export type PreventiveTemplateKind = string;

export const MAX_PREVENTIVE_MESSAGE_MODELS = 4;

const DEFAULT_RETURNING_BODY =
  "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";

const DEFAULT_FIRST_BODY =
  "Olá, {cliente}! Tudo bem? Está na hora da primeira higienização completa do seu {equipamento}. A limpeza regular garante eficiência energética e qualidade do ar. Vamos agendar?";

export function defaultModelAutomation(
  settings: PreventiveSettings | null | undefined,
): PreventiveModelAutomation {
  return {
    ai_message_enabled: settings?.preventive_ai_message_enabled !== false,
    ai_message_fidelity:
      settings?.preventive_ai_message_fidelity === "balanced" ? "balanced" : "faithful",
    auto_schedule_enabled: settings?.preventive_auto_schedule_enabled === true,
    action_buttons_enabled: settings?.preventive_action_buttons_enabled === true,
    button_schedule_enabled: settings?.preventive_button_schedule_enabled !== false,
    button_schedule_text: settings?.preventive_button_schedule_text?.trim() || "Agendar agora",
    button_custom_enabled: settings?.preventive_button_custom_enabled !== false,
    button_more_text: settings?.preventive_button_more_text?.trim() || "Sim, quero saber mais",
    button_custom_result:
      settings?.preventive_button_custom_result === "reply"
        ? "reply"
        : settings?.preventive_button_custom_result === "handoff"
          ? "handoff"
          : settings?.preventive_button_custom_result === "url"
            ? "url"
            : "lead",
    button_custom_reply_text: settings?.preventive_button_custom_reply_text?.trim() || "",
    button_custom_url: settings?.preventive_button_custom_url?.trim() || "",
    technical_problem_hint: settings?.preventive_technical_problem_hint?.trim() || "",
  };
}

export function defaultModelAttachment(
  settings: PreventiveSettings | null | undefined,
  modelId: string,
): PreventiveModelAttachment {
  const legacyBanner = modelId === "returning" && settings?.preventive_has_banner === true;
  return {
    promo_image_enabled: legacyBanner && settings?.preventive_promo_image_enabled === true,
    promo_image_url:
      legacyBanner
        ? settings?.preventive_promo_image_url?.trim() ||
          settings?.preventive_image_url?.trim() ||
          null
        : null,
    promo_image_s3_key: null,
    promo_image_mimetype: settings?.preventive_promo_image_mimetype?.trim() || "image/jpeg",
    has_banner: legacyBanner,
  };
}

function normalizeAutomation(
  raw: Partial<PreventiveModelAutomation> | undefined,
  settings: PreventiveSettings | null | undefined,
): PreventiveModelAutomation {
  const base = defaultModelAutomation(settings);
  if (!raw) return base;
  const fidelity = raw.ai_message_fidelity === "balanced" ? "balanced" : "faithful";
  const result =
    raw.button_custom_result === "reply" ||
    raw.button_custom_result === "handoff" ||
    raw.button_custom_result === "url"
      ? raw.button_custom_result
      : "lead";
  return {
    ai_message_enabled: raw.ai_message_enabled ?? base.ai_message_enabled,
    ai_message_fidelity: fidelity,
    auto_schedule_enabled: raw.auto_schedule_enabled ?? base.auto_schedule_enabled,
    action_buttons_enabled: raw.action_buttons_enabled ?? base.action_buttons_enabled,
    button_schedule_enabled: raw.button_schedule_enabled ?? base.button_schedule_enabled,
    button_schedule_text: raw.button_schedule_text?.trim() || base.button_schedule_text,
    button_custom_enabled: raw.button_custom_enabled ?? base.button_custom_enabled,
    button_more_text: raw.button_more_text?.trim() || base.button_more_text,
    button_custom_result: result,
    button_custom_reply_text: raw.button_custom_reply_text?.trim() ?? base.button_custom_reply_text,
    button_custom_url: raw.button_custom_url?.trim() ?? base.button_custom_url,
    technical_problem_hint: raw.technical_problem_hint?.trim() ?? base.technical_problem_hint,
  };
}

function normalizeAttachment(
  raw: Partial<PreventiveModelAttachment> | undefined,
  settings: PreventiveSettings | null | undefined,
  modelId: string,
): PreventiveModelAttachment {
  const base = defaultModelAttachment(settings, modelId);
  if (!raw) return base;
  const hasBanner = raw.has_banner ?? Boolean(raw.promo_image_s3_key || raw.promo_image_url);
  return {
    promo_image_enabled: raw.promo_image_enabled ?? base.promo_image_enabled,
    promo_image_url: raw.promo_image_url?.trim() || base.promo_image_url,
    promo_image_s3_key: raw.promo_image_s3_key?.trim() || base.promo_image_s3_key,
    promo_image_mimetype: raw.promo_image_mimetype?.trim() || base.promo_image_mimetype,
    has_banner: hasBanner,
  };
}

export function normalizePreventiveMessageModel(
  model: Partial<PreventiveMessageModel>,
  settings: PreventiveSettings | null | undefined,
): PreventiveMessageModel {
  const id = model.id?.trim() || "returning";
  return {
    id,
    name: model.name?.trim() || "Modelo",
    body: model.body?.trim() || DEFAULT_RETURNING_BODY,
    automation: normalizeAutomation(model.automation, settings),
    attachment: normalizeAttachment(model.attachment, settings, id),
  };
}

export function defaultPreventiveMessageModels(
  settings: PreventiveSettings | null | undefined,
): PreventiveMessageModel[] {
  if (settings?.preventive_message_models?.length) {
    return settings.preventive_message_models
      .slice(0, MAX_PREVENTIVE_MESSAGE_MODELS)
      .map((m) => normalizePreventiveMessageModel(m, settings));
  }
  const returning =
    settings?.preventive_message_template?.trim() ||
    settings?.default_message_template_returning?.trim() ||
    settings?.default_message_template?.trim() ||
    DEFAULT_RETURNING_BODY;
  const first =
    settings?.preventive_message_template_first?.trim() ||
    settings?.default_message_template_first?.trim() ||
    DEFAULT_FIRST_BODY;
  return [
    normalizePreventiveMessageModel(
      { id: "returning", name: "Cliente recorrente", body: returning },
      settings,
    ),
    normalizePreventiveMessageModel(
      { id: "first", name: "Primeira limpeza", body: first },
      settings,
    ),
  ];
}

export function preventiveModelOptions(settings: PreventiveSettings | null | undefined): {
  id: string;
  label: string;
  hint: string;
}[] {
  return defaultPreventiveMessageModels(settings).map((model) => ({
    id: model.id,
    label: model.name,
    hint: `Modelo: ${model.name}`,
  }));
}

export function tenantDefaultTemplateKind(
  settings: PreventiveSettings | null | undefined,
): PreventiveTemplateKind {
  if (settings?.preventive_default_template_model_id?.trim()) {
    return settings.preventive_default_template_model_id.trim();
  }
  return settings?.preventive_default_template_kind === "first" ? "first" : "returning";
}

export function templateKindFromItem(item: PreventiveItem | undefined): PreventiveTemplateKind | null {
  const kind = item?.message_template_kind;
  if (typeof kind === "string" && kind.trim()) return kind.trim();
  return null;
}

export function resolveTemplateKindForClientGroup(
  group: PreventiveClientGroup | undefined,
  settings: PreventiveSettings | null | undefined,
): PreventiveTemplateKind {
  for (const row of group?.equipments ?? []) {
    const kind = templateKindFromItem(row);
    if (kind) return kind;
  }
  return tenantDefaultTemplateKind(settings);
}

export function nextPreventiveModelId(models: PreventiveMessageModel[]): string {
  const ids = new Set(models.map((m) => m.id));
  for (let n = 3; n <= MAX_PREVENTIVE_MESSAGE_MODELS + 2; n += 1) {
    const candidate = `m${n}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `m${Date.now()}`;
}

export function activeModelBody(
  models: PreventiveMessageModel[],
  activeModelId: string,
): string {
  return models.find((m) => m.id === activeModelId)?.body ?? models[0]?.body ?? "";
}

export function activeModelFromList(
  models: PreventiveMessageModel[],
  activeModelId: string,
): PreventiveMessageModel | undefined {
  return models.find((m) => m.id === activeModelId) ?? models[0];
}

export function updateModelInList(
  models: PreventiveMessageModel[],
  modelId: string,
  patch: Partial<PreventiveMessageModel>,
): PreventiveMessageModel[] {
  return models.map((m) => (m.id === modelId ? { ...m, ...patch } : m));
}

export function patchModelAutomation(
  models: PreventiveMessageModel[],
  modelId: string,
  patch: Partial<PreventiveModelAutomation>,
): PreventiveMessageModel[] {
  return models.map((m) =>
    m.id === modelId ? { ...m, automation: { ...m.automation, ...patch } } : m,
  );
}

export function patchModelAttachment(
  models: PreventiveMessageModel[],
  modelId: string,
  patch: Partial<PreventiveModelAttachment>,
): PreventiveMessageModel[] {
  return models.map((m) =>
    m.id === modelId ? { ...m, attachment: { ...m.attachment, ...patch } } : m,
  );
}

export function preventiveModelBannerPreviewUrl(model: PreventiveMessageModel): string {
  const attach = model.attachment;
  if (attach.promo_image_url?.trim()) return attach.promo_image_url.trim();
  if (attach.has_banner) {
    return apiUrl(
      `/api/v1/preventive-maintenance/banner-image/file?model_id=${encodeURIComponent(model.id)}`,
    );
  }
  return "";
}

export type PreventiveTemplateDraft = {
  models: PreventiveMessageModel[];
  activeModelId: string;
};

export function buildPreventiveTemplateData(
  settings: PreventiveSettings | null | undefined,
): PreventiveTemplateDraft {
  const models = defaultPreventiveMessageModels(settings);
  const defaultId = tenantDefaultTemplateKind(settings);
  const activeModelId = models.some((m) => m.id === defaultId) ? defaultId : models[0]?.id ?? "returning";
  return { models, activeModelId };
}

export function createEmptyPreventiveModel(
  models: PreventiveMessageModel[],
  settings: PreventiveSettings | null | undefined,
): PreventiveMessageModel {
  const id = nextPreventiveModelId(models);
  const template = models[0] ?? defaultPreventiveMessageModels(settings)[0];
  return normalizePreventiveMessageModel(
    {
      id,
      name: `Modelo ${models.length + 1}`,
      body: template?.body || DEFAULT_RETURNING_BODY,
      automation: template?.automation,
      attachment: defaultModelAttachment(settings, id),
    },
    settings,
  );
}
