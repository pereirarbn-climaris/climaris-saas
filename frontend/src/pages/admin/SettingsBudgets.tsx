import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import {
  budgetTemplateSignatureFileUrl,
  deleteBudgetTemplateSignature,
  fetchBudgetTemplatePreviewPdf,
  fetchBudgetTemplateSettings,
  patchBudgetTemplateSettings,
  uploadBudgetTemplateSignature,
} from "../../api/budgetTemplates";
import { getAccessToken } from "../../lib/authStorage";
import { BudgetPreview } from "../../components/budget/BudgetPreview";
import { BudgetTextPresetsField } from "../../components/budget/BudgetTextPresetsField";
import {
  BUDGET_TEMPLATE_OPTIONS,
  DEFAULT_BRAND_COLOR,
  DEFAULT_FONT_COLOR,
  normalizeBrandColor,
  normalizeFontColor,
  sanitizeHexInput,
  type BudgetTemplateKey,
  type BudgetTemplateSettings,
} from "../../lib/budgetPdfGenerator";
import {
  defaultTextFromPresets,
  ensureAtLeastOnePreset,
  normalizePresets,
  type BudgetTextPreset,
} from "../../lib/budgetTextPresets";
import type { DashboardOutletContext } from "../dashboardContext";
import { getTenantDisplayName } from "../../lib/tenantDisplay";
import { Button } from "../../components/ui/button";
import { toast } from "../../lib/toast";
import styles from "./SettingsBudgets.module.css";
import layout from "./ManagementView.module.css";

function serializeBudgetSettings(state: {
  templateKey: BudgetTemplateKey;
  brandColor: string;
  fontColor: string;
  defaultValidityDays: number;
  warrantyPresets: BudgetTextPreset[];
  paymentPresets: BudgetTextPreset[];
  paymentMethodPresets: BudgetTextPreset[];
  scopePresets: BudgetTextPreset[];
  technicalPresets: BudgetTextPreset[];
}): string {
  return JSON.stringify({
    templateKey: state.templateKey,
    brandColor: normalizeBrandColor(state.brandColor),
    fontColor: normalizeFontColor(state.fontColor),
    defaultValidityDays: state.defaultValidityDays,
    warrantyPresets: normalizePresets(state.warrantyPresets),
    paymentPresets: normalizePresets(state.paymentPresets),
    paymentMethodPresets: normalizePresets(state.paymentMethodPresets),
    scopePresets: normalizePresets(state.scopePresets),
    technicalPresets: normalizePresets(state.technicalPresets),
  });
}

function BudgetTemplatesHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h2" />
    </svg>
  );
}

