import { usePlatformBranding } from "../../context/PlatformBrandingContext";
import dash from "../../pages/DashboardPage.module.css";
import styles from "./PlatformBrandMark.module.css";

const SnowflakeIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <polyline points="12,6 9,3" />
    <polyline points="12,6 15,3" />
    <polyline points="12,18 9,21" />
    <polyline points="12,18 15,21" />
    <polyline points="6,12 3,9" />
    <polyline points="6,12 3,15" />
    <polyline points="18,12 21,9" />
    <polyline points="18,12 21,15" />
  </svg>
);

export type PlatformBrandVariant = "sidebar" | "auth" | "auth-dark" | "operacao";

type Props = {
  variant?: PlatformBrandVariant;
  showName?: boolean;
  className?: string;
};

function markClass(variant: PlatformBrandVariant): string {
  if (variant === "operacao") return styles.markOperacao;
  if (variant === "auth" || variant === "auth-dark") return `${styles.markAuth} ${variant === "auth-dark" ? styles.markAuthDark : ""}`;
  return styles.markSidebar;
}

function nameClass(variant: PlatformBrandVariant): string {
  if (variant === "operacao") return styles.nameOperacao;
  if (variant === "auth" || variant === "auth-dark") {
    return `${styles.nameAuth} ${variant === "auth-dark" ? styles.nameAuthOnDark : ""}`;
  }
  return styles.nameSidebar;
}

export function PlatformBrandMark({ variant = "sidebar", showName = true, className }: Props) {
  const { branding, logoSrc } = usePlatformBranding();
  const hasLogo = branding.has_logo && Boolean(logoSrc);
  const initial = (branding.platform_name.trim()[0] ?? "C").toUpperCase();

  if (variant === "sidebar") {
    const rowClass = [
      dash.brandRow,
      showName ? styles.sidebarBrandExpanded : styles.sidebarBrandCollapsed,
      className,
    ]
      .filter(Boolean)
      .join(" ");
    const logoSrcWithCache =
      logoSrc && branding.logo_updated_at
        ? `${logoSrc}${logoSrc.includes("?") ? "&" : "?"}t=${encodeURIComponent(branding.logo_updated_at)}`
        : logoSrc;

    return (
      <div className={rowClass}>
        {hasLogo ? (
          <span
            className={`${styles.markWithLogo} ${showName ? "" : styles.markWithLogoCollapsed}`.trim()}
            aria-hidden
          >
            <img
              src={logoSrcWithCache}
              alt=""
              className={showName ? styles.logoImageSidebarExpanded : styles.logoImageSidebarCollapsed}
            />
          </span>
        ) : (
          <span className={dash.logoMark} aria-hidden />
        )}
        {showName ? <span className={dash.brandName}>{branding.platform_name}</span> : null}
      </div>
    );
  }

  const compactLogo = showName || variant === "operacao";
  const logoImgClass = compactLogo
    ? variant === "operacao"
      ? `${styles.logoImageIcon} ${styles.logoImageOperacao}`
      : `${styles.logoImageIcon} ${styles.logoImageAuth}`
    : `${styles.logoImageWide} ${styles.logoImageAuth}`;

  return (
    <div className={`${styles.row} ${className ?? ""}`.trim()}>
      {hasLogo ? (
        <span className={styles.markWithLogo} aria-hidden>
          <img src={logoSrc} alt="" className={logoImgClass} />
        </span>
      ) : (
        <span className={markClass(variant)} aria-hidden>
          {variant === "auth" ? (
            <SnowflakeIcon className={styles.snowflake} />
          ) : (
            <span className={styles.fallbackLetter}>{initial}</span>
          )}
        </span>
      )}
      {showName ? <span className={nameClass(variant)}>{branding.platform_name}</span> : null}
    </div>
  );
}
