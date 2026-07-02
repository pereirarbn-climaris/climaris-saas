/**
 * PreventiveTemplateSettings.tsx
 * 
 * Painel de configuração de mensagens WhatsApp para alertas de manutenção preventiva.
 * Inclui preview ao vivo em formato de smartphone e tags dinâmicas clicáveis.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  MAX_PREVENTIVE_MESSAGE_MODELS,
  createEmptyPreventiveModel,
  patchModelAttachment,
  preventiveModelBannerPreviewUrl,
  updateModelInList,
  type PreventiveTemplateDraft,
} from '../../../lib/preventiveMessageTemplate';
import type { PreventiveMessageModel } from '../../../api/preventiveMaintenance';
import previewStyles from './PreventiveWhatsAppPreview.module.css';

// ============================================================================
// Types
// ============================================================================

export type PreventiveTemplateKind = string;

export type { PreventiveMessageModel };

export type TemplateData = PreventiveTemplateDraft;

export interface DynamicTag {
  tag: string;
  label: string;
  description: string;
}

export interface PreventiveTemplateSettingsProps {
  /** Dados iniciais do template */
  initialData?: TemplateData;
  /** Modo controlado (compartilha estado entre seções / prévia lateral) */
  data?: TemplateData;
  onDataChange?: (data: TemplateData) => void;
  /** standalone = card completo; embedded = bloco dentro do painel Campanhas */
  variant?: "standalone" | "embedded";
  /** Seção visível no modo embedded */
  activeSection?: "template" | "attachments" | "all";
  /** Prévia inline no componente (false = painel pai renderiza PreventiveWhatsAppPreview) */
  showInlinePreview?: boolean;
  showFooter?: boolean;
  /** Exibir seletor de modelos (false quando o pai já renderiza) */
  showModelSelector?: boolean;
  /** Callback ao salvar */
  onSave?: (data: TemplateData) => Promise<void>;
  /** Callback ao restaurar padrão */
  onRestoreDefault?: () => void;
  /** Upload do banner para S3 */
  onUploadBanner?: (file: File) => Promise<string>;
  /** Remove banner do S3 */
  onRemoveBanner?: () => Promise<void>;
  /** Estado de loading externo */
  isLoading?: boolean;
  /** Exibir prévia WhatsApp abaixo do corpo da mensagem */
  showBelowMessagePreview?: boolean;
  /** Nome exibido no cabeçalho da prévia */
  previewContactName?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MESSAGE_RETURNING = `Olá, {cliente}! 👋

Notamos que faz *{intervalo}* desde a última manutenção do seu *{equipamento}* ({marca_modelo}).

A limpeza regular é essencial para:
✅ Garantir a eficiência energética
✅ Melhorar a qualidade do ar
✅ Prolongar a vida útil do aparelho

📞 Entre em contato conosco para agendar sua manutenção preventiva!`;

const DEFAULT_MESSAGE_FIRST = `Olá, {cliente}! 👋

Está na hora da *primeira higienização completa* do seu *{equipamento}*.

A limpeza regular é essencial para:
✅ Garantir a eficiência energética
✅ Melhorar a qualidade do ar
✅ Prolongar a vida útil do aparelho

📞 Entre em contato conosco para agendar sua primeira manutenção preventiva!`;

const DEFAULT_MODELS: PreventiveMessageModel[] = [];

const DYNAMIC_TAGS: DynamicTag[] = [
  { tag: '{cliente}', label: 'Cliente', description: 'Nome do cliente' },
  { tag: '{equipamento}', label: 'Equipamento', description: 'Nome/tag do equipamento' },
  { tag: '{marca_modelo}', label: 'Marca/Modelo', description: 'Marca e modelo do aparelho' },
  { tag: '{intervalo}', label: 'Intervalo', description: 'Tempo desde última manutenção' },
  { tag: '{mes_atual}', label: 'Mês atual', description: 'Mês corrente no fuso da empresa (ex.: Junho)' },
  { tag: '{equipamentos_lista}', label: 'Lista de equipamentos', description: 'Vários aparelhos no mesmo mês (um por linha)' },
];

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ============================================================================
// Icons (Lucide-style SVG)
// ============================================================================

const MessageSquareCodeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M10 8l-2 4 2 4" />
    <path d="M14 8l2 4-2 4" />
  </svg>
);

const ImagePlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
    <line x1="16" y1="5" x2="22" y2="5" />
    <line x1="19" y1="2" x2="19" y2="8" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RotateCcwIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const SaveIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// ============================================================================
