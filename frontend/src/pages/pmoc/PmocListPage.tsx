import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router-dom";
import { listPmocPlans, type PmocPlanOut, type PmocPlanStatus } from "../../api/pmoc";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./PmocPages.module.css";

function statusLabel(s: PmocPlanStatus): string {
  const m: Record<PmocPlanStatus, string> = {
    draft: "Rascunho",
    active: "Ativa",
    inactive: "Inativa",
    archived: "Arquivada",
  };
  return m[s] ?? s;
}

function statusClass(s: PmocPlanStatus): string {
  if (s === "active") return styles.badgeActive;
  if (s === "draft") return styles.badgeDraft;
  if (s === "archived") return styles.badgeArchived;
  return styles.badgeInactive;
}

function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

export type PmocListPreset = "all" | "active" | "inactive" | "draft" | "archived";

const STATUS_TAB_VALUES: PmocListPreset[] = ["all", "active", "inactive", "draft", "archived"];

const TAB_LABEL: Record<PmocListPreset, string> = {
  all: "Todos",
  active: "Ativas",
  inactive: "Inativas",
  draft: "Rascunhos",
  archived: "Arquivadas",
};

function presetFromSearch(statusParam: string | null): PmocListPreset {
  if (!statusParam) return "all";
  const s = statusParam.toLowerCase();
  if (s === "all") return "all";
  if (STATUS_TAB_VALUES.includes(s as PmocListPreset)) return s as PmocListPreset;
  return "all";
}

export function PmocListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = presetFromSearch(searchParams.get("status"));

  const [rows, setRows] = useState<PmocPlanOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  const statusParam = useMemo((): PmocPlanStatus | undefined => {
    if (preset === "all") return undefined;
    return preset;
  }, [preset]);

  const setPreset = useCallback(
    (next: PmocListPreset) => {
      if (next === "all") {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ status: next }, { replace: true });
      }
    },
    [setSearchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listPmocPlans({ status: statusParam, q: q.trim() || undefined, limit: 100 });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q, statusParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageHint = useMemo(() => {
    if (preset === "active") return "Planos com status ativo (vigente no endereço do cliente).";
    if (preset === "inactive") return "Planos inativos (histórico ou pausados).";
    if (preset === "draft") return "Rascunhos ainda não ativados.";
    if (preset === "archived") return "PMOC arquivados.";
    return "Todos os PMOC do workspace, Lei Federal nº 13.589/2018 e ANVISA.";
  }, [preset]);

  const canCreatePmoc =
    ctx?.user.role === "admin" || ctx?.user.role === "receptionist" || ctx?.user.role === "technician";

  if (!ctx) return <Navigate to="/login" replace />;

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>PMOC</h1>
            <p className={styles.lead}>
              {pageHint} Um PMOC por endereço (cliente), com fichas por equipamento. Soma de BTUs acima de 60.000 exige
              análise de ar e responsável técnico habilitado.
            </p>
          </div>
          {canCreatePmoc ? (
            <div className={styles.heroActions}>
              <Link to="/app/pmoc/new" className={styles.btnPrimary}>
                Nova PMOC
              </Link>
            </div>
          ) : null}
        </div>

        <div className={styles.subTabs} role="tablist" aria-label="Filtrar por status">
          {STATUS_TAB_VALUES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={preset === key}
              className={`${styles.subTab} ${preset === key ? styles.subTabActive : ""}`}
              onClick={() => setPreset(key)}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Busca</h2>
        <input
          className={loginStyles.input}
          placeholder="Buscar por título, cliente ou notas"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {err ? <p className={styles.msgErr}>{err}</p> : null}
        {loading ? <p className={styles.loading}>Carregando…</p> : null}
      </div>

      {!loading ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Lista</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Soma BTU</th>
                  <th>Ar (obr.)</th>
                  <th>Atualizado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.client?.name ?? "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                    </td>
                    <td>{formatBtu(r.total_btu_sum)}</td>
                    <td>{r.air_analysis_required ? "Sim" : "Não"}</td>
                    <td>{new Date(r.updated_at).toLocaleString("pt-BR")}</td>
                    <td>
                      <Link className={styles.rowLink} to={`/app/pmoc/${r.id}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      Nenhum PMOC nesta visão.{" "}
                      {canCreatePmoc ? (
                        <>
                          <Link className={styles.rowLink} to="/app/pmoc/new">
                            Criar nova PMOC
                          </Link>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
