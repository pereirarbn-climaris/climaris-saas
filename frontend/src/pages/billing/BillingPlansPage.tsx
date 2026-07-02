import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Sparkles, XCircle } from "lucide-react";
import { dashboardTierLabel, type DashboardTier } from "../../lib/dashboardEntitlements";
import {
  cancelBillingSubscription,
  createBillingCheckout,
  createBillingPortal,
  fetchBillingPlans,
  resumeBillingSubscription,
  fetchBillingStatus,
  syncBillingSubscription,
  type BillingPlan,
  type BillingStatus,
} from "../../api/billing";
import { normalizePlanKey } from "../../lib/planRules";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./BillingPlansPage.module.css";

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function subscriptionLabel(status: string | null): string {
  const map: Record<string, string> = {
    active: "Ativa",
    trialing: "Período de teste",
    past_due: "Pagamento pendente",
    canceled: "Cancelada",
    unpaid: "Inadimplente",
    incomplete: "Incompleta",
  };
  return status ? (map[status] ?? status) : "Sem assinatura paga";
}

const FINANCE_LABELS: Record<string, string> = {
  basic: "Financeiro básico",
  intermediate: "Financeiro intermediário",
  management: "Gestão financeira completa",
};

const DASHBOARD_TIER_LABELS: Record<string, string> = {
  basic: "Básico",
  advanced: "Avançado",
  complete: "Completo",
};

function parseDashboardTier(raw: string | null): DashboardTier | null {
  if (raw === "basic" || raw === "advanced" || raw === "complete") return raw;
  return null;
}

function subscriptionStatusPillClass(status: BillingStatus | null): string {
  if (!status) return styles.statusPill;
  if (status.subscription_cancel_at_period_end) return `${styles.statusPill} ${styles.statusWarning}`;
  const s = (status.subscription_status ?? "").toLowerCase();
  if (s === "active" || s === "trialing") return `${styles.statusPill} ${styles.statusActive}`;
  if (s === "past_due" || s === "unpaid") return `${styles.statusPill} ${styles.statusWarning}`;
  if (s === "canceled") return `${styles.statusPill} ${styles.statusCanceled}`;
  return styles.statusPill;
}