// Sub-components
// ============================================================================

interface TagBadgeProps {
  tag: DynamicTag;
  onCopy: (tag: string) => void;
}

const TagBadge: React.FC<TagBadgeProps> = ({ tag, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(tag.tag);
    onCopy(tag.tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [tag.tag, onCopy]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium 
        bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] 
        hover:bg-[hsl(var(--primary)/0.2)] transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2"
      title={tag.description}
    >
      <code className="text-xs font-mono">{tag.tag}</code>
      {copied ? (
        <CheckIcon className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <CopyIcon className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
};

interface WhatsAppPreviewProps {
  message: string;
  imageUrl?: string;
  buttons?: string[];
  buttonEntries?: { label: string; reply: string }[];
  contactName?: string;
}

export const PreventiveWhatsAppPreview: React.FC<WhatsAppPreviewProps> = ({
  message,
  imageUrl = "",
  buttons = [],
  buttonEntries,
  contactName = "Sua empresa",
}) => {
  // Substitui as tags por valores de exemplo para o preview
  const previewMessage = message
    .replace(/{cliente}/g, 'João Silva')
    .replace(/{equipamento}/g, 'Split Sala de Estar')
    .replace(/{marca_modelo}/g, 'Carrier 12000 BTUs')
    .replace(/{intervalo}/g, '6 meses')
    .replace(/{mes_atual}/g, MESES_PT[new Date().getMonth()])
    .replace(/{equipamentos_lista}/g, '• Split Sala (Carrier 12000)\n• Split Quarto (LG 9000)');

  const nowLabel = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const initials = contactName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'AC';

  const hasImage = Boolean(imageUrl?.trim());
  const resolvedButtonEntries =
    buttonEntries ??
    buttons
      .filter((label) => label.trim())
      .map((label) => ({
        label,
        reply: label.toLowerCase().includes("agendar") ? "AGENDAR" : "MAIS",
      }));
  const showButtonsBubble = resolvedButtonEntries.length > 0;
  const showTextBubble = Boolean(previewMessage.trim()) && !hasImage && !showButtonsBubble;
  const buttonsPrompt = hasImage
    ? 'Como podemos ajudar?'
    : previewMessage.trim() || 'Como podemos ajudar?';

  // Converte markdown básico para formatação visual
  const formatMessage = (text: string) => {
    return text
      .split('\n')
      .map((line, i) => {
        // Bold com asteriscos
        const formatted = line.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
        return (
          <span key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      })
      .reduce((acc: React.ReactNode[], curr, i, arr) => {
        acc.push(curr);
        if (i < arr.length - 1) acc.push(<br key={`br-${i}`} />);
        return acc;
      }, []);
  };

  return (
    <div className={previewStyles.wrap}>
      <div className={previewStyles.phone}>
        <div className={previewStyles.notch} />
        <div className={previewStyles.screen}>
          <div className={previewStyles.statusBar}>
            <span>{nowLabel}</span>
            <span>WhatsApp</span>
          </div>

          <div className={previewStyles.header}>
            <div className={previewStyles.avatar}>{initials}</div>
            <div className={previewStyles.headerText}>
              <p className={previewStyles.contactName}>{contactName}</p>
              <p className={previewStyles.contactStatus}>online</p>
            </div>
          </div>

          <div className={previewStyles.chat}>
            <div className={previewStyles.messages}>
              {hasImage ? (
                <div className={previewStyles.mediaBubble}>
                  <div className={previewStyles.bubbleTail} />
                  <div className={previewStyles.mediaImageWrap}>
                    <img
                      src={imageUrl}
                      alt="Banner promocional"
                      className={previewStyles.mediaImage}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  {previewMessage.trim() ? (
                    <div className={previewStyles.mediaCaption}>{formatMessage(previewMessage)}</div>
                  ) : null}
                  <div className={previewStyles.meta}>
                    <span className={previewStyles.time}>{nowLabel}</span>
                    <svg className={previewStyles.checks} viewBox="0 0 16 11" fill="currentColor" aria-hidden>
                      <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.47.47 0 0 0-.323.136l-.883.882a.479.479 0 0 0-.141.34.474.474 0 0 0 .141.34l3.56 3.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                      <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.883.882 2.56 2.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                    </svg>
                  </div>
                </div>
              ) : showTextBubble ? (
                <div className={previewStyles.bubble}>
                  <div className={previewStyles.bubbleTail} />
                  <div className={previewStyles.bubbleBody}>{formatMessage(previewMessage)}</div>
                  <div className={previewStyles.meta}>
                    <span className={previewStyles.time}>{nowLabel}</span>
                    <svg className={previewStyles.checks} viewBox="0 0 16 11" fill="currentColor" aria-hidden>
                      <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.47.47 0 0 0-.323.136l-.883.882a.479.479 0 0 0-.141.34.474.474 0 0 0 .141.34l3.56 3.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                      <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.883.882 2.56 2.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                    </svg>
                  </div>
                </div>
              ) : null}

              {showButtonsBubble ? (
                <div className={previewStyles.buttonsBubble}>
                  <div className={previewStyles.bubbleTail} />
                  <div className={previewStyles.buttonsPrompt}>{formatMessage(buttonsPrompt)}</div>
                  {resolvedButtonEntries.map((entry) => (
                    <div key={`${entry.label}-${entry.reply}`} className={previewStyles.buttonRow}>
                      <span className={previewStyles.buttonHint}>
                        👉 {entry.label}: responda {entry.reply}
                      </span>
                    </div>
                  ))}
                  <div className={previewStyles.meta}>
                    <span className={previewStyles.time}>{nowLabel}</span>
                    <svg className={previewStyles.checks} viewBox="0 0 16 11" fill="currentColor" aria-hidden>
                      <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.47.47 0 0 0-.323.136l-.883.882a.479.479 0 0 0-.141.34.474.474 0 0 0 .141.34l3.56 3.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                      <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.883.882 2.56 2.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                    </svg>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={previewStyles.inputBar}>
            <div className={previewStyles.inputFake} />
            <div className={previewStyles.mic} />
          </div>
        </div>
      </div>
      <p className={previewStyles.caption}>Prévia em tempo real</p>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PreventiveTemplateSettings: React.FC<PreventiveTemplateSettingsProps> = ({
  initialData,
  data: controlledData,
  onDataChange,
  variant = "standalone",
  activeSection = "all",
  showInlinePreview = true,
  showFooter = true,
  showModelSelector = true,
  onSave,
  onRestoreDefault,
  onUploadBanner,
  onRemoveBanner,
  isLoading = false,
  showBelowMessagePreview = false,
  previewContactName = "Sua empresa",
}) => {
  const [models, setModels] = useState<PreventiveMessageModel[]>(
    initialData?.models?.length ? initialData.models : DEFAULT_MODELS,
  );
  const [activeModelId, setActiveModelId] = useState(
    initialData?.activeModelId || initialData?.models?.[0]?.id || "returning",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const isControlled = controlledData != null && onDataChange != null;
  const draft = isControlled
    ? controlledData
    : { models, activeModelId };

  const activeModel =
    draft.models.find((m) => m.id === draft.activeModelId) ?? draft.models[0];
  const activeMessageBody = activeModel?.body ?? "";
  const bannerPreviewUrl = activeModel ? preventiveModelBannerPreviewUrl(activeModel) : "";
  const sendImage = activeModel?.attachment.promo_image_enabled ?? false;

  const previewButtonEntries = React.useMemo(() => {
    const auto = activeModel?.automation;
    if (!auto?.action_buttons_enabled) return [];
    const entries: { label: string; reply: string }[] = [];
    if (auto.button_schedule_enabled && auto.auto_schedule_enabled) {
      entries.push({
        label: auto.button_schedule_text || "Agendar agora",
        reply: "AGENDAR",
      });
    }
    if (auto.button_custom_enabled) {
      entries.push({
        label: auto.button_more_text || "Sim, quero saber mais",
        reply: "MAIS",
      });
    }
    return entries;
  }, [activeModel]);

  const patchDraft = useCallback(
    (patch: Partial<TemplateData>) => {
      const next = { ...draft, ...patch };
      if (isControlled) {
        onDataChange!(next);
      } else {
        if (patch.models !== undefined) setModels(patch.models);
        if (patch.activeModelId !== undefined) setActiveModelId(patch.activeModelId);
      }
    },
    [draft, isControlled, onDataChange],
  );

  const patchActiveModel = useCallback(
    (patch: Partial<PreventiveMessageModel>) => {
      if (!activeModel) return;
      patchDraft({
        models: updateModelInList(draft.models, activeModel.id, patch),
      });
    },
    [activeModel, draft.models, patchDraft],
  );

  const handleAddModel = useCallback(() => {
    if (draft.models.length >= MAX_PREVENTIVE_MESSAGE_MODELS) return;
    const nextModel = createEmptyPreventiveModel(draft.models, null);
    patchDraft({ models: [...draft.models, nextModel], activeModelId: nextModel.id });
  }, [draft.models, patchDraft]);

  const handleRemoveModel = useCallback(() => {
    if (draft.models.length <= 1 || !activeModel) return;
    const nextModels = draft.models.filter((m) => m.id !== activeModel.id);
    patchDraft({ models: nextModels, activeModelId: nextModels[0]?.id ?? "returning" });
  }, [activeModel, draft.models, patchDraft]);

  useEffect(() => {
    if (isControlled || !initialData) return;
    setModels(initialData.models?.length ? initialData.models : DEFAULT_MODELS);
    setActiveModelId(initialData.activeModelId || initialData.models?.[0]?.id || "returning");
  }, [
    initialData?.models,
    initialData?.activeModelId,
    isControlled,
  ]);

  const handleTagCopy = useCallback((tag: string) => {
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, draft]);

  const handleRestoreDefault = useCallback(() => {
    if (!activeModel) return;
    const defaultBody =
      activeModel.id === "first" ? DEFAULT_MESSAGE_FIRST : DEFAULT_MESSAGE_RETURNING;
    patchActiveModel({ body: defaultBody });
    if (activeModel.id === "returning") {
      patchDraft({
        models: patchModelAttachment(draft.models, activeModel.id, {
          promo_image_enabled: false,
          has_banner: false,
          promo_image_url: null,
        }),
      });
    }
    onRestoreDefault?.();
  }, [activeModel, onRestoreDefault, patchActiveModel, patchDraft]);

  const handleBannerUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !onUploadBanner) return;
      setIsUploading(true);
      try {
        const url = await onUploadBanner(file);
        patchDraft({
          models: patchModelAttachment(draft.models, draft.activeModelId, {
            promo_image_enabled: true,
            has_banner: true,
            promo_image_url: url || null,
          }),
        });
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadBanner, patchDraft],
  );

  const handleRemoveBanner = useCallback(async () => {
    if (!onRemoveBanner) {
      patchDraft({
        models: patchModelAttachment(draft.models, draft.activeModelId, {
          promo_image_enabled: false,
          has_banner: false,
          promo_image_url: null,
        }),
      });
      return;
    }
    setIsUploading(true);
    try {
      await onRemoveBanner();
      patchDraft({
        models: patchModelAttachment(draft.models, draft.activeModelId, {
          promo_image_enabled: false,
          has_banner: false,
          promo_image_url: null,
        }),
      });
    } finally {
      setIsUploading(false);
    }
  }, [onRemoveBanner, patchDraft]);

  const loading = isLoading || isSaving || isUploading;
  const showTemplate = activeSection === "all" || activeSection === "template";
  const showAttachments = activeSection === "all" || activeSection === "attachments";
  const embedded = variant === "embedded";

  const body = (
    <div className={embedded ? "space-y-6" : "p-6"}>
      <div
        className={
          showInlinePreview && !embedded
            ? "grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start"
            : "space-y-6"
        }
      >
        <div className="space-y-6">
          {showTemplate ? (
            <>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-3">
                  Variaveis dinamicas
                </label>
                <div className="flex flex-wrap gap-2">
                  {DYNAMIC_TAGS.map((tag) => (
                    <TagBadge key={tag.tag} tag={tag} onCopy={handleTagCopy} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Clique em uma tag para copiar. O sistema substitui automaticamente pelos dados reais do cliente.
                </p>
                {copiedTag ? (
                  <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Tag {copiedTag} copiada!
                  </p>
                ) : null}
              </div>

              {showModelSelector ? (
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2">
                    Modelos de mensagem ({draft.models.length}/{MAX_PREVENTIVE_MESSAGE_MODELS})
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {draft.models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        disabled={loading}
                        onClick={() => patchDraft({ activeModelId: model.id })}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          draft.activeModelId === model.id
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                        }`}
                      >
                        {model.name}
                      </button>
                    ))}
                    {draft.models.length < MAX_PREVENTIVE_MESSAGE_MODELS ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleAddModel}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-dashed border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                      >
                        + Novo modelo
                      </button>
                    ) : null}
                  </div>
                  <label className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2">
                    Nome do modelo ativo
                  </label>
                  <input
                    type="text"
                    value={activeModel?.name ?? ""}
                    maxLength={80}
                    disabled={loading}
                    onChange={(e) => patchActiveModel({ name: e.target.value })}
                    className="w-full mb-3 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                  />
                  {draft.models.length > 1 ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleRemoveModel}
                      className="mb-3 text-sm text-red-600 hover:underline"
                    >
                      Remover modelo &quot;{activeModel?.name}&quot;
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="messageBody"
                  className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2"
                >
                  Corpo da mensagem
                </label>
                <textarea
                  id="messageBody"
                  value={activeMessageBody}
                  onChange={(e) => patchActiveModel({ body: e.target.value })}
                  placeholder="Ola, {cliente}! Notamos que faz {intervalo} desde a ultima higienizacao..."
                  rows={embedded ? 10 : 12}
                  className="w-full px-4 py-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]
                  text-[hsl(var(--foreground))] text-sm leading-relaxed
                  placeholder:text-[hsl(var(--muted-foreground))]
                  focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent
                  resize-none font-mono"
                  disabled={loading}
                />
                <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                  Use *texto* para negrito. Emojis sao suportados.
                </p>
                {showBelowMessagePreview ? (
                  <div className="mt-5 pt-5 border-t border-[hsl(var(--border))]">
                    <PreventiveWhatsAppPreview
                      message={activeMessageBody}
                      imageUrl={sendImage ? bannerPreviewUrl : ""}
                      buttonEntries={previewButtonEntries}
                      contactName={previewContactName}
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {showAttachments ? (
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2">
                Banner promocional (opcional)
              </label>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-medium cursor-pointer hover:bg-[hsl(var(--muted))]">
                    <ImagePlusIcon className="w-4 h-4" />
                    {isUploading ? "Enviando…" : "Escolher imagem"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={loading || !onUploadBanner}
                      onChange={(e) => void handleBannerUpload(e)}
                    />
                  </label>
                  {bannerPreviewUrl ? (
                    <span className="text-xs text-green-700 font-medium">Banner salvo</span>
                  ) : null}
                </div>
                {bannerPreviewUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={bannerPreviewUrl}
                      alt="Banner preventiva"
                      className="h-16 w-auto rounded border border-[hsl(var(--border))] object-cover"
                    />
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      disabled={loading}
                      onClick={() => void handleRemoveBanner()}
                    >
                      Remover banner
                    </button>
                  </div>
                ) : null}
                <label className="inline-flex items-center gap-2 text-sm text-[hsl(var(--card-foreground))]">
                  <input
                    type="checkbox"
                    checked={sendImage}
                    disabled={loading || !bannerPreviewUrl}
                    onChange={(e) =>
                      patchDraft({
                        models: patchModelAttachment(draft.models, draft.activeModelId, {
                          promo_image_enabled: e.target.checked,
                        }),
                      })
                    }
                  />
                  Enviar banner junto com a mensagem
                </label>
              </div>
              <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                Banner exclusivo deste modelo. Marque a opção acima para anexar nos lembretes que usarem este modelo.
              </p>
            </div>
          ) : null}
        </div>

        {showInlinePreview && !embedded ? (
          <div className="flex flex-col items-center justify-start lg:sticky lg:top-4">
            <div className="bg-[hsl(var(--muted)/0.25)] rounded-lg p-2 flex justify-center">
              <PreventiveWhatsAppPreview
                message={activeMessageBody}
                imageUrl={sendImage ? bannerPreviewUrl : ""}
                buttonEntries={previewButtonEntries}
                contactName={previewContactName}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--primary)/0.1)]">
            <MessageSquareCodeIcon className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
              Configuracao da Mensagem de Alerta (WhatsApp)
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              Defina o padrao do texto. Na hora do envio, a IA reescreve a mensagem dentro desse modelo.
            </p>
          </div>
        </div>
      </div>

      {body}

      {showFooter ? (
        <div className="px-6 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleRestoreDefault}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            border border-[hsl(var(--border))] bg-[hsl(var(--background))]
            text-sm font-medium text-[hsl(var(--foreground))]
            hover:bg-[hsl(var(--muted))] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcwIcon className="w-4 h-4" />
            Restaurar padrao
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg
            bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            text-sm font-medium shadow-sm
            hover:bg-[hsl(var(--primary)/0.9)] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
            {loading ? "Salvando..." : "Salvar template"}
          </button>
        </div>
      ) : null}
    </div>
  );
};

// ============================================================================
// Exports
// ============================================================================

export default PreventiveTemplateSettings;
