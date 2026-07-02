import { useNavigate } from "react-router-dom";
import {
  getDashboardUpgradeOffer,
  upgradeCtaLabel,
  upgradeTierBadgeLabel,
  type DashboardUpgradeOffer,
} from "../../../lib/dashboardUpgradeFeatures";
import type { DashboardTier } from "../../../lib/dashboardEntitlements";
import styles from "./DashboardManagement.module.css";

type DashboardUpgradePreviewProps = {
  currentTier: DashboardTier;
  canUpgrade?: boolean;
};

function FeaturePreviewMock({ featureId }: { featureId: string }) {
  switch (featureId) {
    case "extended-kpis":
      return (
        <div className={styles.upgradeMockKpis} aria-hidden>
          {["OS concl.", "Orçamentos", "Hoje", "Cresc."].map((label) => (
            <div key={label} className={styles.upgradeMockKpi}>
              <span className={styles.upgradeMockKpiLabel}>{label}</span>
              <span className={styles.upgradeMockKpiValue}>•••</span>
            </div>
          ))}
        </div>
      );
    case "revenue-targets":
    case "executive-chart":
      return (
        <div className={styles.upgradeMockChart} aria-hidden>
          {[40, 65, 50, 80, 70, 90].map((h, i) => (
            <span key={i} className={styles.upgradeMockBar} style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    case "quick-actions":
      return (
        <div className={styles.upgradeMockActions} aria-hidden>
          {["OS", "Orç.", "Agenda"].map((label) => (
            <span key={label} className={styles.upgradeMockAction}>
              {label}
            </span>
          ))}
        </div>
      );
    case "order-breakdown":
      return (
        <div className={styles.upgradeMockBars} aria-hidden>
          {["Pendentes", "Agendadas", "Em and."].map((label, i) => (
            <div key={label} className={styles.upgradeMockBarRow}>
              <span>{label}</span>
              <span className={styles.upgradeMockBarTrack}>
                <span className={styles.upgradeMockBarFill} style={{ width: `${70 - i * 18}%` }} />
              </span>
            </div>
          ))}
        </div>
      );
    case "upcoming-schedules":
      return (
        <div className={styles.upgradeMockList} aria-hidden>
          {["09:00 · Cliente A", "14:30 · Cliente B"].map((row) => (
            <div key={row} className={styles.upgradeMockListRow}>
              {row}
            </div>
          ))}
        </div>
      );
    case "executive-summary":
      return (
        <div className={styles.upgradeMockExecutive} aria-hidden>
          {["Faturamento", "Conversão", "PMOC"].map((label) => (
            <div key={label} className={styles.upgradeMockExecutiveCell}>
              <span>{label}</span>
              <strong>R$ •••</strong>
            </div>
          ))}
        </div>
      );
    case "financial-snapshot":
      return (
        <div className={styles.upgradeMockFinance} aria-hidden>
          {["A receber", "A pagar", "Saldo"].map((label) => (
            <div key={label} className={styles.upgradeMockFinanceCell}>
              <span>{label}</span>
              <strong>•••</strong>
            </div>
          ))}
        </div>
      );
    case "team-workload":
      return (
        <div className={styles.upgradeMockList} aria-hidden>
          {["João · 3 visitas", "Maria · 2 visitas"].map((row) => (
            <div key={row} className={styles.upgradeMockListRow}>
              {row}
            </div>
          ))}
        </div>
      );
    case "pmoc-compliance":
      return (
        <div className={styles.upgradeMockExecutive} aria-hidden>
          {["Planos ativos", "Ocorrências"].map((label) => (
            <div key={label} className={styles.upgradeMockExecutiveCell}>
              <span>{label}</span>
              <strong>••</strong>
            </div>
          ))}
        </div>
      );
    default:
      return <div className={styles.upgradeMockPlaceholder} aria-hidden />;
  }
}

function UpgradeFeatureCard({ feature }: { feature: DashboardUpgradeOffer["features"][number] }) {
  return (
    <article className={styles.upgradeFeatureCard}>
      <div className={styles.upgradeFeaturePreview}>
        <FeaturePreviewMock featureId={feature.id} />
        <div className={styles.upgradeFeatureLock} aria-hidden>
          <span className={styles.upgradeLockIcon}>🔒</span>
        </div>
      </div>
      <div className={styles.upgradeFeatureBody}>
        <span className={styles.upgradeFeatureIcon} aria-hidden>
          {feature.icon}
        </span>
        <h4 className={styles.upgradeFeatureTitle}>{feature.title}</h4>
        <p className={styles.upgradeFeatureDesc}>{feature.description}</p>
      </div>
    </article>
  );
}

export function DashboardUpgradePreview({ currentTier, canUpgrade = true }: DashboardUpgradePreviewProps) {
  const navigate = useNavigate();
  const offer = getDashboardUpgradeOffer(currentTier);
  if (!offer) return null;

  const handleUpgrade = () => {
    navigate(`/app/planos?dashboard=${offer.targetTier}&plan=${offer.targetPlanKey}`);
  };

  return (
    <section
      id="dashboard-upgrade-preview"
      className={styles.upgradeSection}
      aria-labelledby="dashboard-upgrade-title"
      tabIndex={-1}
    >
      <div className={styles.upgradeHeader}>
        <div>
          <span className={styles.upgradeTargetBadge}>{upgradeTierBadgeLabel(offer)}</span>
          <h3 id="dashboard-upgrade-title" className={styles.upgradeTitle}>
            {offer.headline}
          </h3>
          <p className={styles.upgradeSubheadline}>{offer.subheadline}</p>
        </div>
        {canUpgrade ? (
          <button type="button" className={styles.upgradeCta} onClick={handleUpgrade}>
            {upgradeCtaLabel(offer)}
          </button>
        ) : (
          <p className={styles.upgradeAdminHint}>
            Peça ao administrador do workspace para avaliar o plano {offer.targetPlanLabel}.
          </p>
        )}
      </div>

      <div className={styles.upgradeFeatureGrid}>
        {offer.features.map((feature) => (
          <UpgradeFeatureCard key={feature.id} feature={feature} />
        ))}
      </div>

      {canUpgrade ? (
        <p className={styles.upgradeFootnote}>
          Disponível no plano <strong>{offer.targetPlanLabel}</strong>. Você está no Dashboard{" "}
          {currentTier === "basic" ? "Básico" : "Avançado"}.
        </p>
      ) : null}
    </section>
  );
}
