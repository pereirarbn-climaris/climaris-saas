import type { ServiceOrderData } from "../v0-ui/service-orders/ServiceOrderFormView";
import {
  addMonthsToDateString,
  type ServiceOrderGarantiaFields,
} from "../../lib/serviceOrderGarantia";
import { LaudoPhotoEvidence } from "./LaudoPhotoEvidence";
import { SignaturePad } from "../pmoc/SignaturePad";
import { ServiceOrderGarantiaIdentificacaoPanel } from "./ServiceOrderGarantiaIdentificacaoPanel";
import styles from "./ServiceOrderLaudoForm.module.css";

type Props = {
  formData: ServiceOrderData;
  canEdit: boolean;
  errors: Record<string, string>;
  selectedClienteNome?: string;
  onFieldChange: <K extends keyof ServiceOrderData>(key: K, value: ServiceOrderData[K]) => void;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
  onSaveGarantia?: () => void | Promise<void>;
  isSavingGarantia?: boolean;
  showSignature?: boolean;
};

function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {subtitle ? <p className={styles.sectionLead}>{subtitle}</p> : null}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function ServiceOrderGarantiaForm({
  formData,
  canEdit,
  errors,
  selectedClienteNome,
  onFieldChange,
  onGarantiaChange,
  onSaveGarantia,
  isSavingGarantia = false,
  showSignature = false,
}: Props) {
  const g = formData.garantia;

  const handleMesesChange = (raw: string) => {
    const months = raw.trim() ? Math.max(1, Number(raw) || 0) : null;
    const patch: Partial<ServiceOrderGarantiaFields> = { mesesGarantia: months };
    if (months && g.dataInstalacao) {
      const validade = addMonthsToDateString(g.dataInstalacao, months);
      if (validade) patch.validadeAte = validade;
    }
    onGarantiaChange(patch);
  };

  const handleDataInstalacaoChange = (value: string) => {
    const patch: Partial<ServiceOrderGarantiaFields> = { dataInstalacao: value };
    if (value && g.mesesGarantia) {
      const validade = addMonthsToDateString(value, g.mesesGarantia);
      if (validade) patch.validadeAte = validade;
    }
    onGarantiaChange(patch);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        {onSaveGarantia && canEdit ? (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={isSavingGarantia}
            onClick={() => void onSaveGarantia()}
          >
            {isSavingGarantia ? "Salvando garantia…" : "Salvar garantia"}
          </button>
        ) : null}
      </div>

      <SectionBlock
        title="Identificação"
        subtitle="Cliente e equipamento instalado"
      >
        {canEdit ? (
          <ServiceOrderGarantiaIdentificacaoPanel
            garantia={g}
            canEdit={canEdit}
            onGarantiaChange={onGarantiaChange}
          />
        ) : null}

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Cliente</span>
            <input className={styles.input} value={selectedClienteNome ?? "—"} readOnly disabled />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Nome / local do aparelho</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={g.equipmentTag}
              placeholder="Ex.: Sala de reunião, Quarto 1"
              onChange={(e) => onGarantiaChange({ equipmentTag: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Número de série</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={g.numeroSerie}
              placeholder="Série do evaporador / condensador"
              onChange={(e) => onGarantiaChange({ numeroSerie: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Marca / modelo</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={g.marcaModelo}
              placeholder="Ex.: Samsung AR12"
              onChange={(e) => onGarantiaChange({ marcaModelo: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Capacidade</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={g.capacidade}
              placeholder="Ex.: 12.000 BTU"
              onChange={(e) => onGarantiaChange({ capacidade: e.target.value })}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Local da instalação</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={g.localInstalacao}
              placeholder="Ambiente, referência ou endereço do aparelho"
              onChange={(e) => onGarantiaChange({ localInstalacao: e.target.value })}
            />
          </label>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Vigência da garantia"
        subtitle="Datas e prazo concedido ao cliente"
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
            <span className={styles.label}>Prazo (meses)</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              step={1}
              disabled={!canEdit}
              value={g.mesesGarantia ?? ""}
              placeholder="Ex.: 12"
              onChange={(e) => handleMesesChange(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Garantia válida até</span>
            <input
              className={styles.input}
              type="date"
              disabled={!canEdit}
              value={g.validadeAte}
              onChange={(e) => onGarantiaChange({ validadeAte: e.target.value })}
            />
          </label>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Termos e cobertura"
        subtitle="O que está coberto e as condições para o cliente"
      >
        <div className={styles.fieldGrid}>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Termos da garantia</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={g.termosGarantia}
              placeholder="Ex.: Garantia de 12 meses para mão de obra e 90 dias para peças instaladas…"
              onChange={(e) => onGarantiaChange({ termosGarantia: e.target.value })}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Serviços cobertos</span>
            <textarea
              className={styles.textarea}
              rows={3}
              disabled={!canEdit}
              value={g.servicosCobertos}
              placeholder="Instalação, startup, vazamentos por mão de obra, etc."
              onChange={(e) => onGarantiaChange({ servicosCobertos: e.target.value })}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Condições e exclusões</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={g.condicoesExclusoes}
              placeholder="Ex.: Não cobre danos por queda de energia, mau uso ou falta de manutenção preventiva…"
              onChange={(e) => onGarantiaChange({ condicoesExclusoes: e.target.value })}
            />
          </label>
          <label className={styles.fieldFull}>
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
        </div>
      </SectionBlock>

      <SectionBlock
        title="Evidências fotográficas"
        subtitle="Placa do aparelho, ambiente e pontos críticos da instalação"
      >
        <LaudoPhotoEvidence
          photos={formData.laudoFotos ?? []}
          onChange={(laudoFotos) => onFieldChange("laudoFotos", laudoFotos)}
          disabled={!canEdit}
        />
      </SectionBlock>

      {showSignature ? (
        <SectionBlock title="Assinatura do cliente" subtitle="Aceite da instalação e termos de garantia">
          <label className={styles.field}>
            <span className={styles.label}>Nome do signatário</span>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={formData.clientSignatureName ?? ""}
              onChange={(e) => onFieldChange("clientSignatureName", e.target.value)}
              placeholder="Nome completo"
            />
          </label>
          {errors.clientSignatureName ? <p className={styles.error}>{errors.clientSignatureName}</p> : null}
          <div className={styles.signatureWrap}>
            <SignaturePad
              onChange={(dataUrl) => {
                onFieldChange("clientSignatureBase64", dataUrl);
                if (dataUrl && !formData.clientSignatureAt) {
                  onFieldChange("clientSignatureAt", new Date().toISOString());
                }
              }}
            />
          </div>
          {errors.clientSignature ? <p className={styles.error}>{errors.clientSignature}</p> : null}
        </SectionBlock>
      ) : null}
    </div>
  );
}
