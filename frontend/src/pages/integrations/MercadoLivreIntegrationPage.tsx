import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  disconnectMercadoLivre,
  getMercadoLivreOAuthUrl,
  getMercadoLivreStatus,
  listMercadoLivreListings,
  searchMercadoLivreCategories,
  syncMercadoLivreStock,
  type DomainDiscoveryRow,
  type MercadoLivreListing,
  type MercadoLivreStatus,
} from "../../api/mercadoLivre";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./MercadoLivreIntegrationPage.module.css";

function syncLabel(s: string): string {
  const m: Record<string, string> = {
    draft: "Rascunho",
    publishing: "Publicando",
    active: "Ativo",
    paused: "Pausado",
    error: "Erro",
  };
  return m[s] ?? s;
}

export function MercadoLivreIntegrationPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const isAdmin = ctx?.user.role === "admin";

  const [status, setStatus] = useState<MercadoLivreStatus | null>(null);
  const [rows, setRows] = useState<MercadoLivreListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [qDiscovery, setQDiscovery] = useState("");
  const [discovery, setDiscovery] = useState<DomainDiscoveryRow[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await getMercadoLivreStatus();
      setStatus(s);
      if (s.entitlement_active) {
        const list = await listMercadoLivreListings();
        setRows(list);
      } else {
        setRows([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setStatus(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = qDiscovery.trim();
    if (t.length < 2) {
      setDiscovery([]);
      return;
    }
    const h = window.setTimeout(() => {
      setDiscoveryLoading(true);
      void searchMercadoLivreCategories(t)
        .then(setDiscovery)
        .catch(() => setDiscovery([]))
        .finally(() => setDiscoveryLoading(false));
    }, 380);
    return () => window.clearTimeout(h);
  }, [qDiscovery]);

  async function onConnect() {
    if (!isAdmin) return;
    setConnecting(true);
    setErr("");
    try {
      const { authorization_url } = await getMercadoLivreOAuthUrl();
      window.location.assign(authorization_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível iniciar.");
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    if (!isAdmin || !window.confirm("Desconectar conta Mercado Livre deste workspace?")) return;
    setDisconnecting(true);
    setErr("");
    try {
      await disconnectMercadoLivre();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function onSync(productId: number) {
    setSyncingId(productId);
    setErr("");
    try {
      await syncMercadoLivreStock(productId);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setSyncingId(null);
    }
  }

  const entitlementOk = status?.entitlement_active;
  const oauthOk = status?.oauth_app_configured;
  const connected = status?.connected;

  /** Só acessa as configurações técnicas após o módulo estar ativo (aprovado) na Loja. */
  if (!loading && status && !entitlementOk) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Integração de vendas</p>
            <h1 className={styles.heroTitle}>Mercado Livre</h1>
            <p className={styles.heroLead}>
              As configurações da integração ficam disponíveis após a aprovação e liberação do módulo na Loja de integrações.
            </p>
          </div>
        </header>
        {err ? (
          <p className={styles.errBox} role="alert">
            {err}
          </p>
        ) : null}
        <section className={styles.card} style={{ maxWidth: "min(36rem, 100%)" }}>
          <h2 className={styles.cardTitle}>Acesso bloqueado</h2>
          <p className={styles.hint}>
            Se você já solicitou o add-on, aguarde a equipe aprovar. Quando o status passar a <strong>Ativo</strong> na loja, volte
            aqui pelo atalho <strong>Configurar</strong> no card do Mercado Livre.
          </p>
          <p className={styles.hint}>
            <Link to="/app/marketplace">Abrir a Loja de integrações</Link>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Integração de vendas</p>
          <h1 className={styles.heroTitle}>Mercado Livre</h1>
          <p className={styles.heroLead}>
            Conecte sua conta de vendedor, envie fotos nos produtos e publique anúncios com preço e estoque alinhados ao ERP.
            A sincronização de pedidos pode ser expandida em etapas seguintes.
          </p>
        </div>
      </header>

      {err ? (
        <p className={styles.errBox} role="alert">
          {err}
        </p>
      ) : null}

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Add-on e servidor</h2>
          <div className={styles.row}>
            <span className={`${styles.badge} ${entitlementOk ? styles.badgeOk : styles.badgeWarn}`}>
              {entitlementOk ? "Integração contratada" : "Add-on não ativo"}
            </span>
            <span className={`${styles.badge} ${oauthOk ? styles.badgeOk : styles.badgeErr}`}>
              {oauthOk ? "OAuth servidor OK" : "Credenciais ML ausentes"}
            </span>
          </div>
          {!entitlementOk ? (
            <p className={styles.hint}>
              Ative o módulo na <Link to="/app/marketplace">Loja de integrações</Link>. Depois volte aqui para conectar sua conta.
            </p>
          ) : (
            <p className={styles.hint}>O servidor precisa das variáveis MERCADO_LIVRE_CLIENT_ID e MERCADO_LIVRE_CLIENT_SECRET (e redirect URI compatível).</p>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Conta do vendedor</h2>
          {loading ? (
            <p className={styles.hint}>Carregando…</p>
          ) : (
            <>
              <div className={styles.row}>
                <span className={`${styles.badge} ${connected ? styles.badgeOk : styles.badgeWarn}`}>
                  {connected ? `Conectado: ${status?.nickname ?? status?.ml_user_id ?? "conta ML"}` : "Não conectado"}
                </span>
                {status?.access_expires_at ? (
                  <span className={styles.hint} style={{ margin: 0 }}>
                    Token até {new Date(status.access_expires_at).toLocaleString("pt-BR")}
                  </span>
                ) : null}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.btnPrimary} disabled={!entitlementOk || !isAdmin || connecting} onClick={() => void onConnect()}>
                  {connecting ? "Redirecionando…" : connected ? "Reautorizar conta" : "Conectar com Mercado Livre"}
                </button>
                {connected && isAdmin ? (
                  <button type="button" className={styles.btnDanger} disabled={disconnecting} onClick={() => void onDisconnect()}>
                    {disconnecting ? "…" : "Desconectar"}
                  </button>
                ) : null}
              </div>
              {!isAdmin ? <p className={styles.hint}>Apenas administradores podem autorizar ou desconectar.</p> : null}
            </>
          )}
        </section>
      </div>

      <section className={styles.card} style={{ marginBottom: "1.75rem" }}>
        <h2 className={styles.cardTitle}>Buscar categoria Mercado Livre</h2>
        <p className={styles.hint}>Use termos como &quot;geladeira&quot; ou &quot;furadeira&quot;. Copie o category_id ao configurar o produto antes de publicar.</p>
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            placeholder="Digite pelo menos 2 caracteres…"
            value={qDiscovery}
            onChange={(e) => setQDiscovery(e.target.value)}
            aria-label="Busca de categoria"
          />
          {discoveryLoading ? <span className={styles.hint}>Buscando…</span> : null}
        </div>
        {discovery.length > 0 ? (
          <ul className={styles.discoveryList}>
            {discovery.map((d, i) => (
              <li key={`${d.category_id ?? i}-${i}`} className={styles.discoveryItem}>
                <strong>{d.category_name ?? d.domain_name ?? "Categoria"}</strong>
                <div>
                  <code>{d.category_id ?? "—"}</code>
                  {d.domain_name ? <span> · {d.domain_name}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : qDiscovery.trim().length >= 2 && !discoveryLoading ? (
          <p className={styles.hint}>Nenhum resultado. Tente outro termo.</p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Produtos vinculados</h2>
        <p className={styles.hint}>
          Cadastre imagens em cada produto, defina categoria na tela do produto (vinculação) e publique. Depois use &quot;Sincronizar estoque&quot; após mudanças no ERP.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Status</th>
                <th>Anúncio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "1rem", color: "var(--color-text-muted)" }}>
                    Nenhuma vinculação ainda. Ao publicar um produto, ele aparecerá aqui.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.product_name}</td>
                    <td>{r.product_sku}</td>
                    <td>
                      <span className={styles.syncPill}>{syncLabel(r.sync_status)}</span>
                      {r.last_error ? (
                        <div style={{ fontSize: "0.72rem", color: "#b91c1c", marginTop: "0.25rem" }}>{r.last_error.slice(0, 120)}…</div>
                      ) : null}
                    </td>
                    <td>
                      {r.permalink ? (
                        <a className={styles.linkMl} href={r.permalink} target="_blank" rel="noopener noreferrer">
                          Abrir no ML
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {r.ml_item_id ? (
                        <button type="button" className={styles.btnGhost} disabled={syncingId === r.product_id} onClick={() => void onSync(r.product_id)}>
                          {syncingId === r.product_id ? "Sincronizando…" : "Sincronizar estoque"}
                        </button>
                      ) : (
                        <Link className={styles.linkMl} to={`/app/products/${r.product_id}`}>
                          Configurar produto
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
