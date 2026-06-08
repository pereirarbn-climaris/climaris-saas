import type { ChecklistItem, ServiceOrderData } from "../v0-ui/service-orders/ServiceOrderFormView";
import { ServiceOrderChecklist } from "./ServiceOrderChecklist";
import { LaudoPhotoEvidence } from "./LaudoPhotoEvidence";
import { SignaturePad } from "../pmoc/SignaturePad";
import styles from "./ServiceOrderLaudoForm.module.css";

type Props = {
  formData: ServiceOrderData;
  canEdit: boolean;
  errors: Record<string, string>;
  selectedClienteNome?: string;
  onFieldChange: <K extends keyof ServiceOrderData>(key: K, value: ServiceOrderData[K]) => void;
  onChecklistChange: (items: ChecklistItem[]) => void;
  onSaveLaudo?: () => void | Promise<void>;
  onGenerateLaudoPdf?: () => void | Promise<void>;
  isSavingLaudo?: boolean;
  isGeneratingLaudoPdf?: boolean;
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

function numValue(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? String(value) : "";
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function ServiceOrderLaudoForm({
  formData,
  canEdit,
  errors,
  selectedClienteNome,
  onFieldChange,
  onChecklistChange,
  onSaveLaudo,
  onGenerateLaudoPdf,
  isSavingLaudo = false,
  isGeneratingLaudoPdf = false,
  showSignature = false,
}: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        {onGenerateLaudoPdf ? (
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={isGeneratingLaudoPdf || isSavingLaudo}
            onClick={() => void onGenerateLaudoPdf()}
          >
            {isGeneratingLaudoPdf ? "Gerando PDF…" : "Gerar Laudo Técnico (PDF)"}
          </button>
        ) : null}
        {onSaveLaudo && canEdit ? (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={isSavingLaudo || isGeneratingLaudoPdf}
            onClick={() => void onSaveLaudo()}
          >
            {isSavingLaudo ? "Salvando laudo…" : "Salvar laudo"}
          </button>
        ) : null}
      </div>

      <SectionBlock title="Identificação" subtitle="Objeto do laudo e contexto do serviço">
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Cliente</span>
            <input className={styles.input} value={selectedClienteNome ?? "—"} readOnly disabled />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Objeto do laudo</span>
            <textarea
              className={styles.textarea}
              rows={3}
              disabled={!canEdit}
              value={formData.objetoLaudo ?? ""}
              placeholder="Ex.: Manutenção preventiva em split hi-wall 12.000 BTUs — ambiente sala"
              onChange={(e) => onFieldChange("objetoLaudo", e.target.value)}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Descrição / solicitação</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={formData.descricaoProblema}
              placeholder="Relato do cliente ou escopo solicitado"
              onChange={(e) => onFieldChange("descricaoProblema", e.target.value)}
            />
          </label>
        </div>
      </SectionBlock>

      <SectionBlock title="Dados técnicos (pressão / elétrica)" subtitle="Medições registradas em campo">
        <div className={styles.metricsGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Pressão de sucção (PSI)</span>
            <input
              className={styles.input}
              type="number"
              step="0.1"
              min="0"
              disabled={!canEdit}
              value={numValue(formData.pressaoSuccao)}
              onChange={(e) => onFieldChange("pressaoSuccao", parseOptionalNumber(e.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Pressão de descarga (PSI)</span>
            <input
              className={styles.input}
              type="number"
              step="0.1"
              min="0"
              disabled={!canEdit}
              value={numValue(formData.pressaoDescarga)}
              onChange={(e) => onFieldChange("pressaoDescarga", parseOptionalNumber(e.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Tensão (V)</span>
            <input
              className={styles.input}
              type="number"
              step="0.1"
              min="0"
              disabled={!canEdit}
              value={numValue(formData.tensaoV)}
              onChange={(e) => onFieldChange("tensaoV", parseOptionalNumber(e.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Corrente (A)</span>
            <input
              className={styles.input}
              type="number"
              step="0.01"
              min="0"
              disabled={!canEdit}
              value={numValue(formData.correnteA)}
              onChange={(e) => onFieldChange("correnteA", parseOptionalNumber(e.target.value))}
            />
          </label>
        </div>
      </SectionBlock>

      <SectionBlock title="Diagnóstico e parecer" subtitle="Metodologia, diagnóstico, conclusão e plano de ação">
        <div className={styles.fieldGrid}>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Metodologia</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={formData.metodologia ?? ""}
              placeholder="Procedimentos, normas e instrumentos utilizados"
              onChange={(e) => onFieldChange("metodologia", e.target.value)}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Diagnóstico</span>
            <textarea
              className={styles.textarea}
              rows={5}
              disabled={!canEdit}
              value={formData.diagnosticoTecnico}
              placeholder="Achados técnicos e análise do equipamento"
              onChange={(e) => onFieldChange("diagnosticoTecnico", e.target.value)}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Conclusão</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={formData.conclusao ?? ""}
              placeholder="Situação final do equipamento após o serviço"
              onChange={(e) => onFieldChange("conclusao", e.target.value)}
            />
          </label>
          <label className={styles.fieldFull}>
            <span className={styles.label}>Plano de ação</span>
            <textarea
              className={styles.textarea}
              rows={4}
              disabled={!canEdit}
              value={formData.planoAcao ?? ""}
              placeholder="Recomendações, correções pendentes ou retorno programado"
              onChange={(e) => onFieldChange("planoAcao", e.target.value)}
            />
          </label>
        </div>
      </SectionBlock>

      <SectionBlock title="Checklist de verificação" subtitle="Itens inspecionados durante a execução">
        <ServiceOrderChecklist
          items={formData.checklist}
          onChange={onChecklistChange}
          error={errors.checklist}
          disabled={!canEdit}
        />
      </SectionBlock>

      <SectionBlock title="Evidências fotográficas" subtitle="Registros visuais com legenda opcional">
        <LaudoPhotoEvidence
          photos={formData.laudoFotos ?? []}
          onChange={(laudoFotos) => onFieldChange("laudoFotos", laudoFotos)}
          disabled={!canEdit}
        />
      </SectionBlock>

      {showSignature ? (
        <SectionBlock title="Assinatura do cliente" subtitle="Confirmação de recebimento do serviço">
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
