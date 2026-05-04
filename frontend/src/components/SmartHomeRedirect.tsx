import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser } from "../api/auth";
import { clearAccessToken, getAccessToken } from "../lib/authStorage";
import { isPlatformOperatorUser } from "../lib/platformAdmin";

/**
 * Redireciona para `/operacao` (admin da plataforma) ou `/app` (clientes), conforme o e-mail da sessão.
 */
export function SmartHomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getAccessToken()) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const u = await fetchCurrentUser();
        if (cancelled) return;
        navigate(isPlatformOperatorUser(u) ? "/operacao" : "/app", { replace: true });
      } catch {
        if (!cancelled) {
          clearAccessToken();
          navigate("/login", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--color-surface)",
        color: "var(--color-text-muted)",
        fontSize: "0.9375rem",
      }}
    >
      Carregando…
    </div>
  );
}