export function BillingPlansPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const isAdmin = ctx?.user.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
  const [awaitingPlanSync, setAwaitingPlanSync] = useState(false);
  const highlightedPlanRef = useRef<HTMLElement | null>(null);

  const dashboardUpgradeTier = parseDashboardTier(searchParams.get("dashboard"));
  const highlightPlanKey = normalizePlanKey(searchParams.get("plan") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [p, s] = await Promise.all([fetchBillingPlans(), fetchBillingStatus()]);
      setPlans(p);
      setStatus(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar.");
      setPlans([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setMsg({ kind: "ok", text: "Pagamento recebido! Seu plano será atualizado em instantes." });
      setAwaitingPlanSync(true);
      setSearchParams({}, { replace: true });
      void load();
    } else if (checkout === "cancel") {
      setMsg({ kind: "err", text: "Checkout cancelado. Você pode tentar novamente quando quiser." });
      setSearchParams({}, { replace: true });
    } else if (checkout === "error") {
      setMsg({
        kind: "err",
        text: "Não foi possível abrir o pagamento automaticamente. Escolha o plano abaixo para tentar novamente.",
      });
      setSearchParams({}, { replace: true });
    }
  }, [load, searchParams, setSearchParams]);

  useEffect(() => {
    if (!awaitingPlanSync) return;

    let attempts = 0;
    const sync = async () => {
      attempts += 1;
      try {
        await syncBillingSubscription();
        const s = await fetchBillingStatus();
        setStatus(s);
        const key = normalizePlanKey(s.subscribed_plan_key ?? s.active_plan);
        if ((s.has_active_subscription && key !== "free_30d") || attempts >= 12) {
          setAwaitingPlanSync(false);
          if (s.has_active_subscription && key !== "free_30d") {
            setMsg({ kind: "ok", text: "Plano ativado com sucesso!" });
          }
        }
      } catch {
        if (attempts >= 12) setAwaitingPlanSync(false);
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 2500);
    return () => window.clearInterval(timer);
  }, [awaitingPlanSync]);

  const effectivePlanKey = normalizePlanKey(status?.subscribed_plan_key ?? status?.active_plan ?? "");
  const hasPaidAccess = Boolean(status?.has_paid_access);

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name)),
    [plans],
  );

  useEffect(() => {
    if (!dashboardUpgradeTier || !highlightPlanKey || loading) return;
    const el = highlightedPlanRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [dashboardUpgradeTier, highlightPlanKey, loading, sortedPlans.length]);

  async function onSubscribe(planKey: string) {
    if (!isAdmin) return;
    setMsg(null);
    setBusyPlan(planKey);
    try {
      const result = await createBillingCheckout(planKey);
      if (result.upgraded_in_place) {
        setMsg({
          kind: "ok",
          text: "Plano alterado na assinatura atual com rateio proporcional (proration).",
        });
        await load();
        setBusyPlan(null);
        return;
      }
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      throw new Error("Resposta de checkout inválida.");
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao iniciar checkout." });
      setBusyPlan(null);
    }
  }

  async function onPortal() {
    if (!isAdmin) return;
    setMsg(null);
    setPortalLoading(true);
    try {
      const url = await createBillingPortal();
      window.location.href = url;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao abrir portal." });
      setPortalLoading(false);
    }
  }

  async function onCancelSubscription() {
    if (!isAdmin) return;
    const ends = status?.subscription_ends_at
      ? fmtDate(status.subscription_ends_at)
      : status?.subscription_current_period_end
        ? fmtDate(status.subscription_current_period_end)
        : "o fim do período atual";
    const ok = window.confirm(
      `Cancelar a assinatura do plano ${status?.active_plan_label ?? ""}? Você mantém o acesso até ${ends}.`,
    );
    if (!ok) return;
    setMsg(null);
    setSubscriptionActionLoading(true);
    try {
      const result = await cancelBillingSubscription();
      setMsg({ kind: "ok", text: result.message });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao cancelar assinatura." });
    } finally {
      setSubscriptionActionLoading(false);
    }
  }

  async function onResumeSubscription() {
    if (!isAdmin) return;
    setMsg(null);
    setSubscriptionActionLoading(true);
    try {
      const result = await resumeBillingSubscription();
      setMsg({ kind: "ok", text: result.message });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao reativar assinatura." });
    } finally {
      setSubscriptionActionLoading(false);
    }
  }

  function subscriptionStatusText(): string {
    if (!status) return "—";
    if (status.subscription_cancel_at_period_end) {
      const ends = status.subscription_ends_at ?? status.subscription_current_period_end;
      return ends ? `Cancela em ${fmtDate(ends)}` : "Cancelamento agendado";
    }
    return subscriptionLabel(status.subscription_status);
  }

  function planFeatures(plan: BillingPlan): string[] {
    const dashboard =
      plan.dashboard_label ??
      (plan.finance_max_mode === "basic"
        ? "Básico"
        : plan.finance_max_mode === "intermediate"
          ? "Avançado"
          : "Completo");
    return [
      FINANCE_LABELS[plan.finance_max_mode] ?? plan.finance_max_mode,
      `Dashboard gerencial: ${dashboard}`,
      plan.max_users != null ? `Até ${plan.max_users} usuários` : "Usuários ilimitados",
      "Gestão de OS e PMOC",
    ];
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Assinatura</p>
        <h1 className={styles.pageTitle}>Plano e cobrança</h1>
        <p className={styles.lead}>
          Escolha o plano de acesso do seu workspace. Cobrança mensal via Stripe (cartão), com cupons no checkout.
          Após o pagamento, o plano contratado é ativado na hora. Troca de plano com assinatura ativa usa rateio
          proporcional. Add-ons na <Link to="/app/marketplace">Loja de integrações</Link>.
        </p>
      </header>

      {status?.subscription_access_blocked ? (
        <p className={`${styles.alert} ${styles.alertErr}`} role="alert">
          {(status.subscription_status ?? "").toLowerCase() === "canceled"
            ? "Sua assinatura foi encerrada. Assine um plano abaixo para voltar a usar o sistema."
            : "Seu teste de 30 dias encerrou. Assine um plano abaixo para liberar o acesso ao sistema."}
        </p>
      ) : null}

      {status?.is_on_free_trial &&
      status.has_paid_access &&
      !status.has_active_subscription &&
      status.trial_days_remaining != null ? (
        <p className={`${styles.alert} ${styles.alertWarn}`} role="status">
          Teste gratuito: faltam {status.trial_days_remaining} dia(s)
          {status.trial_ends_at ? ` (até ${fmtDate(status.trial_ends_at)})` : ""}.
        </p>
      ) : null}

      {status ? (
        <section className={styles.currentPlan} aria-label="Plano atual">
          <div className={styles.currentPlanHead}>
            <div>
              <p className={styles.eyebrow}>Seu plano</p>
              <h2 className={styles.currentPlanTitle}>{status.active_plan_label}</h2>
              <p className={styles.currentPlanMeta}>
                {status.max_users != null ? `Até ${status.max_users} usuários` : "Usuários ilimitados"}
              </p>
            </div>
            <span className={subscriptionStatusPillClass(status)}>{subscriptionStatusText()}</span>
          </div>
          {!status.subscription_cancel_at_period_end && status.subscription_current_period_end ? (
            <p className={styles.renewalNote}>
              Próxima renovação em {fmtDate(status.subscription_current_period_end)}
            </p>
          ) : null}
          {status.subscription_cancel_at_period_end ? (
            <p className={styles.cancelNotice} role="status">
              Seu plano continua ativo até{" "}
              {fmtDate(status.subscription_ends_at ?? status.subscription_current_period_end)}. Depois disso o workspace
              volta ao teste gratuito ou precisará assinar novamente.
            </p>
          ) : null}
          {isAdmin && status.stripe_configured && status.has_stripe_customer ? (
            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} disabled={portalLoading} onClick={() => void onPortal()}>
                <CreditCard size={15} aria-hidden />
                {portalLoading ? "Abrindo…" : "Alterar cartão"}
              </button>
              {status.has_active_subscription && status.subscription_cancel_at_period_end ? (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={subscriptionActionLoading}
                  onClick={() => void onResumeSubscription()}
                >
                  {subscriptionActionLoading ? "Processando…" : "Manter assinatura"}
                </button>
              ) : null}
              {status.has_active_subscription && !status.subscription_cancel_at_period_end ? (
                <button
                  type="button"
                  className={styles.btnCancel}
                  disabled={subscriptionActionLoading}
                  onClick={() => void onCancelSubscription()}
                >
                  <XCircle size={15} aria-hidden />
                  {subscriptionActionLoading ? "Processando…" : "Cancelar assinatura"}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {msg ? (
        <p
          className={`${styles.alert} ${msg.kind === "ok" ? styles.alertOk : styles.alertErr}`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}

      {dashboardUpgradeTier ? (
        <section className={styles.upgradeBanner} aria-label="Upgrade do dashboard">
          <div className={styles.upgradeBannerIcon} aria-hidden>
            <Sparkles size={20} />
          </div>
          <div>
            <p className={styles.upgradeBannerTitle}>
              Desbloqueie o Dashboard {dashboardTierLabel(dashboardUpgradeTier)}
            </p>
            <p className={styles.upgradeBannerText}>
              O plano destacado abaixo libera o painel gerencial{" "}
              {DASHBOARD_TIER_LABELS[dashboardUpgradeTier] ?? dashboardUpgradeTier} com todos os widgets e indicadores
              correspondentes.
            </p>
          </div>
        </section>
      ) : null}

      <section className={styles.plansSection} aria-label="Planos disponíveis">
        <div>
          <h2 className={styles.plansSectionTitle}>Planos disponíveis</h2>
          <p className={styles.plansSectionHint}>Valores mensais por workspace · cobrança via Stripe</p>
        </div>

        {loading ? (
          <div className={styles.loadingGrid} aria-busy="true" aria-label="Carregando planos">
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
        ) : null}

        {err ? <p className={`${styles.alert} ${styles.alertErr}`}>{err}</p> : null}

        {!loading && !err && sortedPlans.length === 0 ? (
          <p className={styles.emptyState}>
            Nenhum plano disponível para contratação online no momento. Entre em contato com o suporte Climaris.
          </p>
        ) : null}

        {!loading && !err && sortedPlans.length > 0 ? (
          <div className={styles.cardGrid}>
            {sortedPlans.map((plan) => {
              const planKey = normalizePlanKey(plan.plan_key);
              const isCurrent = hasPaidAccess && planKey === effectivePlanKey;
              const isHighlighted =
                Boolean(dashboardUpgradeTier) && highlightPlanKey !== "" && planKey === highlightPlanKey;
              const canSubscribe =
                isAdmin && status?.stripe_configured && (!isCurrent || status.subscription_access_blocked);
              const cardClass = [
                styles.planCard,
                isHighlighted ? styles.planCardFeatured : "",
                isCurrent ? styles.planCardCurrent : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <article
                  key={plan.plan_key}
                  ref={isHighlighted ? highlightedPlanRef : undefined}
                  className={cardClass}
                >
                  {isHighlighted ? (
                    <span className={`${styles.planBadge} ${styles.planBadgeFeatured}`}>
                      <Sparkles size={12} aria-hidden />
                      Recomendado
                    </span>
                  ) : isCurrent ? (
                    <span className={`${styles.planBadge} ${styles.planBadgeCurrent}`}>
                      <Check size={12} aria-hidden />
                      Plano atual
                    </span>
                  ) : (
                    <span className={`${styles.planBadge} ${styles.planBadgeSpacer}`} aria-hidden>
                      —
                    </span>
                  )}

                  <h3 className={styles.planName}>{plan.display_name}</h3>
                  {plan.description ? <p className={styles.planDesc}>{plan.description}</p> : null}

                  {plan.monthly_price_brl != null ? (
                    <div className={styles.priceBlock}>
                      <div>
                        <span className={styles.priceAmount}>{fmtMoney(plan.monthly_price_brl)}</span>
                        <span className={styles.pricePeriod}>/mês</span>
                      </div>
                      <p className={styles.priceSub}>por workspace · cobrança mensal</p>
                    </div>
                  ) : null}

                  <ul className={styles.featureList}>
                    {planFeatures(plan).map((feature) => (
                      <li key={feature} className={styles.featureItem}>
                        <Check className={styles.featureIcon} size={15} aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {plan.footnote ? <p className={styles.planFootnote}>{plan.footnote}</p> : null}

                  <div className={styles.planFooter}>
                    {isAdmin ? (
                      isCurrent ? (
                        <span className={styles.currentPlanLabel}>
                          <Check size={15} aria-hidden />
                          Plano atual
                        </span>
                      ) : canSubscribe ? (
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={busyPlan === plan.plan_key}
                          onClick={() => void onSubscribe(plan.plan_key)}
                        >
                          {busyPlan === plan.plan_key
                            ? "Processando…"
                            : status?.has_active_subscription && hasPaidAccess
                              ? "Alterar para este plano"
                              : "Assinar este plano"}
                        </button>
                      ) : null
                    ) : (
                      <p className={styles.adminNote}>Somente administradores podem alterar o plano.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
