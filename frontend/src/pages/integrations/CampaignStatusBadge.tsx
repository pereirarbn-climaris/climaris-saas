import styles from "./CampaignDashboard.module.css";
import { campaignStatusMeta, type StatusTone } from "./campaignDashboardUtils";

type Props = {
  status: string;
  pulse?: boolean;
};

const toneClass: Record<StatusTone, string> = {
  success: styles.badgeSuccess,
  info: styles.badgeInfo,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  neutral: styles.badgeNeutral,
};

export function CampaignStatusBadge({ status, pulse }: Props) {
  const meta = campaignStatusMeta(status);
  const showPulse = pulse ?? status === "running";
  return (
    <span
      className={`${styles.badge} ${toneClass[meta.tone]} ${showPulse ? styles.badgePulse : ""}`}
    >
      {showPulse ? <span className={styles.badgeDot} aria-hidden /> : null}
      {meta.label}
    </span>
  );
}
