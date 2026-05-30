import { Link } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { patchFinanceEntry, type FinanceEntryStatus } from '../../../api/finance';
import { Button } from '../../../components/ui/button';
import {
  amountToCurrencyBrlInput,
  formatCurrencyBrlInput,
  parseCurrencyBrlInput,
} from '../../../lib/brMask';
import { EditSeriesScopeField } from './EditSeriesScopeField';
import {
  detectEditSeriesKindFromTransacao,
  needsEditScopePrompt,
  toApiEditScope,
  transacaoLockMessage,
  transacaoLockTitle,
  type EditSeriesScope,
  type TransacaoLockReason,
} from '../financeEntryEdit';
import type { Transacao } from '../transaction.types';
import styles from './FinanceEntryEditModal.module.css';

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapStatusToApi(status: Transacao['status']): FinanceEntryStatus {
  if (status === 'LIQUIDADO') return 'paid';
  if (status === 'CANCELADO') return 'cancelled';
  return 'pending';
}

export type FinanceEntryEditModalProps = {
  open: boolean;
  entryId: number;
  row: Transacao;
  readOnly?: boolean;
  lockReason?: TransacaoLockReason | null;
  onClose: () => void;
  onSaved: () => void;
};

export function FinanceEntryEditModal({
  open,
  entryId,
  row,
  readOnly = false,
  lockReason = null,
  onClose,
  onSaved,
}: FinanceEntryEditModalProps) {
  const seriesKind = detectEditSeriesKindFromTransacao(row);
  const showScopePicker = !readOnly && needsEditScopePrompt(seriesKind);

  const [description, setDescription] = useState(row.descricao);
  const [amountDisplay, setAmountDisplay] = useState(() => amountToCurrencyBrlInput(row.valor));
  const [dueDate, setDueDate] = useState(toDateInput(row.dataPrevista));
  const [status, setStatus] = useState<FinanceEntryStatus>(
    row.apiStatus ?? mapStatusToApi(row.status),
  );
  const [editScope, setEditScope] = useState<EditSeriesScope | null>(null);
  const [scopeTouched, setScopeTouched] = useState(false);
  const [forceEditLocked, setForceEditLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconciledLocked = lockReason === 'reconciled';
  const effectivelyReadOnly = readOnly || (reconciledLocked && !forceEditLocked);

  useEffect(() => {
    if (!open) return;
    setDescription(row.descricao);
    setAmountDisplay(amountToCurrencyBrlInput(row.valor));
    setDueDate(toDateInput(row.dataPrevista));
    setStatus(row.apiStatus ?? mapStatusToApi(row.status));
    setEditScope(showScopePicker ? null : 'single');
    setScopeTouched(false);
    setForceEditLocked(false);
    setError(null);
  }, [open, row, showScopePicker]);

  if (!open) return null;

  const scopeHint =
    row.installmentNumber != null && (row.installmentTotal ?? 1) > 1
      ? `Parcela ${row.installmentNumber} de ${row.installmentTotal}`
      : row.recurringTransactionId
        ? 'Lançamento da série recorrente'
        : undefined;

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (effectivelyReadOnly) return;
    if (showScopePicker && editScope == null) {
      setScopeTouched(true);
      setError('Selecione qual parte da série será alterada.');
      return;
    }
    const amt = parseCurrencyBrlInput(amountDisplay);
    if (!(amt > 0)) {
      setError('Informe um valor válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchFinanceEntry(entryId, {
        description: description.trim(),
        amount: amt,
        due_date: dueDate,
        status,
        edit_scope: toApiEditScope(editScope ?? 'single'),
        force_edit_locked: forceEditLocked && reconciledLocked,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={readOnly ? 'Detalhes do lançamento' : 'Editar lançamento'}
    >
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>
              {readOnly ? 'Detalhes do lançamento' : 'Editar lançamento'}
            </h2>
            <p className={styles.subtitle}>
              {row.kind === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento'}
              {row.installmentNumber != null && (row.installmentTotal ?? 1) > 1
                ? ` · Parcela ${row.installmentNumber}/${row.installmentTotal}`
                : row.recurringTransactionId
                  ? ' · Série recorrente'
                  : null}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </Button>
        </header>

        {lockReason ? (
          <div className={styles.lockBanner} role="status">
            <Lock size={18} className={styles.lockBannerIcon} aria-hidden />
            <div>
              <strong>{transacaoLockTitle(lockReason)}</strong>
              <p>{transacaoLockMessage(lockReason, row)}</p>
              {lockReason === 'reconciled' ? (
                <>
                  <Link className={styles.lockBannerLink} to="/app/finance/reconciliation" onClick={onClose}>
                    Abrir conciliação
                  </Link>
                  {!readOnly ? (
                    <label className={styles.forceEditLabel}>
                      <input
                        type="checkbox"
                        checked={forceEditLocked}
                        onChange={(e) => setForceEditLocked(e.target.checked)}
                      />
                      Editar mesmo assim (requer estorno/conferência manual)
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={(ev) => void handleSubmit(ev)}>
          {showScopePicker && !effectivelyReadOnly ? (
            <EditSeriesScopeField
              seriesKind={seriesKind}
              value={editScope}
              onChange={(scope) => {
                setEditScope(scope);
                setScopeTouched(false);
                if (error?.includes('série')) setError(null);
              }}
              hint={scopeHint}
              invalid={scopeTouched && editScope == null}
            />
          ) : null}

          <div className={styles.field}>
            <label htmlFor="fe-desc">Descrição</label>
            <input
              id="fe-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoComplete="off"
              readOnly={effectivelyReadOnly}
              disabled={effectivelyReadOnly}
            />
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="fe-amt">Valor</label>
              <div className={styles.moneyInputWrap}>
                <span className={styles.moneyPrefix} aria-hidden>
                  R$
                </span>
                <input
                  id="fe-amt"
                  inputMode="numeric"
                  value={amountDisplay}
                  onChange={(e) => setAmountDisplay(formatCurrencyBrlInput(e.target.value))}
                  placeholder="0,00"
                  aria-label="Valor em reais"
                  readOnly={effectivelyReadOnly}
                  disabled={effectivelyReadOnly}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="fe-due">Vencimento</label>
              <input
                id="fe-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                readOnly={effectivelyReadOnly}
                disabled={effectivelyReadOnly}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="fe-status">Status</label>
            <select
              id="fe-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as FinanceEntryStatus)}
              disabled={effectivelyReadOnly}
            >
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="overdue">Vencido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.footer}>
            <Button
              type="button"
              variant={effectivelyReadOnly ? 'default' : 'outline'}
              onClick={onClose}
              disabled={busy}
            >
              {effectivelyReadOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {!effectivelyReadOnly ? (
              <Button type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar'}
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
