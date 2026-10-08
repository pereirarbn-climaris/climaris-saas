import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { TenantStatus } from "../../api/auth";
import { listPlatformMarketplaceEntitlements } from "../../api/platformMarketplace";
import { listPlatformSaasPlans } from "../../api/platformSaasPlans";
import { PLATFORM_ADMIN_EMAIL } from "../../lib/platformAdmin";
import type { PlatformAdminOutletContext } from "../platformAdminContext";
import styles from "./SaasDashboardPage.module.css";

function statusLabel(status: TenantStatus): string {
  switch (status) {
    case "active":
      return "Ativa";
    case "suspended":
      return "Suspensa";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function statusClass(status: TenantStatus): string {
  switch (status) {
    case "active":
      return styles.badgeActive;
    case "suspended":
      return styles.badgeSuspended;
    case "cancelled":
      return styles.badgeCancelled;
    default:
      return styles.badgeActive;
  }
}

export function SaasDashboardPage() {
  const ctx = useOutletContext<PlatformAdminOutletContext | undefined>();
  const [pendingAddons, setPendingAddons] = useState<number | null>(null);
  const [matrixPlans, setMatrixPlans] = useState<
    Array<{ plan_key: string; display_name: string; description: string; footnote: string }>
  >([]);
  const [matrixLoading, setMatrixLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listPlatformMarketplaceEntitlements({ status: "requested", limit: 200 })
      .then((rows) => {
        if (!cancelled) setPendingAddons(rows.length);
      })
      .catch(() => {
        if (!cancelled) setPendingAddons(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listPlatformSaasPlans({ for_matrix: true })
      .then((rows) => {
        if (!cancelled) {
          setMatrixPlans(
            rows.map((r) => ({
              plan_key: r.plan_key,
              display_name: r.display_name,
              description: r.description,
              footnote: r.footnote,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setMatrixPlans([]);
      })
      .finally(() => {
        if (!cancelled) setMatrixLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ctx) {
    return null;
  }

  const { user, tenant } = ctx;
  const st = tenant ? (tenant.status as TenantStatus) : null;

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard} aria-labelledby="saas-panel-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Climaris · Operação</p>
          <h1 id="saas-panel-title" className={styles.heroTitle}>
            Administração do produto SaaS
          </h1>
          <p className={styles.heroLead}>
            Este ambiente é exclusivo da equipe de operação da Climaris. Ele não é o aplicativo usado pelas empresas
            clientes — aquele fica em <strong>/app</strong> com outro login (workspace de cliente).
          </p>
          <p className={styles.heroMeta}>
            Sessão: <strong>{user.full_name}</strong> ({user.email})
          </p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>

      <section className={styles.contactCard} aria-labelledby="saas-contact-title">
        <div>
          <h2 id="saas-contact-title" className={styles.contactLabel}>
            Contato institucional
          </h2>
          <p className={styles.contactEmail}>
            <a href={`mailto:${PLATFORM_ADMIN_EMAIL}`}>{PLATFORM_ADMIN_EMAIL}</a>
          </p>
          <p className={styles.contactHint}>
            Canal oficial para assuntos de produto, parcerias e suporte à operação da plataforma.
          </p>
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={styles.card} aria-labelledby="saas-workspace-title">
          <h2 id="saas-workspace-title" className={styles.cardTitle}>
            Workspace vinculado ao token
          </h2>
          {!tenant ? (
            <p className={styles.note}>
              Não foi possível carregar os dados do tenant (API indisponível ou sessão sem workspace). Isso não impede o
              uso do painel de operação.
            </p>
          ) : (
            <ul className={styles.metaList}>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Empresa</span>
                <span className={styles.metaVal}>{tenant.name}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Plano</span>
                <span className={styles.metaVal}>{tenant.active_plan || "—"}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Fuso</span>
                <span className={styles.metaVal}>{tenant.timezone}</span>
              </li>
              {st ? (
                <li className={styles.metaRow}>
                  <span className={styles.metaKey}>Situação</span>
                  <span className={styles.metaVal}>
                    <span className={`${styles.badge} ${statusClass(st)}`}>{statusLabel(st)}</span>
                  </span>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section className={`${styles.card} ${styles.section}`} aria-labelledby="saas-tools-title">
          <h2 id="saas-tools-title" className={styles.cardTitle}>
            Acesso rápido
          </h2>
          <div className={styles.linkGrid}>
            <Link className={`${styles.link} ${styles.linkPrimary} ${styles.linkRow}`} to="/operacao/loja">
              <span>Loja & liberações</span>
              {pendingAddons != null && pendingAddons > 0 ? (
                <span className={styles.badgeNotify} title="Solicitações aguardando liberação">
                  {pendingAddons}
                </span>
              ) : null}
            </Link>
            <a className={`${styles.link} ${styles.linkPrimary}`} href="/docs" target="_blank" rel="noopener noreferrer">
              Documentação da API
            </a>
            <a className={`${styles.link} ${styles.linkPrimary}`} href="/health" target="_blank" rel="noopener noreferrer">
              Status / health
            </a>
          </div>
          <p className={styles.note}>
            O app para empresas (clientes, OS, agenda, etc.) permanece em <code className={styles.inlineCode}>/app</code>{" "}
            e exige usuário de workspace de cliente — não use esta conta de operação lá.
          </p>
        </section>
      </div>

      <section className={styles.card} aria-labelledby="finance-access-matrix-title">
        <h2 id="finance-access-matrix-title" className={styles.cardTitle}>
          Matriz de acesso financeiro por plano
        </h2>
        {matrixLoading ? (
          <p className={styles.note}>Carregando matriz…</p>
        ) : matrixPlans.length === 0 ? (
          <p className={styles.note}>
            Nenhum plano configurado para a matriz ou API indisponível. Edite em{" "}
            <Link className={`${styles.link} ${styles.linkPrimary}`} to="/operacao/planos">
              Planos SaaS
            </Link>
            .
          </p>
        ) : (
          <div className={styles.financeMatrix}>
            {matrixPlans.map((p) => (
              <article key={p.plan_key} className={styles.financeMatrixCard}>
                <h3>{p.display_name}</h3>
                <p>{p.description || "—"}</p>
                <span>{p.footnote || "—"}</span>
              </article>
            ))}
          </div>
        )}
        <p className={styles.note}>
          Quando o cliente quiser subir o nível financeiro sem troca de plano principal, use a Loja & liberações para contratar os add-ons{" "}
          <code className={styles.inlineCode}>finance-intermediate</code> ou{" "}
          <code className={styles.inlineCode}>finance-management</code>. Textos e tetos por plano são editáveis em{" "}
          <Link className={`${styles.link} ${styles.linkPrimary}`} to="/operacao/planos">
            Planos SaaS
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
