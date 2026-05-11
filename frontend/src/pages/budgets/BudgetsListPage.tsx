import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  approveBudget,
  fetchBudgetPdfBlob,
  listBudgets,
  rejectBudget,
  sendBudget,
  type BudgetOut,
  type BudgetStatus,
} from "../../api/budgets";
import { listClients } from "../../api/clients";
import type { DashboardOutletContext } from "../dashboardContext";
import baseStyles from "../listPageBase.module.css";
import modern from "../listPageModern.module.css";
import styles from "./BudgetsListPage.module.css";

function statusLabel(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    approved: "Aprovado",
    rejected: "Reprovado",
    expired: "Expirado",
  };
  return map[status] ?? status;
}

function statusClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: styles.statusDraft,
    sent: styles.statusSent,
    approved: styles.statusApproved,
    rejected: styles.statusRejected,
    expired: styles.statusExpired,
  };
  return map[status] ?? styles.statusDraft;
}

function ActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden>
      {children}
    </svg>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function budgetGrandTotal(row: BudgetOut): number {
  const services = row.service_items.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
  const products = row.product_items.reduce((sum, p) => sum + p.quantity * p.unit_price, 0);
  return services + products;
}

export function BudgetsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [rows, setRows] = useState<BudgetOut[]>([]);
  const [clientsMap, setClientsMap] = useState<Map<number, string>>(new Map());
  const [statusFilter, setStatusFilter] = useState<"all" | BudgetStatus>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBudgetId, setPreviewBudgetId] = useState<number | null>(null);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [budgets, clients] = await Promise.all([
        listBudgets({ status: statusFilter === "all" ? undefined : statusFilter, limit: 100 }),
        listClients({ limit: 100 }),
      ]);
      setRows(budgets);
      setClientsMap(new Map(clients.map((c) => [c.id, c.name])));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar orcamentos." });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function onSend(row: BudgetOut) {
    setBusyId(row.id);
    try {
      await sendBudget(row.id);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao enviar orcamento." });
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: BudgetOut) {
    const reason = window.prompt("Motivo da reprovação (opcional):", "") ?? "";
    setBusyId(row.id);
    try {
      await rejectBudget(row.id, reason.trim() || undefined);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao reprovar orcamento." });
    } finally {
      setBusyId(null);
    }
  }

  async function onApprove(row: BudgetOut) {
    setBusyId(row.id);
    try {
      const result = await approveBudget(row.id);
      navigate(`/app/service-orders/${result.service_order_id}`);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao aprovar orcamento." });
    } finally {
      setBusyId(null);
    }
  }

  async function onOpenPdf(row: BudgetOut) {
    setBusyId(row.id);
    setPreviewLoading(true);
    try {
      const blob = await fetchBudgetPdfBlob(row.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewBudgetId(row.id);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao gerar PDF do orcamento." });
    } finally {
      setBusyId(null);
      setPreviewLoading(false);
    }
  }

  function closePdfPreview() {
    setPreviewOpen(false);
  }

  function sendByEmail() {
    if (!previewBudgetId) return;
    const subject = encodeURIComponent(`Orçamento #${previewBudgetId}`);
    const body = encodeURIComponent(`Olá,\n\nSegue o orçamento #${previewBudgetId} em PDF.\n`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  function shareBudgetPdf() {
    if (!previewBudgetId || !previewUrl) return;
    const text = `Olá! Segue o orçamento #${previewBudgetId} em PDF.`;
    fetch(previewUrl)
      .then(async (response) => {
        const blob = await response.blob();
        const file = new File([blob], `orcamento-${previewBudgetId}.pdf`, { type: "application/pdf" });
        const nav = navigator as Navigator & {
          canShare?: (data: ShareData) => boolean;
        };
        if (navigator.share && nav.canShare?.({ files: [file] })) {
          await navigator.share({
            title: `Orçamento #${previewBudgetId}`,
            text,
            files: [file],
          });
          return;
        }
        if (navigator.share) {
          await navigator.share({
            title: `Orçamento #${previewBudgetId}`,
            text,
          });
          return;
        }
        setMsg({
          kind: "err",
          text: "Compartilhamento não disponível neste navegador.",
        });
      })
      .catch(() => {
        setMsg({
          kind: "err",
          text: "Não foi possível preparar o arquivo para compartilhamento.",
        });
      });
  }

  function openBudget(budgetId: number) {
    navigate(`/app/budgets/${budgetId}`);
  }

  return (
    <div className={`${styles.wrap} ${modern.page}`}>
      <div className={modern.toolbarCard}>
        <div className={baseStyles.selectCol}>
          <label className={baseStyles.selectLabel} htmlFor="budget-status">
            Status
          </label>
          <select
            id="budget-status"
            className={baseStyles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | BudgetStatus)}
          >
            <option value="all">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="sent">Enviado</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Reprovado</option>
            <option value="expired">Expirado</option>
          </select>
        </div>
        <div className={baseStyles.btnCol}>
          {canEdit ? (
            <Link className={baseStyles.btnPrimary} to="/app/budgets/new">
              Novo orcamento
            </Link>
          ) : null}
        </div>
      </div>

      {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
      {loading ? <p className={styles.empty}>Carregando...</p> : null}
      {!loading && rows.length === 0 ? <p className={styles.empty}>Nenhum orcamento encontrado.</p> : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Orcamento</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Forma de pagamento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const disabled = busyId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={styles.clickableRow}
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("a,button")) return;
                      openBudget(row.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openBudget(row.id);
                      }
                    }}
                  >
                    <td>
                      <strong className={styles.budgetId}>#{row.id}</strong>
                      <div>{row.observation || "Sem observação."}</div>
                    </td>
                    <td>{clientsMap.get(row.client_id) ?? `Cliente #${row.client_id}`}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td>{row.service_items.length} serv. / {row.product_items.length} prod.</td>
                    <td className={styles.totalCell}>{formatCurrency(budgetGrandTotal(row))}</td>
                    <td>{row.payment_method || "-"}</td>
                    <td className={styles.actionsCell}>
                      <span className={styles.rowHint} aria-hidden="true">
                        <span className={styles.rowHintIcon}>
                          <svg viewBox="0 0 20 20" fill="none" focusable="false">
                            <path
                              d="M7 4L13 10L7 16"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </span>
                      <button
                        className={styles.iconAction}
                        type="button"
                        onClick={() => void onOpenPdf(row)}
                        disabled={disabled || previewLoading}
                        title="Visualizar PDF"
                        aria-label="Visualizar PDF"
                      >
                        <ActionIcon>
                          <path
                            d="M7 2.8h7.3L19.2 7v14.2H7z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path d="M14.3 2.8V7H19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                          <path d="M9.5 12h7M9.5 15h7M9.5 18h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </ActionIcon>
                      </button>
                      {canEdit && row.status === "draft" ? (
                        <button
                          className={styles.iconAction}
                          type="button"
                          onClick={() => void onSend(row)}
                          disabled={disabled}
                          title="Enviar orcamento"
                          aria-label="Enviar orcamento"
                        >
                          <ActionIcon>
                            <path d="M12 16V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <path
                              d="m7.5 8.5 4.5-4.5 4.5 4.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </ActionIcon>
                        </button>
                      ) : null}
                      {row.generated_service_order_id ? (
                        <Link
                          className={styles.iconAction}
                          to={`/app/service-orders/${row.generated_service_order_id}`}
                          title={`Abrir OS #${row.generated_service_order_id}`}
                          aria-label={`Abrir OS #${row.generated_service_order_id}`}
                        >
                          <ActionIcon>
                            <path d="M3 8.5h18M7 8.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <path d="M5.5 8.5h13V20H5.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                            <path d="M10 12h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </ActionIcon>
                        </Link>
                      ) : null}
                      {canEdit && (row.status === "sent" || row.status === "draft") && !row.generated_service_order_id ? (
                        <>
                          <button
                            className={styles.iconAction}
                            type="button"
                            onClick={() => void onApprove(row)}
                            disabled={disabled}
                            title="Aprovar orcamento"
                            aria-label="Aprovar orcamento"
                          >
                            <ActionIcon>
                              <path d="M5 12.5 9.2 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </ActionIcon>
                          </button>
                          <button
                            className={styles.iconAction}
                            type="button"
                            onClick={() => void onReject(row)}
                            disabled={disabled}
                            title="Reprovar orcamento"
                            aria-label="Reprovar orcamento"
                          >
                            <ActionIcon>
                              <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </ActionIcon>
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {previewOpen ? (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Visualizador de orçamento em PDF">
          <div className={styles.previewModal}>
            <div className={styles.previewBottomActions}>
              <div className={styles.previewFabWrap}>
                <button type="button" className={styles.previewFab} onClick={sendByEmail} aria-label="Enviar por email">
                  <ActionIcon>
                    <rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </ActionIcon>
                </button>
                <span className={styles.previewTooltip}>Enviar por email</span>
              </div>
              <div className={styles.previewFabWrap}>
                <button type="button" className={styles.previewFab} onClick={shareBudgetPdf} aria-label="Compartilhar">
                  <ActionIcon>
                    <circle cx="18" cy="5.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="6" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="18" cy="18.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M8.1 11 15.8 7M8.1 13 15.8 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </ActionIcon>
                </button>
                <span className={styles.previewTooltip}>Compartilhar</span>
              </div>
              <div className={styles.previewFabWrap}>
                <button type="button" className={`${styles.previewFab} ${styles.previewFabClose}`} onClick={closePdfPreview} aria-label="Fechar">
                  <ActionIcon>
                    <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
