import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isMercadoPagoHostedCheckoutUrl } from "../../lib/mercadopagoHostedCheckout";
import styles from "./FinanceMpEmbeddedCheckoutPage.module.css";

export function FinanceMpEmbeddedCheckoutPage() {
  const [params] = useSearchParams();
  const [showIframe, setShowIframe] = useState(false);
  const raw = params.get("checkout_url") || "";
  const checkoutUrl = useMemo(() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return "";
    }
  }, [raw]);

  const valid = checkoutUrl && isMercadoPagoHostedCheckoutUrl(checkoutUrl);

  return (
    <div className={styles.wrap}>
      <Link to="/app/finance" className={styles.back}>
        ← Voltar ao financeiro
      </Link>
      <h1 className={styles.title}>Checkout Mercado Pago</h1>
      {!checkoutUrl ? (
        <p className={styles.error}>URL de checkout ausente. Gere o link na tela de lançamentos e abra a partir dali.</p>
      ) : !valid ? (
        <p className={styles.error}>URL não permitida (apenas domínios Mercado Pago em HTTPS).</p>
      ) : (
        <>
          <div className={styles.ctaBlock}>
            <p className={styles.lead}>
              Recomendamos pagar em <strong>nova aba</strong>: o checkout do Mercado Pago costuma bloquear carregamento em
              iframes (cabeçalhos de segurança, extensões do navegador ou política do próprio MP).
            </p>
            <a className={styles.primaryCta} href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              Abrir checkout em nova aba
            </a>
            <p className={styles.hint}>
              Depois de concluir o pagamento, volte ao financeiro; o status do lançamento atualiza quando o Mercado Pago
              notificar o sistema.
            </p>
          </div>
          <div className={styles.iframeSection}>
            <button type="button" className={styles.toggleIframe} onClick={() => setShowIframe((v) => !v)}>
              {showIframe ? "Ocultar iframe nesta página" : "Mostrar iframe nesta página (opcional)"}
            </button>
            {!showIframe ? (
              <p className={styles.hint}>
                Se o iframe abaixo ficar em branco ou mostrar erro, ignore-o e use o botão &quot;Abrir checkout em nova
                aba&quot;.
              </p>
            ) : null}
            {showIframe ? (
              <div className={styles.frameWrap}>
                <iframe
                  title="Checkout Mercado Pago"
                  className={styles.frame}
                  src={checkoutUrl}
                  allow="payment *"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
