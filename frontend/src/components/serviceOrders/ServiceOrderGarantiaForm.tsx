import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Camera,
  ClipboardCheck,
  Gauge,
  PenLine,
  Snowflake,
  Sparkles,
} from "lucide-react";
import { fetchTenantGarantiaSettings, type TenantGarantiaSettings } from "../../api/garantiaSettings";
import type { TenantOut } from "../../api/auth";
import type { Cliente, ServiceOrderData } from "../v0-ui/service-orders/ServiceOrderFormView";
import { resolveGarantiaVigenciaLabel } from "../../lib/garantiaDocument";
import {
  buildGarantiaSerialPatch,
  resolveGarantiaSerial,
  type ServiceOrderGarantiaFields,
} from "../../lib/serviceOrderGarantia";
import { computeGarantiaProgress } from "../../lib/serviceOrderGarantiaProgress";
import { SignaturePad } from "../pmoc/SignaturePad";
import { ServiceOrderGarantiaIdentificacaoPanel } from "./ServiceOrderGarantiaIdentificacaoPanel";
import { ServiceOrderGarantiaCatalogSearch } from "./ServiceOrderGarantiaCatalogSearch";
import { GarantiaVacuoField } from "./GarantiaVacuoField";
import { GarantiaStartupMetricsSection } from "./GarantiaStartupMetricsSection";
import styles from "./ServiceOrderGarantiaForm.module.css";

type Props = {
  formData: ServiceOrderData;
  canEdit: boolean;
  errors: Record<string, string>;
  tenant?: TenantOut | null;
  selectedCliente?: Cliente | null;
  orderId?: number;
  onFieldChange: <K extends keyof ServiceOrderData>(key: K, value: ServiceOrderData[K]) => void;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
  onSaveGarantia?: () => void | Promise<void>;
  onGenerateGarantiaPdf?: () => void | Promise<void>;
  isSavingGarantia?: boolean;
  isGeneratingGarantiaPdf?: boolean;
};

