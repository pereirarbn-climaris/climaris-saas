import type { DashboardTier } from "../../../lib/dashboardEntitlements";
import {
  dashboardTierDescription,
  dashboardTierLabel,
  hasDashboardTier,
} from "../../../lib/dashboardEntitlements";
import styles from "./DashboardManagement.module.css";

type DashboardTierBadgeProps = {
  tier: DashboardTier;
  showDescription?: boolean;
  onUpgradePreviewClick?: () => void;
};

const TIER_CLASS: Record<DashboardTier, string> = {
  basic: styles.tierBasic,
  advanced: styles.tierAdvanced,
  complete: styles.tierComplete,
};

export function DashboardTierBadge({
  tier,
  showDescription = true,
  onUpgradePreviewClick,
}: DashboardTierBadgeProps) {
  const showUpgradeLink =
    Boolean(onUpgradePreviewClick) && !hasDashboardTier(tier, "complete");

  return (
    <div className={styles.tierBadgeWrap}>
      <div className={styles.tierBadgeRow}>
        <span className={`${styles.tierBadge} ${TIER_CLASS[tier]}`}>
          Dashboard {dashboardTierLabel(tier)}
        </span>
        {showUpgradeLink ? (
          <button
            type="button"
            className={styles.tierUpgradeLink}
            onClick={onUpgradePreviewClick}
            aria-label={`Ver preview do dashboard ${tier === "basic" ? "avançado" : "completo"}`}
          >
            Próximo nível ↓
          </button>
        ) : null}
      </div>
      {showDescription ? (
        <p className={styles.tierDescription}>{dashboardTierDescription(tier)}</p>
      ) : null}
    </div>
  );
}
