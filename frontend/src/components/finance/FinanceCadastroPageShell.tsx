import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import styles from "./FinanceCadastroPageShell.module.css";

export type FinanceCadastroNavLink = {
  to: string;
  label: string;
  active?: boolean;
};

type Props = {
  breadcrumb: string;
  title: string;
  subtitle: string;
  backTo?: { to: string; label: string };
  navLinks?: FinanceCadastroNavLink[];
  actions?: ReactNode;
  error?: string | null;
  msg?: string | null;
  children: ReactNode;
};

export function FinanceCadastroPageShell({
  breadcrumb,
  title,
  subtitle,
  backTo = { to: "/app/finance/settings", label: "Configurações" },
  navLinks,
  actions,
  error,
  msg,
  children,
}: Props) {
  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.breadcrumb}>{breadcrumb}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{subtitle}</p>
        </div>
        <div className={styles.heroActions}>
          {navLinks?.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`${styles.navLink} ${link.active ? styles.navLinkActive : ""}`}
              aria-current={link.active ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          {actions}
          <Link to={backTo.to} className={styles.backLink}>
            <ArrowLeft aria-hidden />
            {backTo.label}
          </Link>
        </div>
      </header>

      {(error || msg) && (
        <div className={styles.flashRow}>
          {error ? (
            <div className={styles.flashError} role="alert">
              <TriangleAlert aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}
          {msg ? (
            <div className={styles.flashOk} role="status">
              <CheckCircle2 aria-hidden />
              <span>{msg}</span>
            </div>
          ) : null}
        </div>
      )}

      <div className={styles.content}>{children}</div>
    </section>
  );
}

export { styles as financeCadastroShellStyles };