function ProgressRing({ percent }: { percent: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className={styles.progressRing} aria-label={`${percent}% do termo preenchido`}>
      <svg viewBox="0 0 40 40" role="img" aria-hidden>
        <circle className={styles.progressRingTrack} cx="20" cy="20" r={radius} />
        <circle
          className={styles.progressRingValue}
          cx="20"
          cy="20"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={styles.progressRingLabel}>{percent}%</span>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcon} aria-hidden>
        {icon}
      </div>
      <div className={styles.kpiBody}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue} title={value}>
          {value}
        </span>
        {sub ? (
          <span className={styles.kpiSub} title={sub}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GarantiaSection({
  step,
  icon,
  title,
  subtitle,
  children,
}: {
  step: number;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionStep} aria-hidden>
          {step}
        </span>
        <div className={styles.sectionIcon} aria-hidden>
          {icon}
        </div>
        <div className={styles.sectionHeadText}>
          <h3 className={styles.sectionTitle}>{title}</h3>
          {subtitle ? <p className={styles.sectionLead}>{subtitle}</p> : null}
        </div>
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function ServiceOrderGarantiaForm({
  formData,
  canEdit,
  errors,
  tenant,
  selectedCliente,
  orderId,
  onFieldChange,
  onGarantiaChange,
  onSaveGarantia,
  onGenerateGarantiaPdf,
  isSavingGarantia = false,
  isGeneratingGarantiaPdf = false,
}: Props) {
  const g = formData.garantia;
  const progress = useMemo(() => computeGarantiaProgress(g), [g]);
  const [tenantGarantiaSettings, setTenantGarantiaSettings] = useState<TenantGarantiaSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTenantGarantiaSettings()
      .then((row) => {
        if (!cancelled) setTenantGarantiaSettings(row);
      })
      .catch(() => {
        if (!cancelled) setTenantGarantiaSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeGarantia = (patch: Partial<ServiceOrderGarantiaFields>) => {
    if ("serieEvaporadora" in patch || "serieCondensadora" in patch || "numeroSerie" in patch) {
      onGarantiaChange(buildGarantiaSerialPatch(g, patch));
      return;
    }
    onGarantiaChange(patch);
  };

  const handleDataInstalacaoChange = (value: string) => {
    const patch: Partial<ServiceOrderGarantiaFields> = {
      dataInstalacao: value,
      assinaturaData: g.assinaturaData.trim() || value,
    };
    if (value && !g.assinaturaLocal.trim() && tenant?.address_city) {
      patch.assinaturaLocal = tenant.address_city.trim();
    }
    onGarantiaChange(patch);
  };

  const serial = resolveGarantiaSerial(g);
  const equipmentSummary = g.marcaModelo.trim() || g.catalogLabel?.trim() || "Aguardando identificação";
  const vigencia = resolveGarantiaVigenciaLabel(g, tenantGarantiaSettings);

  return (
    <div className={styles.page}>
      <header className={styles.docHeader}>
        <div className={styles.docHeaderMain}>
          <span className={styles.docBadge}>Ordem de instalação</span>
          <h2 className={styles.docTitle}>Termo de Garantia de Serviço</h2>
          <p className={styles.docLead}>
            Registre equipamento, medições de startup e assinatura. Os dados da empresa, do cliente e os textos legais
            vêm das configurações e do cadastro — entram automaticamente no PDF do termo.
          </p>
        </div>
        <div className={styles.docHeaderAside}>
          <ProgressRing percent={progress.percent} />
          <div className={styles.docHeaderActions}>
            {onGenerateGarantiaPdf ? (
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={isGeneratingGarantiaPdf || isSavingGarantia}
                onClick={() => void onGenerateGarantiaPdf()}
              >
                {isGeneratingGarantiaPdf ? "Gerando PDF…" : "Gerar Termo (PDF)"}
              </button>
            ) : null}
            {onSaveGarantia && canEdit ? (
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={isSavingGarantia || isGeneratingGarantiaPdf}
                onClick={() => void onSaveGarantia()}
              >
                {isSavingGarantia ? "Salvando…" : "Salvar termo"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.kpiStrip}>
        <KpiCard
          icon={<Snowflake size={18} strokeWidth={2.2} />}
          label="Equipamento"
          value={equipmentSummary}
          sub={serial ? `Série ${serial}` : g.capacidade || "Identifique pela etiqueta"}
        />
        <KpiCard
          icon={<CalendarClock size={18} strokeWidth={2.2} />}
          label="Vigência"
          value={vigencia.summary}
          sub={vigencia.sub}
        />
        <KpiCard
          icon={<ClipboardCheck size={18} strokeWidth={2.2} />}
          label="Completude"
          value={`${progress.filled} de ${progress.total}`}
          sub={
            progress.missingLabels.length
              ? `Pendente: ${progress.missingLabels.slice(0, 2).join(", ")}${progress.missingLabels.length > 2 ? "…" : ""}`
              : "Pronto para assinatura"
          }
        />
      </div>

      {progress.missingLabels.length > 0 && canEdit ? (
        <ul className={styles.missingList} aria-label="Campos pendentes">
          {progress.missingLabels.map((label) => (
            <li key={label} className={styles.missingChip}>
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.sections}>
        <GarantiaSection
          step={1}
          icon={<Camera size={17} strokeWidth={2.2} />}
          title="Identificação do equipamento"
          subtitle="Leitura da etiqueta, catálogo e registro técnico do aparelho instalado"
        >
          {canEdit ? (
            <div className={styles.toolCard}>
              <h4 className={styles.toolCardTitle}>
                <Sparkles size={16} strokeWidth={2.2} />
                Leitura inteligente da etiqueta
              </h4>
              <p className={styles.toolCardLead}>
                Fotografe a etiqueta da evaporadora, da condensadora ou de ambas — a IA lê todas as placas e preenche
                modelo, capacidade e números de série.
              </p>
              <ServiceOrderGarantiaIdentificacaoPanel
                garantia={g}
                canEdit={canEdit}
                onGarantiaChange={changeGarantia}
              />
            </div>
          ) : null}

          {canEdit ? (
            <ServiceOrderGarantiaCatalogSearch
              garantia={g}
              canEdit={canEdit}
              onGarantiaChange={onGarantiaChange}
            />
          ) : null}

          <h4 className={styles.subsectionTitleSpaced}>Dados do aparelho</h4>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Nome / local do aparelho</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.equipmentTag}
                placeholder="Ex.: Sala de reunião"
                onChange={(e) => onGarantiaChange({ equipmentTag: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Tipo de aparelho</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.tipoAparelho}
                placeholder="Ex.: Split Hi-Wall"
                onChange={(e) => onGarantiaChange({ tipoAparelho: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Marca / modelo</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.marcaModelo}
                placeholder="Ex.: Consul CBJ09CBRNA"
                onChange={(e) => onGarantiaChange({ marcaModelo: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Capacidade</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.capacidade}
                placeholder="Ex.: 9.000 BTU"
                onChange={(e) => onGarantiaChange({ capacidade: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Nº série evaporadora</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.serieEvaporadora}
                placeholder="Unidade interna"
                onChange={(e) => changeGarantia({ serieEvaporadora: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Nº série condensadora</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.serieCondensadora}
                placeholder="Unidade externa"
                onChange={(e) => changeGarantia({ serieCondensadora: e.target.value })}
              />
            </label>
            <label className={styles.fieldFull}>
              <span className={styles.label}>Local da instalação no imóvel</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.localInstalacao}
                placeholder="Ambiente ou referência interna"
                onChange={(e) => onGarantiaChange({ localInstalacao: e.target.value })}
              />
            </label>
          </div>
        </GarantiaSection>

        <GarantiaSection
          step={2}
          icon={<Gauge size={17} strokeWidth={2.2} />}
          title="Startup técnico"
          subtitle="Medições registradas na entrega — comprovação de funcionamento"
        >
          <GarantiaVacuoField
            orderId={orderId}
            garantia={g}
            canEdit={canEdit}
            onGarantiaChange={onGarantiaChange}
          />
          <GarantiaStartupMetricsSection
            orderId={orderId}
            garantia={g}
            canEdit={canEdit}
            onGarantiaChange={onGarantiaChange}
          />
        </GarantiaSection>

        <GarantiaSection
          step={3}
          icon={<PenLine size={17} strokeWidth={2.2} />}
          title="Encerramento e assinaturas"
          subtitle="Data da instalação, responsável técnico e aceite do cliente"
        >
          <div className={styles.metricsGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Data da instalação</span>
              <input
                className={styles.input}
                type="date"
                disabled={!canEdit}
                value={g.dataInstalacao}
                onChange={(e) => handleDataInstalacaoChange(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Local</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.assinaturaLocal}
                placeholder="Cidade da instalação"
                onChange={(e) => onGarantiaChange({ assinaturaLocal: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Data do termo</span>
              <input
                className={styles.input}
                type="date"
                disabled={!canEdit}
                value={g.assinaturaData}
                onChange={(e) => onGarantiaChange({ assinaturaData: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Técnico / instalador</span>
              <input
                className={styles.input}
                disabled={!canEdit}
                value={g.tecnicoResponsavelNome}
                placeholder="Nome do responsável técnico"
                onChange={(e) => onGarantiaChange({ tecnicoResponsavelNome: e.target.value })}
              />
            </label>
          </div>

          <label className={`${styles.field} ${styles.fieldFull}`} style={{ marginTop: "0.85rem" }}>
            <span className={styles.label}>Observações do técnico</span>
            <textarea
              className={styles.textarea}
              rows={3}
              disabled={!canEdit}
              value={g.observacoes}
              placeholder="Registros adicionais sobre a instalação e entrega ao cliente"
              onChange={(e) => onGarantiaChange({ observacoes: e.target.value })}
            />
          </label>

          <h4 className={styles.subsectionTitleSpaced}>Assinatura do cliente</h4>
          <p className={styles.signatureLead}>
            Peça ao cliente para assinar com o dedo na área abaixo (celular ou tablet). A assinatura fica registrada no
            termo de garantia.
          </p>
          <label className={styles.field}>
            <span className={styles.label}>Nome do signatário</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={formData.clientSignatureName ?? ""}
              onChange={(e) => onFieldChange("clientSignatureName", e.target.value)}
              placeholder={selectedCliente?.nome?.trim() || "Nome completo do cliente"}
            />
          </label>
          {errors.clientSignatureName ? <p className={styles.error}>{errors.clientSignatureName}</p> : null}
          <div className={styles.signatureWrap}>
            <SignaturePad
              value={formData.clientSignatureBase64}
              disabled={!canEdit}
              onChange={(dataUrl) => {
                onFieldChange("clientSignatureBase64", dataUrl);
                if (dataUrl && !formData.clientSignatureAt) {
                  onFieldChange("clientSignatureAt", new Date().toISOString());
                }
                if (!dataUrl) {
                  onFieldChange("clientSignatureAt", null);
                }
              }}
            />
          </div>
          {formData.clientSignatureAt ? (
            <p className={styles.signatureMeta}>
              Assinado em {new Date(formData.clientSignatureAt).toLocaleString("pt-BR")}
            </p>
          ) : null}
          {errors.clientSignature ? <p className={styles.error}>{errors.clientSignature}</p> : null}
        </GarantiaSection>
      </div>
    </div>
  );
}
