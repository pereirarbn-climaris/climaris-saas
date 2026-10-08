import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getFinanceGateways } from "../../api/finance";
import styles from "./FinanceMpWalletBrickPage.module.css";

type MpBrickController = { unmount?: () => void };

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string; advancedFraudPrevention?: boolean },
    ) => {
      bricks: () => {
        create: (
          type: "wallet",
          containerId: string,
          settings: Record<string, unknown>,
        ) => Promise<MpBrickController>;
      };
    };
  }
}

function loadMercadoPagoSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mp-sdk="v2"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("mp_sdk")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.dataset.mpSdk = "v2";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("mp_sdk"));
    document.body.appendChild(s);
  });
}

export function FinanceMpWalletBrickPage() {
  const [params] = useSearchParams();
  const pref = useMemo(() => (params.get("preference_id") || "").trim(), [params]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const brickRef = useRef<MpBrickController | null>(null);
  const containerId = "mp-wallet-brick-root";

  const run = useCallback(async () => {
    setError(null);
    setLoading(true);
    brickRef.current?.unmount?.();
    brickRef.current = null;
    if (!pref || pref.length > 48) {
      setError("Parâmetro preference_id ausente ou inválido.");
      setLoading(false);
      return;
    }
    try {
      const gw = await getFinanceGateways();
      const pk = (gw.mercadopago.public_key || "").trim();
      if (!gw.mercadopago.connected || !pk) {
        setError("Mercado Pago não está configurado ou falta a chave pública. Configure em Contas e carteiras.");
        setLoading(false);
        return;
      }
      await loadMercadoPagoSdk();
      const Mp = window.MercadoPago;
      if (!Mp) {
        setError("Não foi possível carregar o SDK do Mercado Pago.");
        setLoading(false);
        return;
      }
      const mp = new Mp(pk, { locale: "pt-BR" });
      const bricksBuilder = mp.bricks();
      const el = document.getElementById(containerId);
      if (!el) {
        setError("Container do checkout não encontrado.");
        setLoading(false);
        return;
      }
      el.innerHTML = "";
      const ctrl = await bricksBuilder.create("wallet", containerId, {
        initialization: { preferenceId: pref },
        customization: { texts: { valueProp: "smart_option" } },
      });
      brickRef.current = ctrl;
    } catch {
      setError("Falha ao iniciar o checkout embutido. Use a opção de pagar em nova aba na tela de lançamentos.");
    } finally {
      setLoading(false);
    }
  }, [pref]);

  useEffect(() => {
    void run();
    return () => {
      brickRef.current?.unmount?.();
      brickRef.current = null;
    };
  }, [run]);

  return (
    <div className={styles.wrap}>
      <Link to="/app/finance" className={styles.back}>
        ← Voltar ao financeiro
      </Link>
      <h1 className={styles.title}>Pagar com Mercado Pago (checkout no site)</h1>
      <p className={styles.lead}>
        O bloco abaixo usa a <strong>Wallet Brick</strong> do Mercado Pago com a preferência já criada no ERP. É a
        alternativa ao redirecionamento para o domínio do MP, quando suportado pelo navegador e pela conta.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Carregando checkout…</p> : null}
      <div id={containerId} className={styles.walletMount} />
    </div>
  );
}
