import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import {
  fetchBudgetTemplatePreviewPdf,
  fetchBudgetTemplateSettings,
  patchBudgetTemplateSettings,
} from "../../api/budgetTemplates";
import { BudgetPreview } from "../../components/budget/BudgetPreview";
import {
  BUDGET_TEMPLATE_OPTIONS,
  DEFAULT_BRAND_COLOR,
  normalizeBrandColor,
  type BudgetTemplateKey,
  type BudgetTemplateSettings,
} from "../../lib/budgetPdfGenerator";
import type { DashboardOutletContext } from "../dashboardContext";
import { getTenantDisplayName } from "../../lib/tenantDisplay";
import { ToastHost } from "../../components/ToastHost";
import { Button } from "../../components/ui/button";
import { toast } from "../../lib/toast";
import styles from "./SettingsBudgets.module.css";
import layout from "./ManagementView.module.css";

function serializeBudgetSettings(state: {
  templateKey: BudgetTemplateKey;
  brandColor: string;
  warranty: string;
  payment: string;
  technical: string;
}): string {
  return JSON.stringify({
    templateKey: state.templateKey,
    brandColor: normalizeBrandColor(state.brandColor),
    warranty: state.warranty.trim(),
    payment: state.payment.trim(),
    technical: state.technical.trim(),
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
  const [warranty, setWarranty] = useState("");
  const [payment, setPayment] = useState("");
  const [technical, setTechnical] = useState("");

  const previewDraft = useMemo(
    (): Partial<BudgetTemplateSettings> => ({
      template_key: templateKey,
      brand_color: normalizeBrandColor(brandColor),
      default_warranty_terms: warranty.trim() || null,
      default_payment_terms: payment.trim() || null,
      default_technical_notes: technical.trim() || null,
    }),
    [templateKey, brandColor, warranty, payment, technical],
  );

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      serializeBudgetSettings({
        templateKey,
        brandColor,
        warranty,
        payment,
        technical,
      }) !== baseline
    );
  }, [baseline, templateKey, brandColor, warranty, payment, technical]);

  const previewConfig = useMemo(
    () => ({
      companyName,
      technicalNotes: technical,
    }),
    [companyName, technical],
  );

  const applySettings = useCallback((data: BudgetTemplateSettings) => {
    const next = {
      templateKey: data.template_key,
      brandColor: normalizeBrandColor(data.brand_color),
      warranty: data.default_warranty_terms ?? "",
      payment: data.default_payment_terms ?? "",
      technical: data.default_technical_notes ?? "",
    };
    setTemplateKey(next.templateKey);
    setBrandColor(next.brandColor);
    setWarranty(next.warranty);
    setPayment(next.payment);
    setTechnical(next.technical);
    setBaseline(serializeBudgetSettings(next));
  }, []);

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

  function onCancel() {
    if (!baseline) return;
    const snapshot = JSON.parse(baseline) as {
      templateKey: BudgetTemplateKey;
      brandColor: string;
      warranty: string;
      payment: string;
      technical: string;
    };
    setTemplateKey(snapshot.templateKey);
    setBrandColor(snapshot.brandColor);
    setWarranty(snapshot.warranty);
    setPayment(snapshot.payment);
    setTechnical(snapshot.technical);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    try {
      const updated = await patchBudgetTemplateSettings({
        template_key: templateKey,
        brand_color: normalizeBrandColor(brandColor),
        default_warranty_terms: warranty.trim() || null,
        default_payment_terms: payment.trim() || null,
        default_technical_notes: technical.trim() || null,
      });
      applySettings(updated);
      toast.success("Configurações salvas. Novos PDFs usarão este modelo e textos.");
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
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
      <ToastHost />
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
              Escolha o layout do PDF, a cor da marca e os textos legais. A pré-visualização à direita atualiza em tempo
              real conforme você edita.
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
                A cor é usada em títulos, bordas das tabelas e faixas de total no PDF.
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
                    onChange={(e) => setBrandColor(e.target.value)}
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
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Textos predefinidos</h3>
              <p className={styles.cardHint}>
                Incluídos no rodapé do PDF (garantia, pagamento e observações). Podem ser alterados em cada orçamento.
              </p>

              <div className={styles.field}>
                <label htmlFor="budget-default-warranty">Garantia padrão</label>
                <textarea
                  id="budget-default-warranty"
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                  placeholder="Ex.: Garantia de 90 dias para mão de obra e peças substituídas."
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="budget-default-payment">Termos de pagamento</label>
                <textarea
                  id="budget-default-payment"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                  placeholder="Ex.: 50% na aprovação e 50% na conclusão do serviço."
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="budget-default-technical">Observações técnicas</label>
                <textarea
                  id="budget-default-technical"
                  value={technical}
                  onChange={(e) => setTechnical(e.target.value)}
                  placeholder="Ex.: Prazo de execução sujeito à disponibilidade de peças."
                />
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
                warranty={warranty}
                paymentTerms={payment}
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
