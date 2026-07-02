import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { fetchTenantGarantiaSettings, patchTenantGarantiaSettings, type TenantGarantiaSettings } from "../../api/garantiaSettings";
import { Button } from "../../components/ui/button";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import layout from "./ManagementView.module.css";
import styles from "./SettingsGarantia.module.css";

function serializeSettings(s: TenantGarantiaSettings): string {
  return JSON.stringify(s);
}

function GarantiaSettingsHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function SettingsGarantia() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [settings, setSettings] = useState<TenantGarantiaSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchTenantGarantiaSettings();
      setSettings(row);
      setBaseline(serializeSettings(row));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    if (!settings || !baseline) return false;
    return serializeSettings(settings) !== baseline;
  }, [baseline, settings]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await patchTenantGarantiaSettings(settings);
      setSettings(saved);
      setBaseline(serializeSettings(saved));
      toast.success("Configurações da garantia salvas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function patch<K extends keyof TenantGarantiaSettings>(key: K, value: TenantGarantiaSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (!ctx) return null;

  return (
    <div className={layout.pageWithActionBar}>
      <header className={layout.pageHeader}>
        <nav className={layout.breadcrumb} aria-label="Navegação">
          <span className={layout.breadcrumbCurrent}>Administração</span>
          <span className={layout.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Garantia</span>
        </nav>
        <div className={layout.pageHeaderMain}>
          <span className={layout.pageHeaderIcon} aria-hidden>
            <GarantiaSettingsHeaderIcon />
          </span>
          <div className={layout.pageHeaderText}>
            <h1 className={layout.pageTitle}>Configurações da Garantia</h1>
            <p className={layout.pageLead}>
              Prazos e textos legais do termo de instalação. Estes conteúdos não aparecem na ordem de serviço — entram
              automaticamente ao gerar o PDF do termo, junto com os dados da empresa e do cliente.
            </p>
          </div>
        </div>
      </header>

      {loading ? <p className={styles.loading}>Carregando…</p> : null}

      {!loading && settings ? (
        <form id="garantia-settings-form" className={styles.form} onSubmit={(e) => void onSave(e)}>
          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Vigência e prazos</h2>
            <p className={styles.sectionLead}>
              Prazo padrão aplicado em novas instalações. A data de início vem da OS (data da instalação).
            </p>
            <label className={styles.field}>
              <span className={styles.label}>Prazo padrão (meses)</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={120}
                value={settings.defaultMesesGarantia}
                onChange={(e) => patch("defaultMesesGarantia", Math.max(1, Number(e.target.value) || 12))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Prazo da garantia do serviço (texto)</span>
              <input
                className={styles.input}
                value={settings.prazoGarantiaServico}
                onChange={(e) => patch("prazoGarantiaServico", e.target.value)}
                placeholder="Ex.: 90 dias legais + 12 meses complementares"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Nota sobre garantia de fábrica</span>
              <textarea
                className={styles.textarea}
                rows={4}
                value={settings.notaGarantiaFabrica}
                onChange={(e) => patch("notaGarantiaFabrica", e.target.value)}
              />
            </label>
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Termos, cobertura e exclusões</h2>
            <p className={styles.sectionLead}>Textos legais editáveis conforme a política da empresa.</p>
            <label className={styles.field}>
              <span className={styles.label}>Termos gerais</span>
              <textarea
                className={styles.textarea}
                rows={4}
                value={settings.termosGarantia}
                onChange={(e) => patch("termosGarantia", e.target.value)}
              />
            </label>
            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>O que a garantia cobre</span>
                <textarea
                  className={styles.textarea}
                  rows={8}
                  value={settings.servicosCobertos}
                  onChange={(e) => patch("servicosCobertos", e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>O que não cobre</span>
                <textarea
                  className={styles.textarea}
                  rows={8}
                  value={settings.condicoesExclusoes}
                  onChange={(e) => patch("condicoesExclusoes", e.target.value)}
                />
              </label>
            </div>
          </section>
        </form>
      ) : null}

      <div className={layout.formActionBar} role="toolbar" aria-label="Ações da configuração">
        <div className={layout.formActionBarInner}>
          {isDirty && settings ? (
            <Button type="button" variant="outline" disabled={saving} onClick={() => void load()}>
              Cancelar
            </Button>
          ) : null}
          <Button
            type="submit"
            form="garantia-settings-form"
            variant="default"
            disabled={saving || loading || !settings || !isDirty}
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
