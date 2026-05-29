import { X } from 'lucide-react';
import type { Transacao } from '../transaction.types';
import styles from './ServiceOrderFinanceTransactionsDrawer.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function statusClass(status: Transacao['status']): string {
  if (status === 'LIQUIDADO') return styles.badgePaid;
  if (status === 'CANCELADO') return styles.badgeCancelled;
  return styles.badgePending;
}

function statusLabel(status: Transacao['status']): string {
  if (status === 'LIQUIDADO') return 'Liquidado';
  if (status === 'CANCELADO') return 'Cancelado';
  return 'Pendente';
}

export type ServiceOrderFinanceTransactionsDrawerProps = {
  open: boolean;
  onClose: () => void;
  serviceOrderId: number;
  entries: Transacao[];
  isLoading?: boolean;
};

export function ServiceOrderFinanceTransactionsDrawer({
  open,
  onClose,
  serviceOrderId,
  entries,
  isLoading,
}: ServiceOrderFinanceTransactionsDrawerProps) {
  if (!open) return null;

  const recebimentos = entries.filter((e) => e.kind === 'RECEBIMENTO');

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Transações da OS ${serviceOrderId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Pagamentos · OS #{serviceOrderId}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className={styles.body}>
          {isLoading ? (
            <p className={styles.empty}>Carregando lançamentos…</p>
          ) : recebimentos.length === 0 ? (
            <p className={styles.empty}>Nenhum recebimento vinculado a esta OS ainda.</p>
          ) : (
            <ul className={styles.list}>
              {recebimentos.map((row) => (
                <li key={row.id} className={styles.item}>
                  <div className={styles.itemTop}>
                    <p className={styles.itemDesc}>{row.descricao}</p>
                    <span className={styles.itemAmount}>{money(row.valor)}</span>
                  </div>
                  <p className={styles.itemMeta}>
                    <span className={`${styles.statusPill} ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                    {' · '}
                    Previsto: {formatDate(row.dataPrevista)}
                    {row.dataLiquidacao ? ` · Liquidado: ${formatDate(row.dataLiquidacao)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
