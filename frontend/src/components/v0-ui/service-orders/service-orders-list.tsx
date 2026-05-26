/**
 * Listagem de ordens de serviço — componentes visuais (v0-ui).
 * Dados e filtros ficam em ServiceOrdersListPage.
 */

import type { ReactNode } from "react";
import tableStyles from "../../../pages/listTableCommon.module.css";
import listStyles from "../clients/clients-list.module.css";
import { formatDurationMinutes } from "../../../lib/formatDuration";
import styles from "./service-orders-list.module.css";

export type ServiceOrderStatus =
  | "pendente"
  | "agendada"
  | "em_andamento"
  | "concluida"
  | "cancelada"
  | "aguardando_pecas";

export type ServiceType = "preventiva" | "corretiva" | "instalacao" | "manutencao";

export interface Technician {
  id: string;
  name: string;
  avatar?: string;
}

export interface ServiceOrder {
  id: string;
  number: string;
  clientName: string;
  clientId: string;
  technician: Technician | null;
  serviceType: ServiceType;
  status: ServiceOrderStatus;
  openedAt: string;
  scheduledAt?: string;
  totalValue: number;
  estimatedMinutes?: number;
  actualMinutes?: number | null;
  description?: string;
  priority?: "baixa" | "media" | "alta" | "urgente";
}

export interface ServiceOrderMetrics {
  todayTotal: number;
  inExecution: number;
  awaitingParts: number;
  completedMonth: number;
}

export const statusConfig: Record<ServiceOrderStatus, { label: string }> = {
  pendente: { label: "Pendente" },
  agendada: { label: "Agendada" },
  em_andamento: { label: "Em andamento" },
  concluida: { label: "Concluída" },
  cancelada: { label: "Cancelada" },
  aguardando_pecas: { label: "Aguard. peças" },
};

const statusClassMap: Record<ServiceOrderStatus, string> = {
  pendente: styles.statusPending,
  agendada: styles.statusApprovedUi,
  em_andamento: styles.statusRunning,
  concluida: styles.statusDoneUi,
  cancelada: styles.statusCancelledUi,
  aguardando_pecas: styles.statusDraft,
};

export const serviceTypeLabels: Record<ServiceType, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  instalacao: "Instalação",
  manutencao: "Manutenção",
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Tempo real > estimado em 20% — alerta de ineficiência para o gestor. */
export function isActualDurationOverEstimate(
  actualMinutes?: number | null,
  estimatedMinutes?: number,
): boolean {
  if (actualMinutes == null || actualMinutes <= 0) return false;
  const estimated = estimatedMinutes ?? 0;
  return estimated > 0 && actualMinutes > estimated * 1.2;
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <article className={listStyles.statCard}>
      <div className={listStyles.statHead}>
        <div>
          <p className={listStyles.statLabel}>{label}</p>
          <p className={listStyles.statValue}>{value}</p>
        </div>
        <span className={listStyles.statIconWrap} aria-hidden>
          {icon}
        </span>
      </div>
      <p className={listStyles.statHint}>{hint}</p>
    </article>
  );
}

function ServiceOrdersStatsGrid({ metrics }: { metrics: ServiceOrderMetrics }) {
  return (
    <div className={listStyles.heroStats}>
      <StatCard
        label="OS hoje"
        value={metrics.todayTotal}
        hint={metrics.todayTotal > 0 ? "Abertas ou agendadas hoje" : "Nenhuma para hoje"}
        icon={
          <svg viewBox="0 0 24 24" className={listStyles.statIcon}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        }
      />
      <StatCard
        label="Em execução"
        value={metrics.inExecution}
        hint="Técnicos em campo"
        icon={
          <svg viewBox="0 0 24 24" className={listStyles.statIcon}>
            <path d="M1 3h15v13H1z" />
            <path d="M16 8h4l3 3v5h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        }
      />
      <StatCard
        label="Aguardando peças"
        value={metrics.awaitingParts}
        hint="Bloqueadas por estoque"
        icon={
          <svg viewBox="0 0 24 24" className={listStyles.statIcon}>
            <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.27 6.96 12 12.01 20.73 6.96M12 22.08V12" />
          </svg>
        }
      />
      <StatCard
        label="Concluídas (mês)"
        value={metrics.completedMonth}
        hint="Finalizadas no período"
        icon={
          <svg viewBox="0 0 24 24" className={listStyles.statIcon}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m22 4-10 10.01-3-3" />
          </svg>
        }
      />
    </div>
  );
}

function ActualDurationCell({
  actualMinutes,
  estimatedMinutes,
}: {
  actualMinutes?: number | null;
  estimatedMinutes?: number;
}) {
  if (actualMinutes == null || actualMinutes <= 0) {
    return <span className={tableStyles.cellMuted}>—</span>;
  }
  const overThreshold = isActualDurationOverEstimate(actualMinutes, estimatedMinutes);
  return (
    <span className={overThreshold ? styles.actualDurationOver : tableStyles.cellMuted}>
      {formatDurationMinutes(actualMinutes)}
    </span>
  );
}

function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  return (
    <span className={`${styles.statusPill} ${statusClassMap[status]}`}>{statusConfig[status].label}</span>
  );
}

