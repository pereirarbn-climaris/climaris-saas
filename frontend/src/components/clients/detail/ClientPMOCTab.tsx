import { useMemo, useState } from "react";
import type { PmocPlanOut, PmocPlanStatus } from "../../../api/pmoc";
import type { ClientSiteOut } from "../../../api/clients";
import type { PMOCData } from "../../v0-ui/clients";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconPlus, IconShield } from "./icons";
import { EmptyState, formatDateBR, StatusPill } from "./shared";

const PLAN_STATUS_META: Record<PmocPlanStatus, { label: string; tone: "success" | "warning" | "danger" | "muted" | "primary" }> = {
  active: { label: "Ativo", tone: "success" },
  draft: { label: "Rascunho", tone: "muted" },
  inactive: { label: "Inativo", tone: "warning" },
  archived: { label: "Arquivado", tone: "danger" },
};

type Props = {
  pmocData?: PMOCData;
  plans: PmocPlanOut[];
  isNew: boolean;
  isPj: boolean;
  loading?: boolean;
  clientSites?: ClientSiteOut[];
  initialSiteFilter?: number | null;
  onGenerateNew?: () => void;
  onOpenPlan?: (plan: PmocPlanOut) => void;
};

export function ClientPMOCTab({
  pmocData,
  plans,
  isNew,
  isPj,
  loading,
  clientSites = [],
  initialSiteFilter,
  onGenerateNew,
  onOpenPlan,
}: Props) {
  const [siteFilter, setSiteFilter] = useState<"all" | number>(initialSiteFilter ?? "all");

  const filteredPlans = useMemo(() => {
    if (siteFilter === "all") return plans;
    return plans.filter((p) => p.client_site_id === siteFilter);
  }, [plans, siteFilter]);
  if (isNew) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <p className={styles.cardHint}>Salve o cliente para gerenciar planos PMOC.</p>
        </section>
      </div>
    );
  }

  if (!isPj) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <EmptyState message="PMOC é aplicável apenas a clientes Pessoa Jurídica." />
        </section>
      </div>
    );
  }

  const hasActive = pmocData && pmocData.status !== "sem_contrato";

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>
              <IconShield /> Contrato PMOC ativo
            </h3>
            <p className={styles.cardHint}>Plano de Manutenção, Operação e Controle vigente para este cliente.</p>
          </div>
          {onGenerateNew ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onGenerateNew}>
              <IconPlus /> Gerar PMOC
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className={styles.loading}>Carregando dados de PMOC…</p>
        ) : !hasActive ? (
          <EmptyState message="Nenhum plano PMOC ativo para este cliente." />
        ) : (
          <div className={styles.miniGrid}>
            <div className={styles.miniCard}>
              <span className={styles.miniCardLabel}>Plano</span>
              <span className={styles.miniCardValue} style={{ fontSize: "1rem" }}>
                {pmocData?.contrato ?? "—"}
              </span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniCardLabel}>Periodicidade</span>
              <span className={styles.miniCardValue} style={{ fontSize: "1rem" }}>
                Mensal
              </span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniCardLabel}>Próxima manutenção</span>
              <span className={styles.miniCardValue} style={{ fontSize: "1rem" }}>
                {pmocData?.proximaVisita ? formatDateBR(String(pmocData.proximaVisita)) : "—"}
              </span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniCardLabel}>Responsável técnico</span>
              <span className={styles.miniCardValue} style={{ fontSize: "1rem" }}>
                {pmocData?.responsavelTecnico ?? "—"}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>PMOCs gerados</h3>
            <p className={styles.cardHint}>Filtre por cliente completo ou por uma unidade/filial específica.</p>
          </div>
          {clientSites.length > 0 ? (
            <select
              className={`${styles.fieldSelect} ${styles.filterSelect}`}
              value={siteFilter === "all" ? "all" : String(siteFilter)}
              onChange={(e) => setSiteFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              aria-label="Filtrar PMOC por unidade"
            >
              <option value="all">Todas as unidades</option>
              {clientSites.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {filteredPlans.length === 0 ? (
          <EmptyState message="Nenhum PMOC gerado para este filtro." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Unidade</th>
                  <th>Status</th>
                  <th>Ativado em</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((p) => {
                  const meta = PLAN_STATUS_META[p.status] ?? { label: p.status, tone: "muted" as const };
                  const siteName = clientSites.find((s) => s.id === p.client_site_id)?.name;
                  return (
                    <tr key={p.id} style={{ cursor: onOpenPlan ? "pointer" : undefined }} onClick={() => onOpenPlan?.(p)}>
                      <td>{p.title}</td>
                      <td>{siteName ?? "Cliente (matriz)"}</td>
                      <td>
                        <StatusPill label={meta.label} tone={meta.tone} />
                      </td>
                      <td>{formatDateBR(p.activated_at)}</td>
                      <td>{p.responsible_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
