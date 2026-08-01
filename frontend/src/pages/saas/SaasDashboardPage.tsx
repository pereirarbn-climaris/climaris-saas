import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { TenantStatus } from "../../api/auth";
import { fetchPlatformBackupStatus, type PlatformBackupStatus } from "../../api/platformBackupStatus";
import { listPlatformMarketplaceEntitlements } from "../../api/platformMarketplace";
import { listPlatformSaasPlans } from "../../api/platformSaasPlans";
import { PLATFORM_ADMIN_EMAIL } from "../../lib/platformAdmin";
import type { PlatformAdminOutletContext } from "../platformAdminContext";
import styles from "./SaasDashboardPage.module.css";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

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
  const [backupStatus, setBackupStatus] = useState<PlatformBackupStatus | null>(null);
  const [backupStatusError, setBackupStatusError] = useState<string | null>(null);
  const [backupStatusLoading, setBackupStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchPlatformBackupStatus()
      .then((data) => {
        if (!cancelled) setBackupStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setBackupStatusError(err instanceof Error ? err.message : "Erro ao carregar status.");
      })
      .finally(() => {
        if (!cancelled) setBackupStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const backup = backupStatus?.backup ?? null;
  const verify = backupStatus?.verify ?? null;
  const deepCheck = backupStatus?.deep_check ?? null;
  const backupHasProblem = Boolean(backup && (!backup.ok || backup.stale));
  const backupHasWarning = Boolean(
    backup?.ok &&
      !backup.stale &&
      (backup.prune_warning || backup.storage_class_warning || (verify && !verify.ok) || (verify?.stale ?? false)),
  );
  const backupBadgeClass = !backupStatus?.available
    ? styles.badgeSuspended
    : backupHasProblem
      ? styles.badgeCancelled
      : backupHasWarning
        ? styles.badgeSuspended
        : styles.badgeActive;
  const backupBadgeLabel = !backupStatus?.available
    ? "Sem dados"
    : backupHasProblem
      ? "Falha"
      : backupHasWarning
        ? "Atenção"
        : "OK";

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
          <p className={styles.heroMeta}>
            <strong>Catálogo de bancos</strong> (logos e quais aparecem ao criar conta em Financeiro):{" "}
            <Link className={`${styles.link} ${styles.linkPrimary}`} to="/operacao/bancos">
              abrir configuração de bancos
            </Link>
            .
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
            <Link className={`${styles.link} ${styles.linkPrimary}`} to="/operacao/bancos">
              Bancos no wizard de contas
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

        <section className={styles.card} aria-labelledby="backup-status-title">
          <div className={styles.integrationHeader}>
            <h2 id="backup-status-title" className={styles.cardTitle} style={{ margin: 0 }}>
              Backup do sistema (S3)
            </h2>
            {backupStatusLoading ? null : <span className={`${styles.badge} ${backupBadgeClass}`}>{backupBadgeLabel}</span>}
          </div>
          {backupStatusLoading ? (
            <p className={styles.note}>Carregando status…</p>
          ) : backupStatusError ? (
            <p className={styles.note}>{backupStatusError}</p>
          ) : !backupStatus?.available ? (
            <p className={styles.note}>{backupStatus?.message || "Status ainda não publicado pelo host."}</p>
          ) : (
            <>
              <ul className={styles.metaList}>
                <li className={styles.metaRow}>
                  <span className={styles.metaKey}>Último backup</span>
                  <span className={styles.metaVal}>{formatDateTime(backup?.last_success_at)}</span>
                </li>
                <li className={styles.metaRow}>
                  <span className={styles.metaKey}>Snapshots retidos</span>
                  <span className={styles.metaVal}>{backup?.snapshot_count ?? "—"}</span>
                </li>
                <li className={styles.metaRow}>
                  <span className={styles.metaKey}>Verificação pós-backup</span>
                  <span className={styles.metaVal}>{verify?.ok ? "OK" : verify ? "Falhou" : "—"}</span>
                </li>
                <li className={styles.metaRow}>
                  <span className={styles.metaKey}>Verificação profunda (semanal)</span>
                  <span className={styles.metaVal}>{formatDateTime(deepCheck?.last_success_at)}</span>
                </li>
              </ul>
              {backup?.message ? <p className={styles.note} style={{ marginTop: "0.6rem" }}>{backup.message}</p> : null}
              {backup?.storage_class_warning ? (
                <p className={styles.formAlertWarn} style={{ marginTop: "0.6rem" }}>
                  {backup.storage_class_info?.non_standard_pct ?? 0}% dos objetos do repositório estão fora de STANDARD
                  (provável Glacier via lifecycle do bucket) — isso pode quebrar a retenção (prune) e atrasar restaurações
                  em caso de desastre. Ajuste o lifecycle do bucket de backup.
                </p>
              ) : null}
            </>
          )}
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
