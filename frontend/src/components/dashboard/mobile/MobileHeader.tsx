import { Link } from "react-router-dom";
import { NavIconUserCircle } from "../../dashboard/NavIcons";
import { PlatformBrandMark } from "../../branding/PlatformBrandMark";
import styles from "./MobileHeader.module.css";

type Props = {
  unreadNotifications: number;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
};

export function MobileHeader({ unreadNotifications, onOpenMenu, onOpenSearch, onOpenNotifications }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button type="button" className={styles.menuButton} aria-label="Abrir menu" onClick={onOpenMenu}>
          <span />
          <span />
          <span />
        </button>
        <Link to="/app" className={styles.logoLink}>
          <PlatformBrandMark variant="operacao" showName={false} className={styles.logo} />
        </Link>
      </div>

      <div className={styles.right}>
        <button type="button" className={styles.circleButton} aria-label="Pesquisar" onClick={onOpenSearch}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <button type="button" className={styles.circleButton} aria-label="Notificações" onClick={onOpenNotifications}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
            <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
          </svg>
          {unreadNotifications > 0 ? <span className={styles.badge} aria-hidden /> : null}
        </button>
        <Link className={styles.circleButton} to="/app/conta" aria-label="Perfil">
          <NavIconUserCircle />
        </Link>
      </div>
    </header>
  );
}
