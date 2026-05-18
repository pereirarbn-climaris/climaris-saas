/**
 * PreventiveTemplateSettings.tsx
 * 
 * Painel de configuração de mensagens WhatsApp para alertas de manutenção preventiva.
 * Inclui preview ao vivo em formato de smartphone e tags dinâmicas clicáveis.
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface TemplateData {
  messageBody: string;
  imageUrl: string;
}

export interface DynamicTag {
  tag: string;
  label: string;
  description: string;
}

export interface PreventiveTemplateSettingsProps {
  /** Dados iniciais do template */
  initialData?: TemplateData;
  /** Callback ao salvar */
  onSave?: (data: TemplateData) => Promise<void>;
  /** Callback ao restaurar padrão */
  onRestoreDefault?: () => void;
  /** Estado de loading externo */
  isLoading?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MESSAGE = `Olá, {cliente}! 👋

Notamos que faz *{intervalo}* desde a última manutenção do seu *{equipamento}* ({marca_modelo}).

A limpeza regular é essencial para:
✅ Garantir a eficiência energética
✅ Melhorar a qualidade do ar
✅ Prolongar a vida útil do aparelho

📞 Entre em contato conosco para agendar sua manutenção preventiva!`;

const DYNAMIC_TAGS: DynamicTag[] = [
  { tag: '{cliente}', label: 'Cliente', description: 'Nome do cliente' },
  { tag: '{equipamento}', label: 'Equipamento', description: 'Nome/tag do equipamento' },
  { tag: '{marca_modelo}', label: 'Marca/Modelo', description: 'Marca e modelo do aparelho' },
  { tag: '{intervalo}', label: 'Intervalo', description: 'Tempo desde última manutenção' },
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
  imageUrl: string;
}

