import { useMemo } from "react";
import type { Budget, ServiceOrder } from "../../v0-ui/clients";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconWallet } from "./icons";
import { EmptyState, formatCurrencyBRL, formatDateBR, StatusPill } from "./shared";

type FinanceRow = {
  id: string;
  label: string;
  date: string;
  value: number;
  status: "pago" | "pendente" | "atrasado" | "cancelado";
};

const OVERDUE_DAYS = 30;

function deriveOrderStatus(order: ServiceOrder): FinanceRow["status"] {
  if (order.status === "concluida") return "pago";
  if (order.status === "cancelada") return "cancelado";
  const d = new Date(order.data);
  if (!Number.isNaN(d.getTime())) {
    const days = (Date.now() - d.getTime()) / 86_400_000;
    if (days > OVERDUE_DAYS) return "atrasado";
  }
  return "pendente";
}

const STATUS_META: Record<FinanceRow["status"], { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  pago: { label: "Pago", tone: "success" },
  pendente: { label: "Pendente", tone: "warning" },
  atrasado: { label: "Atrasado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "muted" },
};

type Props = {
  orders: ServiceOrder[];
  budgets: Budget[];
  isNew: boolean;
};

export function ClientFinanceTab({ orders, budgets, isNew }: Props) {
  const rows: FinanceRow[] = useMemo(
    () =>
      orders
        .map((o) => ({
          id: o.id,
          label: o.descricao || o.numero,
          date: String(o.data),
          value: o.valor,
          status: deriveOrderStatus(o),
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [orders],
  );

  const totals = useMemo(() => {
    const acc = { pago: 0, pendente: 0, atrasado: 0 };
    for (const r of rows) {
      if (r.status === "pago") acc.pago += r.value;
      else if (r.status === "pendente") acc.pendente += r.value;
      else if (r.status === "atrasado") acc.atrasado += r.value;
    }
    return acc;
  }, [rows]);

  const budgetsAprovados = budgets.filter((b) => b.status === "aprovado");
  const budgetsTotal = budgetsAprovados.reduce((s, b) => s + b.valor, 0);

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>
              <IconWallet /> Resumo financeiro
            </h3>
            <p className={styles.cardHint}>
              Resumo derivado das ordens de serviço deste cliente (pago = OS concluída, atrasado = OS em aberto há mais de{" "}
              {OVERDUE_DAYS} dias).
            </p>
          </div>
        </div>

        {isNew ? (
          <p className={styles.cardHint}>Salve o cliente para visualizar o resumo financeiro.</p>
        ) : (
          <>
            <div className={styles.miniGrid}>
              <div className={styles.miniCard}>
                <span className={styles.miniCardLabel}>Pago</span>
                <span className={styles.miniCardValue}>{formatCurrencyBRL(totals.pago)}</span>
              </div>
              <div className={styles.miniCard}>
                <span className={styles.miniCardLabel}>Pendente</span>
                <span className={styles.miniCardValue}>{formatCurrencyBRL(totals.pendente)}</span>
              </div>
              <div className={styles.miniCard}>
                <span className={styles.miniCardLabel}>Atrasado</span>
                <span className={styles.miniCardValue}>{formatCurrencyBRL(totals.atrasado)}</span>
              </div>
              <div className={styles.miniCard}>
                <span className={styles.miniCardLabel}>Orçamentos aprovados</span>
                <span className={styles.miniCardValue}>{formatCurrencyBRL(budgetsTotal)}</span>
              </div>
            </div>

            <div className={styles.divider} />

            {rows.length === 0 ? (
              <EmptyState message="Nenhum lançamento financeiro derivado de ordens de serviço." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Data</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const meta = STATUS_META[r.status];
                      return (
                        <tr key={r.id}>
                          <td>{r.label}</td>
                          <td>{formatDateBR(r.date)}</td>
                          <td>{formatCurrencyBRL(r.value)}</td>
                          <td>
                            <StatusPill label={meta.label} tone={meta.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
