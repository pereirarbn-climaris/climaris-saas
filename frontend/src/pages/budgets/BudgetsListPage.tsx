import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  approveBudget,
  fetchBudgetPdfBlob,
  listBudgetsWithAlerts,
  rejectBudget,
  sendBudget,
  type BudgetOut,
  type BudgetStatus,
} from "../../api/budgets";
import { listClients } from "../../api/clients";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./BudgetsListPage.module.css";

// ─── helpers ──────────────────────────────────────────────────────────────────
function statusLabel(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: "Rascunho", sent: "Enviado", approved: "Aprovado",
    rejected: "Reprovado", expired: "Expirado",
  };
  return map[status] ?? status;
}

function statusClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: styles.statusDraft, sent: styles.statusSent, approved: styles.statusApproved,
    rejected: styles.statusRejected, expired: styles.statusExpired,
  };
  return map[status] ?? styles.statusDraft;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function budgetGrandTotal(row: BudgetOut): number {
  const services = row.service_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const products = row.product_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return services + products;
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden>{children}</svg>;
}

// ─── skeleton ─────────────────────────────────────────────────────────────────
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {[120, 120, 80, 80, 90, 110, 80].map((w, j) => (
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

// ─── main ─────────────────────────────────────────────────────────────────────
export function BudgetsListPage() {
  const ctx       = useOutletContext<DashboardOutletContext | undefined>();
  const navigate  = useNavigate();
  const canEdit   = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [allRows,      setAllRows]      = useState<BudgetOut[]>([]);
  const [clientsMap,   setClientsMap]   = useState<Map<number, string>>(new Map());
  const [statusFilter, setStatusFilter] = useState<"all" | BudgetStatus>("all");
  const [searchInput,  setSearchInput]  = useState("");
  const [searchQ,      setSearchQ]      = useState("");
  const [loading,      setLoading]      = useState(true);
  const [busyId,       setBusyId]       = useState<number | null>(null);
  const [msg,          setMsg]          = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // PDF preview
  const [previewOpen,     setPreviewOpen]     = useState(false);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewUrl,      setPreviewUrl]      = useState<string | null>(null);
  const [previewBudgetId, setPreviewBudgetId] = useState<number | null>(null);

  // ── search debounce ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ── fetch (always all, filter client-side) ───────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [{ items: budgets }, clients] = await Promise.all([
        listBudgetsWithAlerts({ limit: 100 }),
        listClients({ limit: 200 }),
      ]);
      setAllRows(budgets);
      setClientsMap(new Map(clients.map((c) => [c.id, c.name])));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar orçamentos." });
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // ── stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    allRows.length,
    emAberto: allRows.filter((r) => r.status === "draft" || r.status === "sent").length,
    aprovados:allRows.filter((r) => r.status === "approved").length,
    reprovados: allRows.filter((r) => r.status === "rejected" || r.status === "expired").length,
  }), [allRows]);

  // ── filtered rows ────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = searchQ.toLowerCase();
    return allRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (q) {
        const clientName = (clientsMap.get(row.client_id) ?? "").toLowerCase();
        const obs        = (row.observation ?? "").toLowerCase();
        const id         = String(row.id);
        if (!clientName.includes(q) && !obs.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, statusFilter, searchQ, clientsMap]);

  // ── action handlers ──────────────────────────────────────────────────────────
  async function onSend(row: BudgetOut) {
    setBusyId(row.id);
    try { await sendBudget(row.id); await load(); }
    catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao enviar orçamento." }); }
    finally   { setBusyId(null); }
  }

  async function onReject(row: BudgetOut) {
    const reason = window.prompt("Motivo da reprovação (opcional):", "") ?? "";
    setBusyId(row.id);
    try { await rejectBudget(row.id, reason.trim() || undefined); await load(); }
    catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao reprovar orçamento." }); }
    finally   { setBusyId(null); }
  }

  async function onApprove(row: BudgetOut) {
    setBusyId(row.id);
    try {
      const result = await approveBudget(row.id);
      navigate(`/app/service-orders/${result.service_order_id}`);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao aprovar orçamento." });
    } finally { setBusyId(null); }
  }

  async function onOpenPdf(row: BudgetOut) {
    setBusyId(row.id);
    setPreviewLoading(true);
    try {
      const blob = await fetchBudgetPdfBlob(row.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBudgetId(row.id);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao gerar PDF." });
    } finally { setBusyId(null); setPreviewLoading(false); }
  }

  function closePdfPreview() { setPreviewOpen(false); }

  function sendByEmail() {
    if (!previewBudgetId) return;
    const subject = encodeURIComponent(`Orçamento #${previewBudgetId}`);
    const body    = encodeURIComponent(`Olá,\n\nSegue o orçamento #${previewBudgetId} em PDF.\n`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  function shareBudgetPdf() {
    if (!previewBudgetId || !previewUrl) return;
    const text = `Olá! Segue o orçamento #${previewBudgetId} em PDF.`;
    fetch(previewUrl)
      .then(async (response) => {
        const blob = await response.blob();
        const file = new File([blob], `orcamento-${previewBudgetId}.pdf`, { type: "application/pdf" });
        const nav  = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (navigator.share && nav.canShare?.({ files: [file] })) {
          await navigator.share({ title: `Orçamento #${previewBudgetId}`, text, files: [file] });
          return;
        }
        if (navigator.share) { await navigator.share({ title: `Orçamento #${previewBudgetId}`, text }); return; }
        setMsg({ kind: "err", text: "Compartilhamento não disponível neste navegador." });
      })
      .catch(() => setMsg({ kind: "err", text: "Não foi possível preparar o arquivo para compartilhamento." }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Reuse the same .wrap / .pageHeader / .heroStats tokens defined in
  // PreventiveMaintenancePage.module.css — here we rely on listTableCommon
  // for toolbar/table and define only budget-specific styles in the local module.
  // We use the classes directly from the clients-list pattern via inline vars.
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      maxWidth: "80rem", margin: "0 auto", width: "100%",
      display: "flex", flexDirection: "column",
      gap: "var(--space-6, 1.5rem)", padding: "var(--space-6, 1.5rem)",
    }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4, 1rem)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text, #0f172a)", letterSpacing: "-0.025em" }}>
            Orçamentos
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "var(--font-size-md, 0.9375rem)", color: "var(--color-text-muted, #64748b)" }}>
            Gerencie propostas comerciais e acompanhe o funil de aprovação
          </p>
        </div>
        {canEdit ? (
          <Link className={tableStyles.listToolbarBtnPrimary} to="/app/budgets/new">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "1.125rem", height: "1.125rem" }}>
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            Novo orçamento
          </Link>
        ) : null}
      </header>

      {/* ── Stat cards (4 cols) ─────────────────────────────────────────────── */}
      <div className={styles.heroStats}>
        {/* Total */}
        <StatCard
          label="Total de Orçamentos"
          value={loading ? "—" : String(stats.total)}
          hint="no sistema"
          iconColor="#0284c7"
          iconBg="linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%)"
          icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></>}
        />
        {/* Em aberto */}
        <StatCard
          label="Em Aberto"
          value={loading ? "—" : String(stats.emAberto)}
          hint="rascunho + enviado"
          iconColor="#d97706"
          iconBg="linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)"
          icon={<><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 18v4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/></>}
        />
        {/* Aprovados */}
        <StatCard
          label="Aprovados"
          value={loading ? "—" : String(stats.aprovados)}
          hint="convertidos em OS"
          iconColor="#16a34a"
          iconBg="linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%)"
          icon={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></>}
        />
        {/* Reprovados */}
        <StatCard
          label="Reprov. / Expirados"
          value={loading ? "—" : String(stats.reprovados)}
          hint="não convertidos"
          iconColor="#dc2626"
          iconBg="linear-gradient(135deg,#fee2e2 0%,#fecaca 100%)"
          icon={<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className={tableStyles.listToolbar}>
        {/* Search */}
        <div className={tableStyles.listToolbarSearchCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="budgets-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="budgets-search"
              className={tableStyles.listToolbarSearchInput}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar cliente, nº ou observação"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Status filter + refresh */}
        <div className={tableStyles.listToolbarActions}>
          <div className={tableStyles.listToolbarFilterBlock}>
            <label className={tableStyles.listToolbarLabel} htmlFor="budget-status">
              Status
            </label>
            <select
              id="budget-status"
              className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | BudgetStatus)}
            >
              <option value="all">Todos os Status</option>
              <option value="draft">Rascunho</option>
              <option value="sent">Enviado</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Reprovado</option>
              <option value="expired">Expirado</option>
            </select>
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
      {msg ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "0.75rem 1rem",
            fontSize: "0.9375rem",
            color: msg.kind === "err" ? "#dc2626" : "#166534",
            background: msg.kind === "err" ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${msg.kind === "err" ? "#fecaca" : "#bbf7d0"}`,
            borderRadius: "0.75rem",
          }}
        >
          {msg.text}
        </p>
      ) : null}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Orçamento</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Itens</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Forma de pagamento</th>
              <th className={tableStyles.tailActionsCol} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                  <div>
                    <svg viewBox="0 0 24 24" style={{ width: "2.5rem", height: "2.5rem", stroke: "#cbd5e1", fill: "none", strokeWidth: 1.5, margin: "0 auto 0.75rem", display: "block" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    </svg>
                    <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Nenhum orçamento encontrado</p>
                    <p style={{ fontSize: "0.875rem" }}>Crie um novo orçamento para começar</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const disabled = busyId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={tableStyles.rowClickable}
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      navigate(`/app/budgets/${row.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/app/budgets/${row.id}`); }
                    }}
                    aria-label={`Abrir orçamento #${row.id}`}
                  >
                    <td>
                      <span className={styles.budgetId}>#{row.id}</span>
                      {row.observation ? <div className={styles.budgetObs}>{row.observation}</div> : null}
                    </td>
                    <td>{clientsMap.get(row.client_id) ?? `Cliente #${row.client_id}`}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td>
                      {row.service_items.length} serv.{" "}
                      {row.product_items.length > 0 ? `/ ${row.product_items.length} prod.` : ""}
                    </td>
                    <td className={styles.totalCell}>{formatCurrency(budgetGrandTotal(row))}</td>
                    <td style={{ color: "var(--color-text-muted, #64748b)" }}>
                      {row.payment_method || "—"}
                    </td>
                    <td className={tableStyles.tailActionsCol}>
                      <div className={tableStyles.rowActions}>
                        {/* PDF */}
                        <button
                          className={styles.iconAction}
                          type="button"
                          onClick={() => void onOpenPdf(row)}
                          disabled={disabled || previewLoading}
                          title="Visualizar PDF"
                          aria-label="Visualizar PDF"
                        >
                          <ActionIcon>
                            <path d="M7 2.8h7.3L19.2 7v14.2H7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                            <path d="M14.3 2.8V7H19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                            <path d="M9.5 12h7M9.5 15h7M9.5 18h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </ActionIcon>
                        </button>

                        {/* Enviar */}
                        {canEdit && row.status === "draft" ? (
                          <button className={styles.iconAction} type="button" onClick={() => void onSend(row)} disabled={disabled} title="Enviar orçamento" aria-label="Enviar orçamento">
                            <ActionIcon>
                              <path d="M12 16V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                              <path d="m7.5 8.5 4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            </ActionIcon>
                          </button>
                        ) : null}

                        {/* OS link */}
                        {row.generated_service_order_id ? (
                          <Link className={styles.iconAction} to={`/app/service-orders/${row.generated_service_order_id}`} title={`Abrir OS #${row.generated_service_order_id}`} aria-label={`Abrir OS #${row.generated_service_order_id}`}>
                            <ActionIcon>
                              <path d="M3 8.5h18M7 8.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                              <path d="M5.5 8.5h13V20H5.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                              <path d="M10 12h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            </ActionIcon>
                          </Link>
                        ) : null}

                        {/* Aprovar / Reprovar */}
                        {canEdit && (row.status === "sent" || row.status === "draft") && !row.generated_service_order_id ? (
                          <>
                            <button className={styles.iconAction} type="button" onClick={() => void onApprove(row)} disabled={disabled} title="Aprovar orçamento" aria-label="Aprovar orçamento">
                              <ActionIcon>
                                <path d="M5 12.5 9.2 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </ActionIcon>
                            </button>
                            <button className={styles.iconAction} type="button" onClick={() => void onReject(row)} disabled={disabled} title="Reprovar orçamento" aria-label="Reprovar orçamento">
                              <ActionIcon>
                                <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                              </ActionIcon>
                            </button>
                          </>
                        ) : null}

                        {/* Row hint arrow */}
                        <span className={`${tableStyles.tailCol} ${tableStyles.rowHint}`} aria-hidden>
                          <span className={tableStyles.rowHintIcon}>
                            <svg viewBox="0 0 20 20" fill="none" focusable="false">
                              <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Rodapé ─────────────────────────────────────────────────────────── */}
      {!loading && rows.length > 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-sm, 0.8125rem)", color: "var(--color-text-muted, #64748b)" }}>
          Mostrando {rows.length} de {allRows.length} orçamento{allRows.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {/* ── PDF Preview modal ───────────────────────────────────────────────── */}
      {previewOpen ? (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Visualizador de orçamento em PDF">
          <div className={styles.previewModal}>
            <div className={styles.previewBottomActions}>
              <div className={styles.previewFabWrap}>
                <button type="button" className={styles.previewFab} onClick={sendByEmail} aria-label="Enviar por email">
                  <ActionIcon>
                    <rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  </ActionIcon>
                </button>
                <span className={styles.previewTooltip}>Enviar por email</span>
              </div>
              <div className={styles.previewFabWrap}>
                <button type="button" className={styles.previewFab} onClick={shareBudgetPdf} aria-label="Compartilhar">
                  <ActionIcon>
                    <circle cx="18" cy="5.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="6"  cy="12"  r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="18" cy="18.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="M8.1 11 15.8 7M8.1 13 15.8 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </ActionIcon>
                </button>
                <span className={styles.previewTooltip}>Compartilhar</span>
              </div>
              <div className={styles.previewFabWrap}>
                <button type="button" className={`${styles.previewFab} ${styles.previewFabClose}`} onClick={closePdfPreview} aria-label="Fechar">
                  <ActionIcon>
                    <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </ActionIcon>
                </button>
                <span className={styles.previewTooltip}>Fechar</span>
              </div>
            </div>
            {previewUrl ? <iframe title="Pré-visualização do PDF" src={previewUrl} className={styles.previewFrame} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── StatCard helper (inline style to avoid nth-child CSS module dep) ─────────
interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  iconColor: string;
  iconBg: string;
  icon: ReactNode;
}

function StatCard({ label, value, hint, iconColor, iconBg, icon }: StatCardProps) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statHead}>
        <div>
          <p className={styles.statLabel}>{label}</p>
          <p className={styles.statValue}>{value}</p>
        </div>
        <span
          className={styles.statIconWrap}
          aria-hidden
          style={{ color: iconColor, background: iconBg }}
        >
          <svg viewBox="0 0 24 24">{icon}</svg>
        </span>
      </div>
      <p className={styles.statHint}>{hint}</p>
    </article>
  );
}
