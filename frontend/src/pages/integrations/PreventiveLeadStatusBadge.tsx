import type { PreventiveLead } from "../../api/preventiveMaintenance";
import { preventiveLeadStatusMeta } from "../../lib/preventiveLeadStatus";
import styles from "./CampaignDashboard.module.css";

type Props = { lead: PreventiveLead };

const toneClass = {
  info: styles.badgeInfo,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
} as const;

export function PreventiveLeadStatusBadge({ lead }: Props) {
  const meta = preventiveLeadStatusMeta(lead);
  return <span className={`${styles.badge} ${toneClass[meta.tone]}`}>{meta.label}</span>;
}
