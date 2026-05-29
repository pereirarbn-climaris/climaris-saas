import { X } from "lucide-react";
import type { Campaign, CampaignAnalytics, CampaignCompareItem } from "../../api/whatsappCampaigns";
import { CampaignStatusBadge } from "./CampaignStatusBadge";
import styles from "./CampaignDashboard.module.css";
import { formatDate } from "./campaignDashboardUtils";

type Props = {
  campaign: Campaign | null;
  analytics: CampaignAnalytics | null;
  compareData: CampaignCompareItem[];
  loading: boolean;
  onClose: () => void;
};

function DrawerSkeleton() {
  return (
    <div className={styles.drawerSkeleton} aria-busy="true" aria-label="Carregando relatório">
      <div className={`${styles.skeletonBlock} ${styles.skeletonTall}`} />
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonWide}`} />
    </div>
  );
}

type FunnelStep = { key: string; label: string; value: number; pct: number };

function buildFunnel(analytics: CampaignAnalytics): FunnelStep[] {
  const sent = analytics.total_enviados ?? analytics.funnel?.sent ?? 0;
  const delivered = analytics.funnel?.delivered ?? 0;
  const read = analytics.total_lidos ?? analytics.funnel?.read ?? 0;
  const osClosed = analytics.total_os_fechadas ?? analytics.funnel?.os_closed ?? 0;
  const base = Math.max(sent, 1);
  return [
    { key: "sent", label: "Enviados", value: sent, pct: 100 },
    { key: "delivered", label: "Entregues", value: delivered, pct: Math.round((delivered / base) * 100) },
    { key: "read", label: "Lidos", value: read, pct: Math.round((read / base) * 100) },
    { key: "os", label: "OS fechadas", value: osClosed, pct: Math.round((osClosed / base) * 100) },
  ];
}

function VisualFunnel({ steps }: { steps: FunnelStep[] }) {
  const widths = [100, 82, 64, 46];
  return (
    <div className={styles.funnelVisual} role="img" aria-label="Funil de conversão">
      {steps.map((step, i) => (
        <div key={step.key} className={styles.funnelStage}>
          <div
            className={styles.funnelStageBar}
            style={{ width: `${widths[i] ?? 40}%` }}
          >
            <span className={styles.funnelStageLabel}>{step.label}</span>
            <span className={styles.funnelStageValue}>{step.value}</span>
          </div>
          <span className={styles.funnelStagePct}>{step.pct}% do enviado</span>
        </div>
      ))}
    </div>
  );
}

export function CampaignDetailDrawer({ campaign, analytics, compareData, loading, onClose }: Props) {
  if (!campaign) return null;

  const funnelSteps = analytics ? buildFunnel(analytics) : [];
  const maxCompareRate = Math.max(1, ...compareData.map((c) => c.conversion_rate));

  return (
    <>
      <div className={styles.drawerOverlay} role="presentation" onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-labelledby="campaign-detail-title">
        <header className={styles.drawerHeader}>
          <div>
            <div className={styles.drawerTitleRow}>
              <h2 id="campaign-detail-title">{campaign.name}</h2>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className={styles.hint} style={{ margin: 0 }}>
              Disparo em {formatDate(campaign.created_at)} · {campaign.sent_count}/{campaign.total_contacts} enviados
            </p>
          </div>
          <button type="button" className={styles.btnIcon} onClick={onClose} aria-label="Fechar detalhes">
            <X size={18} />
          </button>
        </header>
        <div className={styles.drawerBody}>
          {loading ? <DrawerSkeleton /> : null}

          {!loading && analytics ? (
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3 className={styles.analyticsCardTitle}>Funil de engajamento</h3>
                <VisualFunnel steps={funnelSteps} />
              </div>

              <div className={styles.analyticsCard}>
                <h3 className={styles.analyticsCardTitle}>Taxa de conversão</h3>
                <div className={styles.donutWrap}>
                  <div
                    className={styles.donut}
                    style={{
                      background: `conic-gradient(#0d9488 ${analytics.conversion_rate}%, #e2e8f0 0)`,
                    }}
                  >
                    <div className={styles.donutHole}>{analytics.conversion_rate}%</div>
                  </div>
                  <div>
                    <p className={styles.hint}>
                      <strong>{analytics.total_os_fechadas}</strong> OS de{" "}
                      <strong>{analytics.total_enviados}</strong> enviados
                    </p>
                    <p className={styles.hint}>
                      Janela de atribuição: {analytics.conversion_window_days} dias · Orçamentos:{" "}
                      <strong>{analytics.total_orcamentos}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.analyticsCard}>
                <h3 className={styles.analyticsCardTitle}>Clientes convertidos</h3>
                {analytics.clientes_convertidos.length ? (
                  <ul className={styles.convertedList}>
                    {analytics.clientes_convertidos.map((c) => (
                      <li key={`${c.client_id}-${c.interaction_type}-${c.interaction_at}`}>
                        <strong>{c.client_name}</strong>
                        <span className={styles.convertedMeta}>
                          {c.interaction_type === "budget_created" ? "Orçamento aprovado" : "OS fechada"}
                          {c.service_order_id ? ` · #${c.service_order_id}` : ""}
                          {c.service_order_title ? ` — ${c.service_order_title}` : ""}
                        </span>
                        {c.interaction_at ? (
                          <span className={styles.convertedDate}>{formatDate(c.interaction_at)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hint}>Nenhum cliente converteu nesta campanha no período.</p>
                )}
              </div>

              {compareData.length > 1 ? (
                <div className={styles.analyticsCard}>
                  <h3 className={styles.analyticsCardTitle}>Performance vs. outras campanhas</h3>
                  <div className={styles.compareBars}>
                    {compareData.map((row) => (
                      <div key={row.campaign_id} className={styles.compareRow}>
                        <span title={row.campaign_name}>{row.campaign_name}</span>
                        <div className={styles.funnelBarTrack}>
                          <div
                            className={styles.funnelBarFill}
                            style={{
                              width: `${Math.round((row.conversion_rate / maxCompareRate) * 100)}%`,
                              opacity: row.campaign_id === analytics.campaign_id ? 1 : 0.45,
                            }}
                          />
                        </div>
                        <span>{row.conversion_rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && !analytics ? (
            <p className={styles.hint}>Não foi possível carregar os dados de conversão.</p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

/** @deprecated Use CampaignDetailDrawer */
export const CampaignReportDrawer = CampaignDetailDrawer;
