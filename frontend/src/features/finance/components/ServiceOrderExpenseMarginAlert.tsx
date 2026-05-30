import { AlertTriangle } from 'lucide-react';
import {
  calculateProjectedOSMargin,
  OS_MARGIN_WARNING_THRESHOLD_PERCENT,
} from '../financeCalculator';
import type { Transacao } from '../transaction.types';
import styles from './ServiceOrderExpenseMarginAlert.module.css';

export type ServiceOrderExpenseMarginAlertProps = {
  serviceOrderId: number;
  expenseAmount: number;
  entries: Transacao[];
  marginThresholdPercent?: number;
  excludeEntryId?: string;
  reasonForLoss?: string;
  onReasonForLossChange?: (value: string) => void;
};

export function ServiceOrderExpenseMarginAlert({
  serviceOrderId,
  expenseAmount,
  entries,
  marginThresholdPercent = OS_MARGIN_WARNING_THRESHOLD_PERCENT,
  excludeEntryId,
  reasonForLoss = '',
  onReasonForLossChange,
}: ServiceOrderExpenseMarginAlertProps) {
  if (!(expenseAmount > 0)) return null;

  const projected = calculateProjectedOSMargin(serviceOrderId, expenseAmount, entries, {
    marginThresholdPercent,
    excludeEntryId,
  });

  const { margem, isBelowThreshold } = projected;
  const showThresholdWarning = isBelowThreshold && margem != null;
  const requiresLossReason = margem != null && margem < 0;

  if (!showThresholdWarning && !requiresLossReason) return null;

  return (
    <div className={styles.wrap}>
      {showThresholdWarning ? (
        <p className={styles.warning} role="status">
          <AlertTriangle size={16} className={styles.icon} aria-hidden />
          Atenção: Esta despesa reduzirá a margem da OS para{' '}
          <strong>{margem!.toFixed(1)}%</strong>. A meta mínima é {marginThresholdPercent}%.
        </p>
      ) : null}
      {requiresLossReason ? (
        <div className={styles.lossBlock}>
          <p className={styles.lossHint}>
            A OS ficará com margem negativa (prejuízo). Informe a justificativa para registrar o
            lançamento.
          </p>
          {onReasonForLossChange ? (
            <>
              <label className={styles.lossLabel} htmlFor="reason-for-loss">
                Justificativa de prejuízo
              </label>
              <textarea
                id="reason-for-loss"
                className={styles.lossInput}
                rows={3}
                value={reasonForLoss}
                onChange={(e) => onReasonForLossChange(e.target.value)}
                placeholder="Ex.: peça emergencial exigida pelo cliente; custo acordado comercialmente."
                maxLength={500}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
