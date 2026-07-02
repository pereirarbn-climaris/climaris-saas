import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { PlatformStripeCouponsPanel } from "../platform/PlatformStripeCouponsPage";
import {
  createPlatformSaasPlan,
  deletePlatformSaasPlan,
  fetchStripePlatformStatus,
  listPlatformSaasPlans,
  patchPlatformSaasPlan,
  syncPlatformPlanToStripe,
  type DashboardTierCap,
  type FinanceModeCap,
  type SaasPlanCatalogRow,
  type StripePlatformStatus,
} from "../../api/platformSaasPlans";
import { isValidPlanKey, slugifyPlanKey } from "../../lib/apiErrorMessage";
import { toast } from "../../lib/toast";
import tableStyles from "../listTableCommon.module.css";
import pageStyles from "./PlatformSaasPlansPage.module.css";
import styles from "./SaasDashboardPage.module.css";

const FINANCE_MODE_LABELS: Record<FinanceModeCap, string> = {
  basic: "Financeiro básico (teto)",
  intermediate: "Intermediário (teto)",
  management: "Gestão completa (teto)",
};

const DASHBOARD_TIER_LABELS: Record<DashboardTierCap, string> = {
  basic: "Básico",
  advanced: "Avançado",
  complete: "Completo",
};

function emptyDraft(): {
  plan_key: string;
  display_name: string;
  description: string;
  footnote: string;
  finance_max_mode: FinanceModeCap;
  dashboard_tier: DashboardTierCap;
  max_users: string;
  sort_order: string;
  is_beta_internal: boolean;
  can_contract: boolean;
  is_selectable_for_tenants: boolean;
  show_in_matrix: boolean;
  monthly_price_brl: string;
  products_inventory_enabled: boolean;
  products_purchases_enabled: boolean;
  products_max_images: string;
} {
  return {
    plan_key: "",
    display_name: "",
    description: "",
    footnote: "",
    finance_max_mode: "basic",
    dashboard_tier: "basic",
    max_users: "",
    sort_order: "0",
    is_beta_internal: false,
    can_contract: true,
    is_selectable_for_tenants: true,
    show_in_matrix: true,
    monthly_price_brl: "",
    products_inventory_enabled: true,
    products_purchases_enabled: false,
    products_max_images: "5",
  };
}

