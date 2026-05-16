import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getMercadoLivreOAuthAuthorizeUrl, getMercadoLivreStatus, type MercadoLivreStatusOut } from "../../api/mercadoLivre";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./MercadoLivreIntegrationPage.module.css";

function formatExp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function MercadoLivreIntegrationPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const canView = role === "admin" || role === "receptionist";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<MercadoLivreStatusOut | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr("");
    try {
      setSt(await getMercadoLivreStatus());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar status.");
      setSt(null);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConnect() {
    setBusy(true);
    setErr("");
    try {
      const url = await getMercadoLivreOAuthAuthorizeUrl();
      window.location.assign(url);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Não foi possível iniciar o OAuth. Verifique se o backend expõe GET /api/v1/integrations/mercado-livre/oauth/authorize-url e as variáveis MERCADO_LIVRE_*.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className={styles.page}>
        <p className={styles.lead}>Você não tem permissão para ver esta página.</p>
        <Link to="/app">Voltar ao painel</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Integrações</p>
        <h1 className={styles.title}>Mercado Livre</h1>
        <p className={styles.lead}>
          Publique produtos do estoque como anúncios e mantenha o add-on ativo na Loja de integrações. O OAuth redireciona
          para o Mercado Livre e retorna a esta aplicação.
        </p>
        <div className={styles.links}>
          <Link to="/app/products">Produtos</Link>
          <span aria-hidden>·</span>
          <Link to="/app/marketplace">Loja de integrações</Link>
        </div>
      </header>

      {err ? <div className={styles.err}>{err}</div> : null}

      {loading ? (
        <p className={styles.lead}>Carregando…</p>
      ) : st ? (
        <section className={styles.card}>
          <h2>Status da integração</h2>
          <div className={styles.row}>
            <span className={styles.label}>Add-on contratado</span>
            <span>{st.entitlement_active ? "Sim" : "Não"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>App OAuth no servidor</span>
            <span>{st.oauth_app_configured ? "Configurado" : "Pendente"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Conta conectada</span>
            <span>{st.connected ? `Sim (${st.nickname ?? st.ml_user_id ?? "—"})` : "Não"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Site</span>
            <span className={styles.mono}>{st.site_id ?? "—"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Token até</span>
            <span>{formatExp(st.access_expires_at)}</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} disabled={busy || !st.oauth_app_configured} onClick={() => void onConnect()}>
              {busy ? "Redirecionando…" : st.connected ? "Reconectar via Mercado Livre" : "Conectar via Mercado Livre"}
            </button>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void load()}>
              Atualizar
            </button>
          </div>
          {!st.entitlement_active ? (
            <p className={styles.lead} style={{ marginTop: "1rem" }}>
              Contrate o aplicativo <strong>mercado_livre</strong> na Loja de integrações para habilitar publicação e vínculos
              nos produtos.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
