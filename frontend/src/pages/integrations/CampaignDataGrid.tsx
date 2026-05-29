import { BarChart3 } from "lucide-react";
import type { Campaign, CampaignCompareItem } from "../../api/whatsappCampaigns";
import { CampaignStatusBadge } from "./CampaignStatusBadge";
import styles from "./CampaignDashboard.module.css";
import { formatDate, formatShortDate, sendProgressPct } from "./campaignDashboardUtils";

type Props = {
  campaigns: Campaign[];
  conversionById: Map<number, number>;
  loading?: boolean;
  onReport: (campaign: Campaign) => void;
};

export function CampaignDataGrid({ campaigns, conversionById, loading, onReport }: Props) {
  if (loading) {
    return (
      <div className={styles.panelCard}>
        <p className={styles.hint}>Carregando campanhas…</p>
      </div>
    );
  }

  if (!campaigns.length) {
    return (
      <div className={`${styles.panelCard} ${styles.emptyState}`}>
        <div className={styles.emptyIcon}>
          <BarChart3 size={28} strokeWidth={1.75} />
        </div>
        <h3>Nenhuma campanha enviada ainda</h3>
        <p>Quando você disparar sua primeira campanha, ela aparecerá aqui com progresso e taxa de conversão.</p>
      </div>
    );
  }

  return (
    <div className={styles.dataGrid} role="table" aria-label="Campanhas">
      <div className={styles.dataGridHead} role="row">
        <span role="columnheader">Campanha</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Progresso</span>
        <span role="columnheader">Conversão</span>
        <span role="columnheader">Data</span>
        <span role="columnheader" style={{ textAlign: "right" }}>
          Ações
        </span>
      </div>
      {campaigns.map((c) => {
        const pct = sendProgressPct(c);
        const conversion = conversionById.get(c.id);
        return (
          <div key={c.id} className={styles.dataGridRow} role="row">
            <div className={styles.cellCampaign} role="cell">
              <strong>{c.name}</strong>
              <span>#{c.id}</span>
            </div>
            <div role="cell">
              <CampaignStatusBadge status={c.status} />
              {c.status === "scheduled" && c.scheduled_at ? (
                <span className={styles.scheduledAtHint} title={formatDate(c.scheduled_at)}>
                  {formatDate(c.scheduled_at)}
                </span>
              ) : null}
            </div>
            <div className={styles.cellProgress} role="cell">
              <span>
                {c.sent_count}/{c.total_contacts || "—"}
              </span>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div role="cell">
              {conversion != null ? (
                <span className={styles.conversionPct}>{conversion}%</span>
              ) : (
                <span className={styles.hint} style={{ margin: 0 }}>
                  —
                </span>
              )}
            </div>
            <div role="cell">
              <span title={formatDate(c.created_at)}>{formatShortDate(c.created_at)}</span>
            </div>
            <div className={`${styles.cellActions}`} role="cell">
              <button type="button" className={styles.btnGhost} onClick={() => onReport(c)}>
                <BarChart3 size={15} />
                Ver relatório
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function buildConversionMap(compare: CampaignCompareItem[]): Map<number, number> {
  return new Map(compare.map((r) => [r.campaign_id, r.conversion_rate]));
}
