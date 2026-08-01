import { Link } from "react-router-dom";
import { NavIconBox, NavIconHome, NavIconPackage, NavIconUsers, NavIconWrench } from "../../dashboard/NavIcons";
import styles from "./MobileBottomNavigation.module.css";

type Props = {
  isDashboardHomeRoute: boolean;
  isClientsRoute: boolean;
  isProductsRoute: boolean;
  isServicesRoute: boolean;
  mobileNavMenuOpen: boolean;
  onOpenMenu: () => void;
};

export function MobileBottomNavigation({
  isDashboardHomeRoute,
  isClientsRoute,
  isProductsRoute,
  isServicesRoute,
  mobileNavMenuOpen,
  onOpenMenu,
}: Props) {
  return (
    <nav className={styles.nav} aria-label="Navegação principal mobile">
      <Link to="/app" className={`${styles.item} ${isDashboardHomeRoute ? styles.itemActive : ""}`}>
        <NavIconHome className={styles.icon} />
        <span>Início</span>
      </Link>
      <Link to="/app/clients" className={`${styles.item} ${isClientsRoute ? styles.itemActive : ""}`}>
        <NavIconUsers className={styles.icon} />
        <span>Clientes</span>
      </Link>
      <Link to="/app/products" className={`${styles.item} ${isProductsRoute ? styles.itemActive : ""}`}>
        <NavIconBox className={styles.icon} />
        <span>Produtos</span>
      </Link>
      <Link to="/app/services" className={`${styles.item} ${isServicesRoute ? styles.itemActive : ""}`}>
        <NavIconWrench className={styles.icon} />
        <span>Serviços</span>
      </Link>
      <button
        type="button"
        className={`${styles.item} ${mobileNavMenuOpen ? styles.itemActive : ""}`}
        onClick={onOpenMenu}
      >
        <NavIconPackage className={styles.icon} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