export function SettingsBudgets() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const companyName = ctx?.tenant ? getTenantDisplayName(ctx.tenant) : "Sua empresa";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [baseline, setBaseline] = useState("");

  const [templateKey, setTemplateKey] = useState<BudgetTemplateKey>("classic");
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [fontColor, setFontColor] = useState(DEFAULT_FONT_COLOR);
  const [defaultValidityDays, setDefaultValidityDays] = useState(30);
  const [warrantyPresets, setWarrantyPresets] = useState<BudgetTextPreset[]>([]);
  const [paymentPresets, setPaymentPresets] = useState<BudgetTextPreset[]>([]);
  const [paymentMethodPresets, setPaymentMethodPresets] = useState<BudgetTextPreset[]>([]);
  const [scopePresets, setScopePresets] = useState<BudgetTextPreset[]>([]);
  const [technicalPresets, setTechnicalPresets] = useState<BudgetTextPreset[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureDragOver, setSignatureDragOver] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const warrantyText = useMemo(() => defaultTextFromPresets(warrantyPresets), [warrantyPresets]);
  const paymentText = useMemo(() => defaultTextFromPresets(paymentPresets), [paymentPresets]);
  const paymentMethodText = useMemo(() => defaultTextFromPresets(paymentMethodPresets), [paymentMethodPresets]);
  const scopeText = useMemo(() => defaultTextFromPresets(scopePresets), [scopePresets]);
  const technicalText = useMemo(() => defaultTextFromPresets(technicalPresets), [technicalPresets]);

  const previewDraft = useMemo(
    (): Partial<BudgetTemplateSettings> => ({
      template_key: templateKey,
      brand_color: normalizeBrandColor(brandColor),
      font_color: normalizeFontColor(fontColor),
      default_warranty_terms: warrantyText || null,
      default_payment_terms: paymentText || null,
      default_payment_method: paymentMethodText || null,
      default_scope_text: scopeText || null,
      default_technical_notes: technicalText || null,
      default_validity_days: defaultValidityDays,
      warranty_presets: normalizePresets(warrantyPresets),
      payment_presets: normalizePresets(paymentPresets),
      payment_method_presets: normalizePresets(paymentMethodPresets),
      scope_presets: normalizePresets(scopePresets),
      technical_presets: normalizePresets(technicalPresets),
    }),
    [
      templateKey,
      brandColor,
      fontColor,
      warrantyText,
      paymentText,
      paymentMethodText,
      scopeText,
      technicalText,
      defaultValidityDays,
      warrantyPresets,
      paymentPresets,
      paymentMethodPresets,
      scopePresets,
      technicalPresets,
    ],
  );

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      serializeBudgetSettings({
        templateKey,
        brandColor,
        fontColor,
        defaultValidityDays,
        warrantyPresets,
        paymentPresets,
        paymentMethodPresets,
        scopePresets,
        technicalPresets,
      }) !== baseline
    );
  }, [
    baseline,
    templateKey,
    brandColor,
    fontColor,
    defaultValidityDays,
    warrantyPresets,
    paymentPresets,
    paymentMethodPresets,
    scopePresets,
    technicalPresets,
  ]);

  const previewConfig = useMemo(
    () => ({
      companyName,
      technicalNotes: technicalText,
    }),
    [companyName, technicalText],
  );

  const loadSignaturePreview = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setSignaturePreview(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    try {
      const response = await fetch(budgetTemplateSignatureFileUrl(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setSignaturePreview(null);
        return;
      }
      const blob = await response.blob();
      setSignaturePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setSignaturePreview(null);
    }
  }, []);

  const applySettings = useCallback(
    (data: BudgetTemplateSettings) => {
      const next = {
        templateKey: data.template_key,
        brandColor: normalizeBrandColor(data.brand_color),
        fontColor: normalizeFontColor(data.font_color),
        defaultValidityDays: Math.max(1, data.default_validity_days ?? 30),
        warrantyPresets: ensureAtLeastOnePreset(
          normalizePresets(data.warranty_presets ?? []),
          "Garantia padrão",
        ),
        paymentPresets: ensureAtLeastOnePreset(
          normalizePresets(data.payment_presets ?? []),
          "Pagamento padrão",
        ),
        paymentMethodPresets: ensureAtLeastOnePreset(
          normalizePresets(data.payment_method_presets ?? []),
          "Forma padrão",
        ),
        scopePresets: ensureAtLeastOnePreset(
          normalizePresets(data.scope_presets ?? []),
          "Escopo padrão",
        ),
        technicalPresets: ensureAtLeastOnePreset(
          normalizePresets(data.technical_presets ?? []),
          "Observações padrão",
        ),
      };
      setTemplateKey(next.templateKey);
      setBrandColor(next.brandColor);
      setFontColor(next.fontColor);
      setDefaultValidityDays(next.defaultValidityDays);
      setWarrantyPresets(next.warrantyPresets);
      setPaymentPresets(next.paymentPresets);
      setPaymentMethodPresets(next.paymentMethodPresets);
      setScopePresets(next.scopePresets);
      setTechnicalPresets(next.technicalPresets);
      setHasSignature(Boolean(data.has_signature));
      setBaseline(serializeBudgetSettings(next));
      void loadSignaturePreview(Boolean(data.has_signature));
    },
    [loadSignaturePreview],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBudgetTemplateSettings();
      applySettings(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (signaturePreview?.startsWith("blob:")) URL.revokeObjectURL(signaturePreview);
    };
  }, [signaturePreview]);

  function onCancel() {
    if (!baseline) return;
    const snapshot = JSON.parse(baseline) as {
      templateKey: BudgetTemplateKey;
      brandColor: string;
      fontColor: string;
      defaultValidityDays: number;
      warrantyPresets: BudgetTextPreset[];
      paymentPresets: BudgetTextPreset[];
      paymentMethodPresets: BudgetTextPreset[];
      scopePresets: BudgetTextPreset[];
      technicalPresets: BudgetTextPreset[];
    };
    setTemplateKey(snapshot.templateKey);
    setBrandColor(snapshot.brandColor);
    setFontColor(snapshot.fontColor);
    setDefaultValidityDays(snapshot.defaultValidityDays);
    setWarrantyPresets(snapshot.warrantyPresets);
    setPaymentPresets(snapshot.paymentPresets);
    setPaymentMethodPresets(snapshot.paymentMethodPresets);
    setScopePresets(snapshot.scopePresets);
    setTechnicalPresets(snapshot.technicalPresets);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    try {
      const updated = await patchBudgetTemplateSettings({
        template_key: templateKey,
        brand_color: normalizeBrandColor(brandColor),
        font_color: normalizeFontColor(fontColor),
        default_validity_days: Math.max(defaultValidityDays, 1),
        warranty_presets: normalizePresets(warrantyPresets),
        payment_presets: normalizePresets(paymentPresets),
        payment_method_presets: normalizePresets(paymentMethodPresets),
        scope_presets: normalizePresets(scopePresets),
        technical_presets: normalizePresets(technicalPresets),
      });
      applySettings(updated);
      toast.success("Configurações salvas. Novos PDFs usarão este modelo e textos.");
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onPickSignature(file: File | undefined) {
    if (!file) return;
    if (!file.type.includes("png")) {
      toast.error("Envie um arquivo PNG (fundo transparente recomendado).");
      return;
    }
    setSignatureBusy(true);
    try {
      const updated = await uploadBudgetTemplateSignature(file);
      applySettings(updated);
      toast.success("Assinatura salva. Ela aparecerá nos PDFs de orçamento.");
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível enviar a assinatura.");
    } finally {
      setSignatureBusy(false);
    }
  }

  async function onRemoveSignature() {
    setSignatureBusy(true);
    try {
      const updated = await deleteBudgetTemplateSignature();
      applySettings(updated);
      toast.success("Assinatura removida.");
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível remover a assinatura.");
    } finally {
      setSignatureBusy(false);
    }
  }

  async function downloadPreviewPdf() {
    setPdfLoading(true);
    try {
      const blob = await fetchBudgetTemplatePreviewPdf(previewDraft);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `orcamento-modelo-${templateKey}.pdf`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível baixar o PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  if (loading) {
    return (
      <section className={layout.wrap}>
        <header className={layout.pageHeader}>
          <nav className={layout.breadcrumb} aria-label="Navegação">
            <span className={layout.breadcrumbCurrent}>Administração</span>
            <span className={layout.breadcrumbSep} aria-hidden>
              /
            </span>
            <span>Orçamentos</span>
          </nav>
          <div className={layout.pageHeaderMain}>
            <span className={layout.pageHeaderIcon} aria-hidden>
              <BudgetTemplatesHeaderIcon />
            </span>
            <div className={layout.pageHeaderText}>
              <h1 className={layout.pageTitle}>Modelos de orçamento</h1>
              <p className={layout.pageLead}>Carregando configurações…</p>
            </div>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className={`${layout.wrap} ${styles.pageWithActionBar}`} aria-labelledby="settings-budgets-title">
      <header className={layout.pageHeader}>
        <nav className={layout.breadcrumb} aria-label="Navegação">
          <span className={layout.breadcrumbCurrent}>Administração</span>
          <span className={layout.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Orçamentos</span>
        </nav>
        <div className={layout.pageHeaderMain}>
          <span className={layout.pageHeaderIcon} aria-hidden>
            <BudgetTemplatesHeaderIcon />
          </span>
          <div className={layout.pageHeaderText}>
            <h1 id="settings-budgets-title" className={layout.pageTitle}>
              Modelos de orçamento
            </h1>
            <p className={layout.pageLead}>
              Escolha o layout do PDF, as cores da marca e da fonte e os textos legais. A pré-visualização à direita
              atualiza em tempo real conforme você edita.
            </p>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
          <form
            id="budget-settings-form"
            className={styles.formColumn}
            onSubmit={(e) => void onSubmit(e)}
          >
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Modelo e identidade visual</h3>
              <p className={styles.cardHint}>
                A cor da marca é usada em fundos de cabeçalho, bordas das tabelas e faixas de destaque. A cor da fonte
                define o texto do corpo do documento.
              </p>

              <div className={styles.field}>
                <label htmlFor="budget-template-key">Template</label>
                <select
                  id="budget-template-key"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value as BudgetTemplateKey)}
                >
                  {BUDGET_TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className={styles.templateOptionDesc}>
                  {BUDGET_TEMPLATE_OPTIONS.find((o) => o.value === templateKey)?.description}
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="budget-brand-color">Cor da marca</label>
                <div className={styles.colorRow}>
                  <input
                    id="budget-brand-color-picker"
                    type="color"
                    value={normalizeBrandColor(brandColor)}
                    onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
                    aria-label="Seletor de cor"
                  />
                  <input
                    id="budget-brand-color"
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(sanitizeHexInput(e.target.value))}
                    onBlur={() => setBrandColor(normalizeBrandColor(brandColor))}
                    maxLength={7}
                    placeholder="#0B7FAF"
                  />
                </div>
                <div
                  className={styles.previewBar}
                  style={{ backgroundColor: normalizeBrandColor(brandColor) }}
                  aria-hidden
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="budget-font-color">Cor da fonte</label>
                <div className={styles.colorRow}>
                  <input
                    id="budget-font-color-picker"
                    type="color"
                    value={normalizeFontColor(fontColor)}
                    onChange={(e) => setFontColor(e.target.value.toUpperCase())}
                    aria-label="Seletor de cor da fonte"
                  />
                  <input
                    id="budget-font-color"
                    type="text"
                    value={fontColor}
                    onChange={(e) => setFontColor(sanitizeHexInput(e.target.value))}
                    onBlur={() => setFontColor(normalizeFontColor(fontColor))}
                    maxLength={7}
                    placeholder="#000000"
                  />
                </div>
                <div
                  className={styles.previewBar}
                  style={{
                    backgroundColor: "#ffffff",
                    color: normalizeFontColor(fontColor),
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                  aria-hidden
                >
                  Texto de exemplo
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Textos predefinidos</h3>
              <p className={styles.cardHint}>
                Salve vários modelos por campo (abas). O marcado como padrão pré-preenche novos orçamentos; no formulário
                do orçamento você pode escolher outro modelo ou editar só naquele documento.
              </p>

              <div className={styles.field}>
                <label htmlFor="budget-default-validity">Validade padrão do orçamento (dias)</label>
                <input
                  id="budget-default-validity"
                  type="number"
                  min={1}
                  max={365}
                  value={defaultValidityDays}
                  onChange={(e) => setDefaultValidityDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                />
              </div>

              <BudgetTextPresetsField
                idPrefix="budget-warranty"
                label="Garantia padrão"
                placeholder="Ex.: Garantia de 90 dias para mão de obra e peças substituídas."
                presets={warrantyPresets}
                onChange={setWarrantyPresets}
              />

              <BudgetTextPresetsField
                idPrefix="budget-payment-method"
                label="Forma de pagamento"
                placeholder="Ex.: PIX, boleto, cartão de crédito ou débito."
                presets={paymentMethodPresets}
                onChange={setPaymentMethodPresets}
              />

              <BudgetTextPresetsField
                idPrefix="budget-payment"
                label="Condições de pagamento"
                placeholder="Ex.: 50% na aprovação e 50% na conclusão do serviço."
                presets={paymentPresets}
                onChange={setPaymentPresets}
              />

              <BudgetTextPresetsField
                idPrefix="budget-scope"
                label="Escopo técnico"
                placeholder="Ex.: Desmontagem e higienização do equipamento;&#10;Teste de estanqueidade e vazão."
                presets={scopePresets}
                onChange={setScopePresets}
              />

              <BudgetTextPresetsField
                idPrefix="budget-technical"
                label="Observações"
                placeholder="Ex.: Prazo de execução sujeito à disponibilidade de peças."
                presets={technicalPresets}
                onChange={setTechnicalPresets}
              />
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Assinatura do prestador</h3>
              <p className={styles.cardHint}>
                Imagem PNG exibida no PDF acima da linha de assinatura da empresa (técnico responsável).
              </p>
              <div className={styles.signaturePanel}>
                <div
                  className={`${styles.signaturePreviewWrap} ${signatureDragOver ? styles.signatureDropActive : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Área para enviar assinatura PNG. Arraste o arquivo ou clique para selecionar."
                  onClick={() => !signatureBusy && signatureInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!signatureBusy) signatureInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSignatureDragOver(true);
                  }}
                  onDragLeave={() => setSignatureDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSignatureDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    void onPickSignature(file);
                  }}
                >
                  {signaturePreview ? (
                    <img src={signaturePreview} alt="Assinatura cadastrada" className={styles.signaturePreview} />
                  ) : (
                    <span className={styles.signatureFallback}>
                      {signatureDragOver ? "Solte o PNG aqui" : "Arraste o PNG ou clique para enviar"}
                    </span>
                  )}
                </div>
                <div className={styles.signatureMeta}>
                  <p className={styles.cardHint}>
                    Arraste o arquivo para a área tracejada ou use o botão. PNG com fundo transparente; até 420×160 px.
                  </p>
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png"
                    className={styles.fileInputHidden}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void onPickSignature(file);
                    }}
                  />
                  <div className={styles.signatureActions}>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={signatureBusy}
                      onClick={() => signatureInputRef.current?.click()}
                    >
                      {signatureBusy ? "Enviando…" : hasSignature ? "Substituir PNG" : "Enviar PNG"}
                    </Button>
                    {hasSignature ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={signatureBusy}
                        onClick={() => void onRemoveSignature()}
                      >
                        Remover
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

          </form>

          <aside className={styles.previewColumn} aria-label="Pré-visualização do modelo">
            <div className={styles.previewPanel}>
              <h3 className={styles.previewPanelTitle}>Pré-visualização</h3>
              <p className={styles.previewPanelHint}>
                Esboço do PDF com dados de exemplo. Alterações no formulário refletem aqui na hora.
              </p>
              <BudgetPreview
                config={previewConfig}
                templateId={templateKey}
                color={normalizeBrandColor(brandColor)}
                fontColor={normalizeFontColor(fontColor)}
                warranty={warrantyText}
                paymentTerms={paymentText}
                paymentMethod={paymentMethodText}
                scopeText={scopeText}
                technicalNotes={technicalText}
                draft={{ validityDays: defaultValidityDays }}
              />
              <Button
                type="button"
                variant="outline"
                className={styles.previewPdfBtn}
                disabled={pdfLoading}
                onClick={() => void downloadPreviewPdf()}
              >
                {pdfLoading ? "Gerando PDF…" : "Baixar PDF"}
              </Button>
            </div>
          </aside>
        </div>

      <div className={styles.actionBar} role="toolbar" aria-label="Ações da configuração">
        <div className={styles.actionBarInner}>
          {isDirty ? (
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
          <Button
            type="submit"
            form="budget-settings-form"
            variant="default"
            disabled={saving || !isDirty}
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </section>
  );
}
