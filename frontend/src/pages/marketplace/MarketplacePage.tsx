import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelMarketplaceRequest,
  fetchMarketplaceCatalog,
  fetchMyMarketplaceEntitlements,
  requestMarketplaceApp,
  type MarketplaceCatalogItem,
  type MarketplaceMyEntitlement,
} from "../../api/marketplace";
import type { DashboardOutletContext } from "../dashboardContext";
import { useOutletContext } from "react-router-dom";
import styles from "./MarketplacePage.module.css";

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusClass(status: string): string {
  if (status === "active") return `${styles.statusPill} ${styles.statusActive}`;
  if (status === "requested") return `${styles.statusPill} ${styles.statusRequested}`;
  return styles.statusPill;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    requested: "Solicitado",
    active: "Ativo",
    suspended: "Suspenso",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

function financeSalesPitchBySlug(slug: string): { headline: string; bullets: string[] } | null {
  if (slug === "finance-intermediate") {
    return {
      headline: "Ideal para sair do básico sem ir para gestão completa.",
      bullets: [
        "Categorias e análises avançadas por tipo de movimentação",
        "Mais controle para contas a pagar/receber em operação diária",
        "Upgrade rápido sem trocar o plano principal da empresa",
      ],
    };
  }
  if (slug === "finance-management") {
    return {
      headline: "Pacote completo para gestão financeira profissional.",
      bullets: [
        "Visão financeira avançada para tomada de decisão",
        "Operação completa com foco em resultado e margem",
        "Perfeito para empresas que querem escalar com controle",
      ],
    };
  }
  return null;
}

function integrationConfigPath(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (normalized === "mercado-livre" || normalized === "mercado_livre") {
    return "/app/integrations/mercado-livre";
  }
  if (normalized === "whatsapp-oficial" || normalized === "whatsapp") {
    return "/app/integrations/whatsapp";
  }
  return null;
}

export function MarketplacePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const isAdmin = ctx?.user.role === "admin";

  const [catalog, setCatalog] = useState<MarketplaceCatalogItem[]>([]);
  const [mine, setMine] = useState<MarketplaceMyEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [requestingSlug, setRequestingSlug] = useState<string | null>(null);
  const [cancellingEntitlementId, setCancellingEntitlementId] = useState<number | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [quantityBySlug, setQuantityBySlug] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [c, m] = await Promise.all([fetchMarketplaceCatalog(), fetchMyMarketplaceEntitlements()]);
      setCatalog(c);
      setMine(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar.");
      setCatalog([]);
      setMine([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mineBySlug = useMemo(() => {
    const map = new Map<string, MarketplaceMyEntitlement>();
    for (const row of mine) map.set(row.slug, row);
    return map;
  }, [mine]);

  async function onRequest(slug: string, quantity: number) {
    if (!isAdmin) return;
    setMsg(null);
    setRequestingSlug(slug);
    try {
      await requestMarketplaceApp({ slug, quantity });
      setMsg({
        kind: "ok",
        text: "Solicitação registrada. Nossa equipe entrará em contato para cobrança e liberação do módulo.",
      });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao solicitar." });
    } finally {
      setRequestingSlug(null);
    }
  }

  async function onCancelRequest(entitlementId: number) {
    if (!isAdmin) return;
    if (!window.confirm("Cancelar esta solicitação? Você poderá solicitar de novo depois no catálogo.")) {
      return;
    }
    setMsg(null);
    setCancellingEntitlementId(entitlementId);
    try {
      await cancelMarketplaceRequest(entitlementId);
      setMsg({ kind: "ok", text: "Solicitação cancelada." });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao cancelar solicitação." });
    } finally {
      setCancellingEntitlementId(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        Contrate serviços e módulos pagos para o seu workspace (ex.: WhatsApp oficial e acessos extras por usuário). Os valores são
        referência comercial; a confirmação e o faturamento são tratados pela equipe Climaris após a solicitação.
      </p>

      {loading ? (
        <p className={styles.lead}>Carregando catálogo…</p>
      ) : err ? (
        <p className={styles.err} role="alert">
          {err}
        </p>
      ) : null}

      {msg?.kind === "ok" ? (
        <p className={styles.ok} role="status">
          {msg.text}
        </p>
      ) : null}
      {msg?.kind === "err" ? (
        <p className={styles.err} role="alert">
          {msg.text}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="mine-heading">
        <h2 id="mine-heading">Suas integrações</h2>
        {mine.length === 0 ? (
          <p className={styles.note}>Nenhuma integração contratada ainda.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Integração</th>
                <th>Qtd</th>
                <th>Status</th>
                <th>Solicitado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((row) => {
                const canCancelRow = isAdmin && row.status === "requested";
                const configHref = row.status === "active" ? integrationConfigPath(row.slug) : null;
                return (
                  <tr key={row.id}>
                    <td>{row.display_name}</td>
                    <td>{row.quantity}</td>
                    <td>
                      <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                    </td>
                    <td>{new Date(row.requested_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>
                      <div className={styles.tableActions}>
                        {configHref ? (
                          <Link to={configHref} className={styles.btnGhost}>
                            Configurar
                          </Link>
                        ) : null}
                        {canCancelRow ? (
                          <button
                            type="button"
                            className={styles.btnCancel}
                            onClick={() => void onCancelRequest(row.id)}
                            disabled={cancellingEntitlementId === row.id}
                          >
                            {cancellingEntitlementId === row.id ? "Cancelando…" : "Cancelar"}
                          </button>
                        ) : null}
                        {!configHref && !canCancelRow ? <span className={styles.mutedEmDash}>—</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Catálogo</h2>
        <div className={styles.cardGrid}>
          {catalog.map((item) => {
            const ent = mineBySlug.get(item.slug);
            const hasEntitlement = Boolean(item.entitlement_id);
            const canRequest = isAdmin && (!hasEntitlement || (item.allow_quantity && ent?.status === "active"));
            const canCancelRequest = isAdmin && Boolean(ent && ent.status === "requested");
            const configPath = integrationConfigPath(item.slug);
            const canConfigure = Boolean(ent && ent.status === "active" && configPath);
            const open = expandedSlug === item.slug;
            const salesPitch = financeSalesPitchBySlug(item.slug);
            const quantityRaw = quantityBySlug[item.slug] ?? "1";
            const quantity = Math.max(1, Number.parseInt(quantityRaw || "1", 10) || 1);
            return (
              <article key={item.id} className={styles.card}>
                <h3 className={styles.cardTitle}>{item.display_name}</h3>
                <p className={styles.cardDesc}>{item.short_description}</p>
                {salesPitch ? (
                  <div className={styles.salesBox}>
                    <p className={styles.salesHeadline}>{salesPitch.headline}</p>
                    <ul className={styles.salesList}>
                      {salesPitch.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className={styles.priceRow}>
                  <span className={styles.priceStrong}>{fmtMoney(item.monthly_price_brl)}</span>
                  <span> / mês</span>
                  {item.setup_fee_brl > 0 ? (
                    <span>
                      {" "}
                      + setup {fmtMoney(item.setup_fee_brl)}
                    </span>
                  ) : null}
                </div>
                {hasEntitlement && ent ? (
                  <p className={styles.note}>
                    Status: <span className={statusClass(ent.status)}>{statusLabel(ent.status)}</span>
                  </p>
                ) : null}
                {!isAdmin ? (
                  <p className={styles.note}>Apenas administradores do workspace podem solicitar integrações.</p>
                ) : null}
                {item.allow_quantity ? (
                  <div className={styles.actions}>
                    <label className={styles.note}>
                      Quantidade ({item.unit_label ?? "unidades"}):
                      <input
                        type="number"
                        min={1}
                        value={quantityRaw}
                        onChange={(e) =>
                          setQuantityBySlug((prev) => ({
                            ...prev,
                            [item.slug]: e.target.value,
                          }))
                        }
                        className={styles.btnGhost}
                        style={{ marginLeft: 8, width: 92 }}
                      />
                    </label>
                  </div>
                ) : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} onClick={() => setExpandedSlug(open ? null : item.slug)}>
                    {open ? "Ocultar detalhes" : "Detalhes"}
                  </button>
                  {canConfigure && configPath ? (
                    <Link to={configPath} className={styles.btnGhost}>
                      Configurar
                    </Link>
                  ) : null}
                  {canCancelRequest && ent ? (
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={() => void onCancelRequest(ent.id)}
                      disabled={cancellingEntitlementId === ent.id}
                    >
                      {cancellingEntitlementId === ent.id ? "Cancelando…" : "Cancelar"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={!canRequest || requestingSlug === item.slug}
                    onClick={() => void onRequest(item.slug, quantity)}
                  >
                    {requestingSlug === item.slug
                      ? "Enviando…"
                      : hasEntitlement
                        ? item.allow_quantity
                          ? ent?.status === "active"
                            ? "Comprar mais unidades"
                            : "Solicitado"
                          : ent?.status === "active"
                            ? "Integração ativa"
                            : "Solicitado"
                        : "Solicitar integração"}
                  </button>
                </div>
                {open && item.long_description ? <p className={styles.longDesc}>{item.long_description}</p> : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
