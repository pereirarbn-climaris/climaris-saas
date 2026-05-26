import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router-dom";
import { listPmocPlans, type PmocPlanOut, type PmocPlanStatus } from "../../api/pmoc";
import { pmocEstablishmentLabel, pmocSiteLocationHint } from "../../lib/pmocEstablishment";
import type { DashboardOutletContext } from "../dashboardContext";
import listUi from "../../components/pmoc/PmocListUi.module.css";
import tableStyles from "../listTableCommon.module.css";
import pageStyles from "./PmocPages.module.css";

// ─── types ────────────────────────────────────────────────────────────────────
export type PmocListPreset = "all" | "active" | "inactive" | "draft" | "archived";

// ─── helpers ──────────────────────────────────────────────────────────────────
function statusLabel(s: PmocPlanStatus): string {
  const m: Record<PmocPlanStatus, string> = {
    draft: "Rascunho", active: "Ativa", inactive: "Inativa", archived: "Arquivada",
  };
  return m[s] ?? s;
}

function statusClass(s: PmocPlanStatus): string {
  if (s === "active")   return listUi.badgeActive;
  if (s === "draft")    return listUi.badgeDraft;
  if (s === "archived") return listUi.badgeArchived;
  return listUi.badgeInactive;
}

export function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

export function presetFromSearch(statusParam: string | null): PmocListPreset {
  if (!statusParam) return "all";
  const s = statusParam.toLowerCase();
  const valid: PmocListPreset[] = ["all", "active", "inactive", "draft", "archived"];
  return valid.includes(s as PmocListPreset) ? (s as PmocListPreset) : "all";
}

const TAB_LABEL: Record<PmocListPreset, string> = {
  all: "Todos", active: "Ativas", inactive: "Inativas", draft: "Rascunhos", archived: "Arquivadas",
};
const STATUS_TABS: PmocListPreset[] = ["all", "active", "inactive", "draft", "archived"];

