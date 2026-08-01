import type { Budget, ServiceOrder } from "../../v0-ui/clients";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconClipboardList, IconPlus } from "./icons";
import { EmptyState, formatCurrencyBRL, formatDateBR, StatusPill } from "./shared";

const ORDER_STATUS: Record<ServiceOrder["status"], { label: string; tone: "success" | "warning" | "danger" | "muted" | "primary" }> = {
  pendente: { label: "Pendente", tone: "muted" },
  agendada: { label: "Agendada", tone: "primary" },
  em_andamento: { label: "Em andamento", tone: "warning" },
  concluida: { label: "Concluída", tone: "success" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

const BUDGET_STATUS: Record<Budget["status"], { label: string; tone: "success" | "warning" | "danger" | "muted" | "primary" }> = {
  rascunho: { label: "Rascunho", tone: "muted" },
  enviado: { label: "Enviado", tone: "primary" },
  aprovado: { label: "Aprovado", tone: "success" },
  recusado: { label: "Recusado", tone: "danger" },
  expirado: { label: "Expirado", tone: "muted" },
};

type Props = {
  orders: ServiceOrder[];
  budgets: Budget[];
  isNew: boolean;
  loading?: boolean;
  onNewOrder?: () => void;
  onNewBudget?: () => void;
  onOrderAction?: (action: "view" | "edit", order: ServiceOrder) => void;
  onBudgetAction?: (action: "view" | "edit" | "send", budget: Budget) => void;
};

export function ClientOrdersTab({ orders, budgets, isNew, loading, onNewOrder, onNewBudget, onOrderAction, onBudgetAction }: Props) {
  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Ordens de serviço</h3>
            <p className={styles.cardHint}>Histórico de atendimentos técnicos realizados para este cliente.</p>
          </div>
          {!isNew && onNewOrder ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onNewOrder}>
              <IconPlus /> Nova OS
            </button>
          ) : null}
        </div>

        {isNew ? (
          <p className={styles.cardHint}>Salve o cliente para visualizar e criar ordens de serviço.</p>
        ) : loading ? (
          <p className={styles.loading}>Carregando ordens de serviço…</p>
        ) : orders.length === 0 ? (
          <EmptyState message="Nenhuma ordem de serviço registrada ainda." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Serviço</th>
                  <th>Técnico</th>
                  <th>Status</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: "muted" as const };
                  return (
                    <tr
                      key={o.id}
                      style={{ cursor: onOrderAction ? "pointer" : undefined }}
                      onClick={() => onOrderAction?.("view", o)}
                    >
                      <td>
                        <strong>{o.numero}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{o.descricao}</div>
                      </td>
                      <td>{formatDateBR(String(o.data))}</td>
                      <td>{o.descricao}</td>
                      <td>{o.tecnico ?? "—"}</td>
                      <td>
                        <StatusPill label={st.label} tone={st.tone} />
                      </td>
                      <td>{formatCurrencyBRL(o.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Orçamentos</h3>
            <p className={styles.cardHint}>Propostas comerciais enviadas para este cliente.</p>
          </div>
          {!isNew && onNewBudget ? (
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onNewBudget}>
              <IconClipboardList /> Novo orçamento
            </button>
          ) : null}
        </div>

        {isNew ? null : budgets.length === 0 ? (
          <EmptyState message="Nenhum orçamento registrado ainda." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Status</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => {
                  const st = BUDGET_STATUS[b.status] ?? { label: b.status, tone: "muted" as const };
                  return (
                    <tr
                      key={b.id}
                      style={{ cursor: onBudgetAction ? "pointer" : undefined }}
                      onClick={() => onBudgetAction?.("view", b)}
                    >
                      <td>
                        <strong>{b.numero}</strong>
                      </td>
                      <td>{formatDateBR(String(b.data))}</td>
                      <td>{b.descricao}</td>
                      <td>
                        <StatusPill label={st.label} tone={st.tone} />
                      </td>
                      <td>{formatCurrencyBRL(b.valor)}</td>
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