const WhatsAppPreview: React.FC<WhatsAppPreviewProps> = ({ message, imageUrl }) => {
  // Substitui as tags por valores de exemplo para o preview
  const previewMessage = message
    .replace(/{cliente}/g, 'João Silva')
    .replace(/{equipamento}/g, 'Split Sala de Estar')
    .replace(/{marca_modelo}/g, 'Carrier 12000 BTUs')
    .replace(/{intervalo}/g, '6 meses');

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
    <div className="flex flex-col items-center">
      {/* Smartphone Frame */}
      <div className="relative w-[280px] h-[560px] bg-slate-900 rounded-[40px] p-2 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-10" />
        
        {/* Screen */}
        <div className="w-full h-full bg-[#e5ddd5] rounded-[32px] overflow-hidden flex flex-col">
          {/* WhatsApp Header */}
          <div className="bg-[#075e54] px-3 py-2 flex items-center gap-3 pt-8">
            <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center">
              <span className="text-xs font-semibold text-slate-600">AC</span>
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">Ar Condicionado Pro</p>
              <p className="text-green-200 text-xs">online</p>
            </div>
          </div>

          {/* Chat Background Pattern */}
          <div 
            className="flex-1 p-3 overflow-y-auto"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c5baaf' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {/* Message Bubble */}
            <div className="max-w-[90%] ml-auto">
              {/* Image Preview */}
              {imageUrl && (
                <div className="mb-1 rounded-lg overflow-hidden bg-white shadow-sm">
                  <img 
                    src={imageUrl} 
                    alt="Banner promocional"
                    className="w-full h-auto max-h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {/* Text Bubble */}
              <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-2.5 shadow-sm relative">
                <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                  {formatMessage(previewMessage)}
                </p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-slate-500">14:32</span>
                  {/* Double check mark */}
                  <svg className="w-4 h-3 text-[#53bdeb]" viewBox="0 0 16 11" fill="currentColor">
                    <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.47.47 0 0 0-.323.136l-.883.882a.479.479 0 0 0-.141.34.474.474 0 0 0 .141.34l3.56 3.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                    <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.883.882 2.56 2.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                  </svg>
                </div>
                {/* Bubble tail */}
                <div className="absolute top-0 -right-2 w-4 h-4 overflow-hidden">
                  <div className="absolute top-0 left-0 w-4 h-4 bg-[#dcf8c6] transform rotate-45 translate-x-[-50%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Input Bar */}
          <div className="bg-[#f0f0f0] px-2 py-2 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-4 py-2 text-xs text-slate-400">
              Mensagem
            </div>
            <div className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14.95q-.2 0-.375-.063a.877.877 0 0 1-.325-.212L6.675 10.05a.894.894 0 0 1-.263-.663.93.93 0 0 1 .288-.662.948.948 0 0 1 .675-.275q.4 0 .675.275L12 12.675l3.95-3.95a.894.894 0 0 1 .663-.263.93.93 0 0 1 .662.288.948.948 0 0 1 .275.675q0 .4-.275.675l-4.625 4.625a.877.877 0 0 1-.325.212.987.987 0 0 1-.375.063z" transform="rotate(-90 12 12)" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))] text-center">
        Preview em tempo real da mensagem
      </p>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PreventiveTemplateSettings: React.FC<PreventiveTemplateSettingsProps> = ({
  initialData,
  onSave,
  onRestoreDefault,
  isLoading = false,
}) => {
  const [messageBody, setMessageBody] = useState(initialData?.messageBody || DEFAULT_MESSAGE);
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const handleTagCopy = useCallback((tag: string) => {
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave({ messageBody, imageUrl });
    } finally {
      setIsSaving(false);
    }
  }, [onSave, messageBody, imageUrl]);

  const handleRestoreDefault = useCallback(() => {
    setMessageBody(DEFAULT_MESSAGE);
    setImageUrl('');
    onRestoreDefault?.();
  }, [onRestoreDefault]);

  const loading = isLoading || isSaving;

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
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
              Defina o texto padrao e a imagem que o sistema usara para notificar os clientes sobre manutencoes preventivas vencidas.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Column */}
          <div className="space-y-6">
            {/* Dynamic Tags */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-3">
                Variaveis Dinamicas
              </label>
              <div className="flex flex-wrap gap-2">
                {DYNAMIC_TAGS.map((tag) => (
                  <TagBadge key={tag.tag} tag={tag} onCopy={handleTagCopy} />
                ))}
              </div>
              <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                Clique em uma tag acima para copiar ou use-a no texto para que o sistema substitua automaticamente pelos dados reais.
              </p>
              {copiedTag && (
                <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Tag {copiedTag} copiada!
                </p>
              )}
            </div>

            {/* Message Body */}
            <div>
              <label 
                htmlFor="messageBody"
                className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2"
              >
                Corpo da Mensagem
              </label>
              <textarea
                id="messageBody"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Ola, {cliente}! Notamos que faz {intervalo} desde a ultima higienizacao do seu {equipamento}..."
                rows={12}
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
            </div>

            {/* Image URL */}
            <div>
              <label 
                htmlFor="imageUrl"
                className="block text-sm font-medium text-[hsl(var(--card-foreground))] mb-2"
              >
                URL da Imagem/Banner (Opcional)
              </label>
              <div className="relative">
                <ImagePlusIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="url"
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/banner-promocional.jpg"
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]
                    text-[hsl(var(--foreground))] text-sm
                    placeholder:text-[hsl(var(--muted-foreground))]
                    focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                Adicione um banner promocional ou imagem institucional para enviar junto com a mensagem.
              </p>
            </div>
          </div>

          {/* Preview Column */}
          <div className="flex flex-col items-center justify-start lg:sticky lg:top-6">
            <div className="bg-[hsl(var(--muted)/0.3)] rounded-2xl p-6 w-full flex justify-center">
              <WhatsAppPreview message={messageBody} imageUrl={imageUrl} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
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
          Restaurar Padrao
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg
            bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            text-sm font-medium shadow-sm
            hover:bg-[hsl(var(--primary)/0.9)] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <SpinnerIcon className="w-4 h-4 animate-spin" />
          ) : (
            <SaveIcon className="w-4 h-4" />
          )}
          {loading ? 'Salvando...' : 'Salvar Template'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Exports
// ============================================================================

export default PreventiveTemplateSettings;
