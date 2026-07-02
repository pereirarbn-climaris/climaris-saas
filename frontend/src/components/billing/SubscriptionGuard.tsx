import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { TenantOut } from "../../api/auth";
import styles from "../../pages/marketplace/MarketplacePage.module.css";

const ALLOWED_PREFIXES = ["/app/planos"];

function isAllowedWhileBlocked(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function SubscriptionGuard({
  tenant,
  children,
}: {
  tenant: TenantOut | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const blocked = Boolean(tenant?.subscription_access_blocked);

  useEffect(() => {
    if (!blocked || isAllowedWhileBlocked(location.pathname)) return;
    navigate("/app/planos", { replace: true, state: { blocked: true } });
  }, [blocked, location.pathname, navigate]);

  if (!blocked || isAllowedWhileBlocked(location.pathname)) {
    return <>{children}</>;
  }

  const canceled = (tenant?.subscription_status ?? "").toLowerCase() === "canceled";
  const message = canceled
    ? "Sua assinatura foi encerrada. Assine um plano para voltar a usar o Climaris."
    : "Seu período de teste encerrou ou o plano não está ativo. Assine para continuar usando o Climaris.";

  return (
    <div className={styles.wrap}>
      <p className={styles.err} role="alert">
        {message}
      </p>
      <Link to="/app/planos" className={styles.btnPrimary} style={{ display: "inline-flex", textDecoration: "none" }}>
        Ver planos e assinar
      </Link>
    </div>
  );
}