function TechnicianCell({ technician }: { technician: Technician | null }) {
  if (!technician) {
    return <span className={styles.technicianUnassigned}>Não alocado</span>;
  }
  const initials = technician.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className={styles.techRow}>
      <span className={styles.techAvatar}>{initials}</span>
      <span className={styles.technicianCell}>{technician.name}</span>
    </span>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={listStyles.tableContainer} aria-busy="true" aria-label="Carregando ordens de serviço">
      <div className={tableStyles.tableWrap}>
        <table className={`${tableStyles.table} ${styles.osTableDense}`}>
          <thead>
            <tr>
              <th>Nº OS</th>
              <th>Cliente</th>
              <th>Técnico</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Data</th>
              <th>Tempo real</th>
              <th className={tableStyles.cellRight}>Valor</th>
              <th className={tableStyles.tailCol} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <td colSpan={9}>
                  <div className={styles.shimmerRow} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ServiceOrdersListTableProps {
  orders: ServiceOrder[];
  isLoading?: boolean;
  onRowClick: (order: ServiceOrder) => void;
  onNewOrder?: () => void;
}

export function ServiceOrdersListTable({
  orders,
  isLoading = false,
  onRowClick,
  onNewOrder,
}: ServiceOrdersListTableProps) {
  if (isLoading) return <TableSkeleton />;

  if (orders.length === 0) {
    return (
      <div className={listStyles.empty}>
        <p>Nenhuma ordem de serviço encontrada.</p>
        {onNewOrder ? (
          <button type="button" className={tableStyles.listToolbarBtnPrimary} onClick={onNewOrder}>
            Nova OS
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={listStyles.tableContainer}>
      <div className={tableStyles.tableWrap}>
        <table className={`${tableStyles.table} ${styles.osTableDense}`}>
          <thead>
            <tr>
              <th>Nº OS</th>
              <th>Cliente</th>
              <th>Técnico</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Data</th>
              <th>Tempo real</th>
              <th className={tableStyles.cellRight}>Valor</th>
              <th className={tableStyles.tailCol} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const efficiencyAlert = isActualDurationOverEstimate(
                order.actualMinutes,
                order.estimatedMinutes,
              );
              return (
              <tr
                key={order.id}
                className={`${tableStyles.rowClickable}${efficiencyAlert ? ` ${styles.rowEfficiencyAlert}` : ""}`}
                onClick={() => onRowClick(order)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(order);
                  }
                }}
                role="link"
                tabIndex={0}
                aria-label={
                  efficiencyAlert
                    ? `Abrir OS ${order.number} — tempo real acima do estimado`
                    : `Abrir OS ${order.number}`
                }
              >
                <td>
                  <span className={styles.osLink}>#{order.number}</span>
                </td>
                <td>
                  <span className={listStyles.clientName}>{order.clientName}</span>
                </td>
                <td>
                  <TechnicianCell technician={order.technician} />
                </td>
                <td className={tableStyles.cellMuted}>{serviceTypeLabels[order.serviceType]}</td>
                <td>
                  <StatusBadge status={order.status} />
                </td>
                <td className={tableStyles.cellMuted}>
                  {formatDate(order.scheduledAt || order.openedAt)}
                </td>
                <td>
                  <ActualDurationCell
                    actualMinutes={order.actualMinutes}
                    estimatedMinutes={order.estimatedMinutes}
                  />
                </td>
                <td className={styles.totalCell}>{formatCurrency(order.totalValue)}</td>
                <td className={`${tableStyles.tailCol} ${tableStyles.rowHint}`} aria-hidden="true">
                  <span className={tableStyles.rowHintIcon}>
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                      <path
                        d="M7 4L13 10L7 16"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export interface ListPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

function ListPaginationBar({ pagination }: { pagination: ListPagination }) {
  const { currentPage, totalPages, totalItems, itemsPerPage, onPageChange } = pagination;
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={styles.listFootPagination}>
      <span>
        Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de{" "}
        <strong>{totalItems}</strong> resultados
      </span>
      <div className={styles.pagerBtns}>
      <button
        type="button"
        className={styles.pagerBtn}
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Página anterior"
      >
        ‹
      </button>
      <span className={styles.pagerBtnActive}>
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        className={styles.pagerBtn}
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Próxima página"
      >
        ›
      </button>
    </div>
    </div>
  );
}



export interface ServiceOrdersListViewProps {
  orders: ServiceOrder[];
  metrics: ServiceOrderMetrics;
  isLoading?: boolean;
  error?: string | null;
  totalFiltered: number;
  onRowClick: (order: ServiceOrder) => void;
  onNewOrder?: () => void;
  toolbar: ReactNode;
  pagination?: ListPagination;
}

export function ServiceOrdersListView({
  orders,
  metrics,
  isLoading = false,
  error = null,
  totalFiltered,
  onRowClick,
  onNewOrder,
  toolbar,
  pagination,
}: ServiceOrdersListViewProps) {
  return (
    <>
      <ServiceOrdersStatsGrid metrics={metrics} />
      {toolbar}
      {error ? (
        <p className={listStyles.msgErr} role="alert">
          {error}
        </p>
      ) : null}
      <ServiceOrdersListTable
        orders={orders}
        isLoading={isLoading}
        onRowClick={onRowClick}
        onNewOrder={onNewOrder}
      />
      {!isLoading && !error && orders.length > 0 ? (
        <p className={listStyles.listFoot}>
          <span className={styles.listFootPagination}>
            <span>
              Exibindo {orders.length} de {totalFiltered} ordem{totalFiltered === 1 ? "" : "ens"} nesta página
            </span>
            {pagination ? <ListPaginationBar pagination={pagination} /> : null}
          </span>
        </p>
      ) : null}
    </>
  );
}