// ─── skeleton ─────────────────────────────────────────────────────────────────
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {[160, 120, 120, 70, 80, 60, 100, 32].map((w, j) => (
            <td key={j}>
              <div style={{
                height: "1.125rem", width: `${w}px`, borderRadius: "0.375rem",
                background: "linear-gradient(90deg,#f1f5f9 0%,#e2e8f0 50%,#f1f5f9 100%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.2s ease-in-out infinite",
              }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string; value: string; hint: string;
  iconColor: string; iconBg: string; icon: ReactNode;
}

function StatCard({ label, value, hint, iconColor, iconBg, icon }: StatCardProps) {
  return (
    <article className={pageStyles.statCard}>
      <div className={pageStyles.statHead}>
        <div>
          <p className={pageStyles.statLabel}>{label}</p>
          <p className={pageStyles.statValue}>{value}</p>
        </div>
        <span className={pageStyles.statIconWrap} aria-hidden style={{ color: iconColor, background: iconBg }}>
          <svg viewBox="0 0 24 24">{icon}</svg>
        </span>
      </div>
      <p className={pageStyles.statHint}>{hint}</p>
    </article>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export function PmocListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = presetFromSearch(searchParams.get("status"));

  // ── state ──────────────────────────────────────────────────────────────────
  const [allRows, setAllRows]       = useState<PmocPlanOut[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err,     setErr]           = useState("");
  const [input,   setInput]         = useState("");
  const [q,       setQ]             = useState("");

  // ── debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  // ── URL-based status tab ─────────────────────────────────────────────────────
  const setPreset = useCallback((next: PmocListPreset) => {
    next === "all"
      ? setSearchParams({}, { replace: true })
      : setSearchParams({ status: next }, { replace: true });
  }, [setSearchParams]);

  // ── fetch all, filter client-side ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listPmocPlans({ limit: 200 });
      setAllRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    allRows.length,
    active:   allRows.filter((r) => r.status === "active").length,
    draft:    allRows.filter((r) => r.status === "draft").length,
    inactive: allRows.filter((r) => r.status === "inactive" || r.status === "archived").length,
  }), [allRows]);

  // ── filtered rows ────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const lq = q.toLowerCase();
    return allRows.filter((r) => {
      if (preset !== "all" && r.status !== preset) return false;
      if (lq) {
        const matchTitle = r.title.toLowerCase().includes(lq);
        const matchClient = (r.client?.name ?? "").toLowerCase().includes(lq);
        const matchSite = pmocEstablishmentLabel(r).toLowerCase().includes(lq);
        if (!matchTitle && !matchClient && !matchSite) return false;
      }
      return true;
    });
  }, [allRows, preset, q]);

  const canCreatePmoc =
    ctx?.user.role === "admin" || ctx?.user.role === "receptionist" || ctx?.user.role === "technician";

  if (!ctx) return <Navigate to="/login" replace />;

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      maxWidth: "80rem", margin: "0 auto", width: "100%",
      display: "flex", flexDirection: "column",
      gap: "var(--space-6,1.5rem)", padding: "var(--space-6,1.5rem)",
    }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4,1rem)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text,#0f172a)", letterSpacing: "-0.025em" }}>
            PMOC
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "var(--font-size-md,0.9375rem)", color: "var(--color-text-muted,#64748b)", maxWidth: "72ch", lineHeight: 1.5 }}>
            Plano de Manutenção, Operação e Controle — Lei Federal nº 13.589/2018 e ANVISA. Soma acima de 60.000 BTUs exige análise de ar e responsável técnico habilitado.
          </p>
        </div>
        {canCreatePmoc ? (
          <Link className={tableStyles.listToolbarBtnPrimary} to="/app/pmoc/new">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "1.125rem", height: "1.125rem" }}>
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            Nova PMOC
          </Link>
        ) : null}
      </header>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className={pageStyles.heroStatsGrid}>
        <StatCard
          label="Total de PMOCs"
          value={loading ? "—" : String(stats.total)}
          hint="planos cadastrados"
          iconColor="#0284c7"
          iconBg="linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%)"
          icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></>}
        />
        <StatCard
          label="Planos Ativos"
          value={loading ? "—" : String(stats.active)}
          hint="vigentes no cliente"
          iconColor="#16a34a"
          iconBg="linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%)"
          icon={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></>}
        />
        <StatCard
          label="Rascunhos"
          value={loading ? "—" : String(stats.draft)}
          hint="aguardando ativação"
          iconColor="#d97706"
          iconBg="linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)"
          icon={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
        />
        <StatCard
          label="Inativas / Arquivadas"
          value={loading ? "—" : String(stats.inactive)}
          hint="histórico ou pausados"
          iconColor="#64748b"
          iconBg="linear-gradient(135deg,#f1f5f9 0%,#e2e8f0 100%)"
          icon={<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className={tableStyles.listToolbar}>
        {/* Search */}
        <div className={tableStyles.listToolbarSearchCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="pmoc-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="pmoc-search"
              className={tableStyles.listToolbarSearchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Buscar por título, cliente ou obra"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Status tabs + refresh */}
        <div className={tableStyles.listToolbarActions}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2,0.5rem)" }}>
            <label className={tableStyles.listToolbarLabel}>Status</label>
            <div style={{ display: "inline-flex", flexWrap: "wrap", gap: "0.35rem" }} role="tablist" aria-label="Filtrar por status">
              {STATUS_TABS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={preset === key}
                  className={pageStyles[preset === key ? "statusTabActive" : "statusTab"]}
                  onClick={() => setPreset(key)}
                >
                  {TAB_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={tableStyles.listToolbarBtnGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Feedback ────────────────────────────────────────────────────────── */}
      {err ? (
        <p role="alert" style={{ margin: 0, padding: "0.75rem 1rem", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.75rem", fontSize: "0.9375rem" }}>
          {err}
        </p>
      ) : null}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Título</th>
              <th>Cliente</th>
              <th>Obra / Unidade</th>
              <th>Status</th>
              <th>Soma BTU</th>
              <th>Ar obr.</th>
              <th>Atualizado</th>
              <th className={tableStyles.tailCol} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                  <div>
                    <svg viewBox="0 0 24 24" style={{ width: "2.5rem", height: "2.5rem", stroke: "#cbd5e1", fill: "none", strokeWidth: 1.5, margin: "0 auto 0.75rem", display: "block" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    </svg>
                    <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Nenhum PMOC nesta visão</p>
                    {canCreatePmoc ? (
                      <Link to="/app/pmoc/new" style={{ color: "var(--color-primary,#0284c7)", fontWeight: 500 }}>
                        Criar novo PMOC
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={tableStyles.rowClickable}
                  role="link"
                  tabIndex={0}
                  onClick={() => { window.location.href = `/app/pmoc/${r.id}`; }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.location.href = `/app/pmoc/${r.id}`; } }}
                  aria-label={`Abrir PMOC: ${r.title}`}
                >
                  <td style={{ fontWeight: 500, color: "var(--color-text,#0f172a)" }}>{r.title}</td>
                  <td>{r.client?.name ?? "—"}</td>
                  <td>
                    <span style={{ fontWeight: 500, color: "var(--color-text,#0f172a)" }}>
                      {pmocEstablishmentLabel(r)}
                    </span>
                    {pmocSiteLocationHint(r) ? (
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
                        {pmocSiteLocationHint(r)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`${listUi.badge} ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td>
                    {r.total_btu_sum > 0 ? (
                      <span className={pageStyles.btuPill}>{formatBtu(r.total_btu_sum)}</span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>Sem equip.</span>
                    )}
                  </td>
                  <td>
                    {r.air_analysis_required ? (
                      <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "0.75rem" }}>Sim ⚠</span>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Não</span>
                    )}
                  </td>
                  <td style={{ color: "#64748b", fontSize: "0.875rem" }}>
                    {new Date(r.updated_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className={`${tableStyles.tailCol} ${tableStyles.rowHint}`} aria-hidden>
                    <span className={tableStyles.rowHintIcon}>
                      <svg viewBox="0 0 20 20" fill="none">
                        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Rodapé ─────────────────────────────────────────────────────────── */}
      {!loading && rows.length > 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-sm,0.8125rem)", color: "var(--color-text-muted,#64748b)" }}>
          Mostrando {rows.length} de {allRows.length} plano{allRows.length === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
