import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { completeMercadoLivreOAuth } from "../../api/mercadoLivre";
import styles from "./MercadoLivreCallbackPage.module.css";

/**
 * OAuth redirect: Mercado Livre envia ?code=...&state=...
 * Completa no backend e volta para a página da integração.
 */
export function MercadoLivreCallbackPage() {
  const [params] = useSearchParams();
  const code = params.get("code");
  const err = params.get("error_description") || params.get("error");
  const [done, setDone] = useState(false);
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    if (err) {
      setLocalErr(err);
      return;
    }
    if (!code) {
      setLocalErr("Código de autorização ausente.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await completeMercadoLivreOAuth(code);
        if (!cancelled) setDone(true);
      } catch (e) {
        if (!cancelled) setLocalErr(e instanceof Error ? e.message : "Falha ao conectar.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, err]);

  if (done) {
    return <Navigate to="/app/integrations/mercado-livre" replace />;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Mercado Livre</h1>
        {localErr ? (
          <p className={styles.err}>{localErr}</p>
        ) : (
          <p className={styles.lead}>Conectando sua conta…</p>
        )}
      </div>
    </div>
  );
}