function formatBrl(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function catalogRowToDraft(r: SaasPlanCatalogRow): ReturnType<typeof emptyDraft> {
  return {
    plan_key: r.plan_key,
    display_name: r.display_name,
    description: r.description,
    footnote: r.footnote,
    finance_max_mode: r.finance_max_mode,
    dashboard_tier: r.dashboard_tier ?? "basic",
    max_users: r.max_users != null ? String(r.max_users) : "",
    sort_order: String(r.sort_order),
    is_beta_internal: r.is_beta_internal,
    can_contract: r.can_contract,
    is_selectable_for_tenants: r.is_selectable_for_tenants,
    show_in_matrix: r.show_in_matrix,
    monthly_price_brl: r.monthly_price_brl != null ? String(r.monthly_price_brl) : "",
    products_inventory_enabled: r.products_inventory_enabled ?? true,
    products_purchases_enabled: r.products_purchases_enabled ?? false,
    products_max_images: r.products_max_images != null ? String(r.products_max_images) : "",
  };
}

function stripeSyncBadge(plan: SaasPlanCatalogRow) {
  if (plan.is_beta_internal || !plan.can_contract) {
    return <span className={pageStyles.badgeNa}>N/A</span>;
  }
  if (plan.stripe_price_id) {
    return <span className={pageStyles.badgeSynced}>Sincronizado</span>;
  }
  return <span className={pageStyles.badgePending}>Pendente</span>;
}

type StripePlanPanelProps = {
  plan: SaasPlanCatalogRow | undefined;
  stripeConfigured: boolean;
  syncing: boolean;
  onSync: () => void;
  canSync: boolean;
};

function StripePlanPanel({ plan, stripeConfigured, syncing, onSync, canSync }: StripePlanPanelProps) {
  if (!plan) return null;

  const isCommercial = plan.can_contract && !plan.is_beta_internal;
  const isSynced = Boolean(plan.stripe_price_id);

  if (!stripeConfigured) {
    return (
      <div className={`${pageStyles.stripePanel} ${pageStyles.stripePanelOff}`}>
        <p className={pageStyles.stripePanelTitle}>Stripe não configurado</p>
        <p className={pageStyles.stripePanelLead}>
          Cadastre as chaves em <strong>Operação → Chaves APIs</strong> (provedor Stripe) antes de publicar preços no
          checkout.
        </p>
      </div>
    );
  }

  if (!isCommercial) {
    return (
      <div className={`${pageStyles.stripePanel} ${pageStyles.stripePanelOff}`}>
        <p className={pageStyles.stripePanelTitle}>Cobrança Stripe</p>
        <p className={pageStyles.stripePanelLead}>
          Planos internos ou não comerciais não são enviados ao Stripe. Marque &quot;Pode ser contratado&quot; e desmarque
          &quot;Plano interno&quot; para habilitar sincronização.
        </p>
      </div>
    );
  }

  if (isSynced) {
    return (
      <div className={`${pageStyles.stripePanel} ${pageStyles.stripePanelSynced}`}>
        <div className={pageStyles.stripePanelHead}>
          <div>
            <p className={pageStyles.stripePanelTitle}>Sincronizado com Stripe</p>
            <p className={pageStyles.stripePanelLead}>
              Este plano está ativo no checkout. Alterou nome ou preço? Salve e clique em &quot;Atualizar no Stripe&quot;
              para gerar um novo price quando necessário.
            </p>
          </div>
          <span className={pageStyles.badgeSynced}>Ativo</span>
        </div>
        <div className={pageStyles.stripeIds}>
          {plan.stripe_product_id ? (
            <div className={pageStyles.stripeIdRow}>
              <span className={pageStyles.stripeIdLabel}>Product ID</span>
              <p className={pageStyles.stripeIdValue}>{plan.stripe_product_id}</p>
            </div>
          ) : null}
          <div className={pageStyles.stripeIdRow}>
            <span className={pageStyles.stripeIdLabel}>Price ID (checkout)</span>
            <p className={pageStyles.stripeIdValue}>{plan.stripe_price_id}</p>
          </div>
        </div>
        {canSync ? (
          <button
            type="button"
            className={pageStyles.btnStripe}
            disabled={syncing}
            onClick={onSync}
          >
            {syncing ? "Atualizando…" : "Atualizar no Stripe"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${pageStyles.stripePanel} ${pageStyles.stripePanelPending}`}>
      <div className={pageStyles.stripePanelHead}>
        <div>
          <p className={pageStyles.stripePanelTitle}>Aguardando sincronização</p>
          <p className={pageStyles.stripePanelLead}>
            Defina o preço mensal, salve o plano e envie ao Stripe para liberar o checkout automático.
          </p>
        </div>
        <span className={pageStyles.badgePending}>Pendente</span>
      </div>
      {canSync ? (
        <button type="button" className={pageStyles.btnStripe} disabled={syncing} onClick={onSync}>
          {syncing ? "Sincronizando…" : "Sincronizar com Stripe"}
        </button>
      ) : null}
    </div>
  );
}

type PlansView = "planos" | "cupons";

export function PlatformSaasPlansPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView: PlansView = searchParams.get("aba") === "cupons" ? "cupons" : "planos";
  const [view, setView] = useState<PlansView>(initialView);
  const [openCouponForm, setOpenCouponForm] = useState(searchParams.get("aba") === "cupons");

  const [rows, setRows] = useState<SaasPlanCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripePlatformStatus | null>(null);
  const [syncingStripe, setSyncingStripe] = useState(false);

  const editingRow = useMemo(
    () => (editingKey ? rows.find((r) => r.plan_key === editingKey) : undefined),
    [editingKey, rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planRows, stripe] = await Promise.all([listPlatformSaasPlans(), fetchStripePlatformStatus().catch(() => null)]);
      setRows(planRows);
      setStripeStatus(stripe);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível carregar o catálogo de planos.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setCreating(true);
    setEditingKey(null);
    setDraft(emptyDraft());
  }

  function selectRow(key: string, sourceRows: SaasPlanCatalogRow[] = rows) {
    const r = sourceRows.find((x) => x.plan_key === key);
    if (!r) return;
    setCreating(false);
    setEditingKey(key);
    setDraft(catalogRowToDraft(r));
  }

  function upsertPlanRow(updated: SaasPlanCatalogRow) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.plan_key === updated.plan_key);
      if (idx < 0) return [...prev, updated].sort((a, b) => a.sort_order - b.sort_order || a.plan_key.localeCompare(b.plan_key));
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
    setDraft(catalogRowToDraft(updated));
  }

  function cancelEdit() {
    setCreating(false);
    setEditingKey(null);
    setDraft(emptyDraft());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const sortOrder = Number.parseInt(draft.sort_order.trim(), 10);
    const maxUsersRaw = draft.max_users.trim();
    const maxUsersParsed = maxUsersRaw === "" ? null : Number.parseInt(maxUsersRaw, 10);
    if (Number.isNaN(sortOrder)) {
      toast.error("Ordem de exibição inválida.");
      setSaving(false);
      return;
    }
    if (maxUsersParsed !== null && (Number.isNaN(maxUsersParsed) || maxUsersParsed < 1)) {
      toast.error("Limite de usuários deve ser vazio (ilimitado / padrão) ou um número ≥ 1.");
      setSaving(false);
      return;
    }
    const priceRaw = draft.monthly_price_brl.trim();
    const monthlyPrice = priceRaw === "" ? null : Number.parseFloat(priceRaw.replace(",", "."));
    if (monthlyPrice !== null && (Number.isNaN(monthlyPrice) || monthlyPrice < 0)) {
      toast.error("Preço mensal inválido.");
      setSaving(false);
      return;
    }
    const maxImagesRaw = draft.products_max_images.trim();
    const productsMaxImages = maxImagesRaw === "" ? null : Number.parseInt(maxImagesRaw, 10);
    if (productsMaxImages !== null && (Number.isNaN(productsMaxImages) || productsMaxImages < 0 || productsMaxImages > 100)) {
      toast.error("Quantidade máxima de imagens deve ser vazia (ilimitado) ou entre 0 e 100.");
      setSaving(false);
      return;
    }
    try {
      if (creating) {
        const pk = slugifyPlanKey(draft.plan_key.trim() || draft.display_name.trim());
        if (!isValidPlanKey(pk)) {
          toast.error("Informe a chave do plano (ex.: basic) ou um nome de exibição que gere um slug válido.");
          setSaving(false);
          return;
        }
        await createPlatformSaasPlan({
          plan_key: pk,
          display_name: draft.display_name.trim(),
          description: draft.description,
          footnote: draft.footnote,
          finance_max_mode: draft.finance_max_mode,
          dashboard_tier: draft.dashboard_tier,
          max_users: maxUsersParsed,
          sort_order: sortOrder,
          is_beta_internal: draft.is_beta_internal,
          can_contract: draft.can_contract,
          is_selectable_for_tenants: draft.is_selectable_for_tenants,
          show_in_matrix: draft.show_in_matrix,
          monthly_price_brl: monthlyPrice,
          products_inventory_enabled: draft.products_inventory_enabled,
          products_purchases_enabled: draft.products_purchases_enabled,
          products_max_images: productsMaxImages,
        });
        toast.success("Plano criado com sucesso.");
        await load();
        cancelEdit();
      } else if (editingKey) {
        const updated = await patchPlatformSaasPlan(editingKey, {
          display_name: draft.display_name.trim(),
          description: draft.description,
          footnote: draft.footnote,
          finance_max_mode: draft.finance_max_mode,
          dashboard_tier: draft.dashboard_tier,
          max_users: maxUsersParsed,
          sort_order: sortOrder,
          is_beta_internal: draft.is_beta_internal,
          can_contract: draft.can_contract,
          is_selectable_for_tenants: draft.is_selectable_for_tenants,
          show_in_matrix: draft.show_in_matrix,
          monthly_price_brl: monthlyPrice,
          products_inventory_enabled: draft.products_inventory_enabled,
          products_purchases_enabled: draft.products_purchases_enabled,
          products_max_images: productsMaxImages,
        });
        upsertPlanRow(updated);
        toast.success("Alterações salvas com sucesso.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onSyncStripe() {
    if (!editingKey) return;
    const previousPriceId = editingRow?.stripe_price_id ?? null;
    setSyncingStripe(true);
    try {
      const updated = await syncPlatformPlanToStripe(editingKey);
      const unchanged = previousPriceId && updated.stripe_price_id === previousPriceId;
      upsertPlanRow(updated);
      toast.success(
        unchanged
          ? "Plano já sincronizado no Stripe — nenhuma alteração necessária."
          : `Stripe atualizado com sucesso. Novo price: ${updated.stripe_price_id ?? "—"}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar com Stripe.");
    } finally {
      setSyncingStripe(false);
    }
  }

  async function onDelete() {
    if (!editingKey) return;
    const ok = window.confirm(
      `Excluir o plano "${editingKey}"? Só é permitido se nenhum workspace estiver usando esta chave.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await deletePlatformSaasPlan(editingKey);
      toast.success("Plano removido.");
      await load();
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setSaving(false);
    }
  }

  const stripeConfigured = Boolean(stripeStatus?.configured);
  const showStripeSyncButton = Boolean(
    !creating && editingKey && stripeConfigured && draft.can_contract && !draft.is_beta_internal,
  );

  function switchView(next: PlansView, opts?: { createCoupon?: boolean }) {
    setView(next);
    setOpenCouponForm(Boolean(opts?.createCoupon));
    if (next === "cupons") {
      setSearchParams({ aba: "cupons" }, { replace: true });
      cancelEdit();
    } else {
      setSearchParams({}, { replace: true });
      setOpenCouponForm(false);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard} aria-labelledby="plans-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Climaris · Operação</p>
          <h1 id="plans-title" className={styles.heroTitle}>
            Catálogo de planos SaaS
          </h1>
          <p className={styles.heroLead}>
            Gerencie planos comerciais, preços, cupons e limites. Planos sincronizados com o Stripe ficam disponíveis no
            checkout automático; códigos promocionais são aplicados na assinatura pelo cliente.
          </p>
          {stripeStatus ? (
            <div className={pageStyles.statusPills}>
              <span className={stripeStatus.configured ? pageStyles.pillOk : pageStyles.pillWarn}>
                {stripeStatus.configured ? "Stripe configurado" : "Stripe pendente"}
              </span>
              {stripeStatus.configured ? (
                <span className={stripeStatus.has_webhook_secret ? pageStyles.pillOk : pageStyles.pillWarn}>
                  Webhook {stripeStatus.has_webhook_secret ? "configurado" : "pendente"}
                </span>
              ) : null}
              <span className={pageStyles.pillMuted}>
                POST {stripeStatus.webhook_url_hint}
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>

      {error ? (
        <p className={pageStyles.formAlertErr} role="alert">
          {error}
        </p>
      ) : null}

      <div className={pageStyles.viewTabs} role="tablist" aria-label="Planos e cupons">
        <button
          type="button"
          role="tab"
          aria-selected={view === "planos"}
          className={view === "planos" ? pageStyles.viewTabActive : pageStyles.viewTab}
          onClick={() => switchView("planos")}
        >
          Planos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "cupons"}
          className={view === "cupons" ? pageStyles.viewTabActive : pageStyles.viewTab}
          onClick={() => switchView("cupons")}
        >
          Cupons Stripe
        </button>
      </div>

      {view === "cupons" ? (
        <section className={styles.card}>
          <PlatformStripeCouponsPanel
            stripeStatus={stripeStatus}
            active
            openCreateForm={openCouponForm}
          />
        </section>
      ) : null}

      {view === "planos" ? (
      <section className={styles.card}>
        <div className={pageStyles.toolbar}>
          <p className={styles.note} style={{ margin: 0 }}>
            {rows.length} plano{rows.length === 1 ? "" : "s"} no catálogo
          </p>
          <div className={pageStyles.toolbarActions}>
            <button type="button" className={pageStyles.btnSecondary} onClick={() => void load()} disabled={loading}>
              {loading ? "Carregando…" : "Recarregar"}
            </button>
            <button
              type="button"
              className={pageStyles.btnStripe}
              disabled={loading || !stripeConfigured}
              onClick={() => switchView("cupons", { createCoupon: true })}
            >
              Cupons
            </button>
            <button type="button" className={pageStyles.btnPrimary} onClick={startCreate} disabled={loading}>
              Novo plano
            </button>
          </div>
        </div>

        {loading && !rows.length ? (
          <p className={pageStyles.emptyState}>Carregando catálogo…</p>
        ) : rows.length === 0 ? (
          <p className={pageStyles.emptyState}>
            Nenhum plano cadastrado. Clique em <strong>Novo plano</strong> para começar.
          </p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table} width="100%">
              <thead>
                <tr>
                  <th className={tableStyles.th}>Chave</th>
                  <th className={tableStyles.th}>Nome</th>
                  <th className={tableStyles.th}>Teto financeiro</th>
                  <th className={tableStyles.th}>Dashboard</th>
                  <th className={tableStyles.th}>Preço/mês</th>
                  <th className={tableStyles.th}>Stripe</th>
                  <th className={tableStyles.th}>Matriz</th>
                  <th className={tableStyles.th}>Seletor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.plan_key}
                    onClick={() => selectRow(r.plan_key)}
                    style={{
                      cursor: "pointer",
                      background: editingKey === r.plan_key ? "rgba(11, 127, 175, 0.08)" : undefined,
                    }}
                  >
                    <td className={tableStyles.td}>
                      <code className={styles.inlineCode}>{r.plan_key}</code>
                    </td>
                    <td className={tableStyles.td}>{r.display_name}</td>
                    <td className={tableStyles.td}>{FINANCE_MODE_LABELS[r.finance_max_mode]}</td>
                    <td className={tableStyles.td}>{DASHBOARD_TIER_LABELS[r.dashboard_tier ?? "basic"]}</td>
                    <td className={tableStyles.td}>{formatBrl(r.monthly_price_brl)}</td>
                    <td className={tableStyles.td}>{stripeSyncBadge(r)}</td>
                    <td className={tableStyles.td}>{r.show_in_matrix ? "Sim" : "Não"}</td>
                    <td className={tableStyles.td}>{r.is_selectable_for_tenants ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {view === "planos" && (creating || editingKey) ? (
        <section className={styles.card} aria-labelledby="plan-form-title">
          <form onSubmit={onSubmit} className={pageStyles.formCard}>
            <div className={pageStyles.formHeader}>
              <div>
                <h2 id="plan-form-title" className={pageStyles.formTitle}>
                  {creating ? "Novo plano" : `Editar plano`}
                </h2>
                <p className={pageStyles.formSubtitle}>
                  {creating
                    ? "Preencha os dados do plano. A chave (slug) é gerada automaticamente a partir do nome."
                    : `Chave: ${editingKey}`}
                </p>
              </div>
            </div>

            {!creating && editingRow ? (
              <StripePlanPanel
                plan={editingRow}
                stripeConfigured={stripeConfigured}
                syncing={syncingStripe}
                onSync={() => void onSyncStripe()}
                canSync={showStripeSyncButton}
              />
            ) : null}

            <div className={pageStyles.formSection}>
              <h3 className={pageStyles.sectionTitle}>Identidade</h3>
              <div className={pageStyles.fieldGrid}>
                <label className={`${pageStyles.field} ${pageStyles.fieldFull}`}>
                  <span className={pageStyles.label}>Nome de exibição</span>
                  <input
                    className={pageStyles.input}
                    value={draft.display_name}
                    onChange={(e) => {
                      const displayName = e.target.value;
                      setDraft((d) => {
                        const next = { ...d, display_name: displayName };
                        if (creating && !d.plan_key.trim()) {
                          next.plan_key = slugifyPlanKey(displayName);
                        }
                        return next;
                      });
                    }}
                    required
                  />
                </label>
                {creating ? (
                  <label className={pageStyles.field}>
                    <span className={pageStyles.label}>Chave (slug)</span>
                    <input
                      className={`${pageStyles.input} ${pageStyles.inputCode}`}
                      value={draft.plan_key}
                      onChange={(e) => setDraft((d) => ({ ...d, plan_key: e.target.value }))}
                      onBlur={(e) => {
                        const normalized = slugifyPlanKey(e.target.value);
                        if (normalized !== e.target.value) {
                          setDraft((d) => ({ ...d, plan_key: normalized }));
                        }
                      }}
                      placeholder="ex.: basic"
                      autoComplete="off"
                    />
                    <p className={pageStyles.hint}>Minúsculas, números, _ e -. Vazio = gerado do nome.</p>
                  </label>
                ) : null}
                <label className={`${pageStyles.field} ${pageStyles.fieldFull}`}>
                  <span className={pageStyles.label}>Descrição (card da matriz)</span>
                  <textarea
                    className={pageStyles.textarea}
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                </label>
                <label className={`${pageStyles.field} ${pageStyles.fieldFull}`}>
                  <span className={pageStyles.label}>Rodapé / upsell</span>
                  <textarea
                    className={pageStyles.textarea}
                    style={{ minHeight: "3.25rem" }}
                    value={draft.footnote}
                    onChange={(e) => setDraft((d) => ({ ...d, footnote: e.target.value }))}
                  />
                </label>
              </div>
            </div>

            <div className={pageStyles.formSection}>
              <h3 className={pageStyles.sectionTitle}>Comercial e preço</h3>
              <div className={pageStyles.fieldGrid}>
                <label className={pageStyles.field}>
                  <span className={pageStyles.label}>Teto do modo financeiro</span>
                  <select
                    className={pageStyles.select}
                    value={draft.finance_max_mode}
                    onChange={(e) => setDraft((d) => ({ ...d, finance_max_mode: e.target.value as FinanceModeCap }))}
                  >
                    <option value="basic">{FINANCE_MODE_LABELS.basic}</option>
                    <option value="intermediate">{FINANCE_MODE_LABELS.intermediate}</option>
                    <option value="management">{FINANCE_MODE_LABELS.management}</option>
                  </select>
                </label>
                <label className={pageStyles.field}>
                  <span className={pageStyles.label}>Dashboard gerencial</span>
                  <select
                    className={pageStyles.select}
                    value={draft.dashboard_tier}
                    onChange={(e) => setDraft((d) => ({ ...d, dashboard_tier: e.target.value as DashboardTierCap }))}
                  >
                    <option value="basic">{DASHBOARD_TIER_LABELS.basic}</option>
                    <option value="advanced">{DASHBOARD_TIER_LABELS.advanced}</option>
                    <option value="complete">{DASHBOARD_TIER_LABELS.complete}</option>
                  </select>
                  <p className={pageStyles.hint}>
                    Define o painel inicial do cliente (Básico, Avançado ou Completo), independente do teto financeiro.
                  </p>
                </label>
                <label className={pageStyles.field}>
                  <span className={pageStyles.label}>Preço mensal (BRL)</span>
                  <input
                    className={pageStyles.input}
                    value={draft.monthly_price_brl}
                    onChange={(e) => setDraft((d) => ({ ...d, monthly_price_brl: e.target.value }))}
                    inputMode="decimal"
                    placeholder="99,90"
                  />
                  <p className={pageStyles.hint}>Usado no checkout Stripe após sincronização.</p>
                </label>
                <label className={pageStyles.field}>
                  <span className={pageStyles.label}>Máx. usuários</span>
                  <input
                    className={pageStyles.input}
                    value={draft.max_users}
                    onChange={(e) => setDraft((d) => ({ ...d, max_users: e.target.value }))}
                    inputMode="numeric"
                    placeholder="Ilimitado"
                  />
                </label>
                <label className={pageStyles.field}>
                  <span className={pageStyles.label}>Ordem na lista</span>
                  <input
                    className={pageStyles.input}
                    value={draft.sort_order}
                    onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
                    inputMode="numeric"
                  />
                </label>
              </div>
            </div>

            <div className={pageStyles.formSection}>
              <h3 className={pageStyles.sectionTitle}>Produtos</h3>
              <div className={pageStyles.checkboxGrid}>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.products_inventory_enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, products_inventory_enabled: e.target.checked }))}
                  />
                  Controle de estoque nos produtos
                </label>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.products_purchases_enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, products_purchases_enabled: e.target.checked }))}
                  />
                  Módulo de compras de produtos
                </label>
              </div>
              <label className={pageStyles.field} style={{ maxWidth: "14rem" }}>
                <span className={pageStyles.label}>Máx. imagens por produto</span>
                <input
                  className={pageStyles.input}
                  value={draft.products_max_images}
                  onChange={(e) => setDraft((d) => ({ ...d, products_max_images: e.target.value }))}
                  inputMode="numeric"
                  placeholder="Ilimitado"
                />
                <p className={pageStyles.hint}>Vazio = ilimitado. Use 0 para bloquear fotos no plano.</p>
              </label>
            </div>

            <div className={pageStyles.formSection}>
              <h3 className={pageStyles.sectionTitle}>Visibilidade</h3>
              <div className={pageStyles.checkboxGrid}>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.is_beta_internal}
                    onChange={(e) => setDraft((d) => ({ ...d, is_beta_internal: e.target.checked }))}
                  />
                  Plano interno / equipe
                </label>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.can_contract}
                    onChange={(e) => setDraft((d) => ({ ...d, can_contract: e.target.checked }))}
                  />
                  Pode ser contratado (comercial)
                </label>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.is_selectable_for_tenants}
                    onChange={(e) => setDraft((d) => ({ ...d, is_selectable_for_tenants: e.target.checked }))}
                  />
                  Aparece no seletor de plano (Clientes SaaS)
                </label>
                <label className={pageStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.show_in_matrix}
                    onChange={(e) => setDraft((d) => ({ ...d, show_in_matrix: e.target.checked }))}
                  />
                  Mostrar na matriz do painel
                </label>
              </div>
            </div>

            <div className={pageStyles.formFooter}>
              <button type="submit" className={pageStyles.btnPrimary} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
              {!creating ? (
                <button type="button" className={pageStyles.btnDanger} disabled={saving} onClick={onDelete}>
                  Excluir
                </button>
              ) : null}
              <button type="button" className={pageStyles.btnSecondary} disabled={saving} onClick={cancelEdit}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
