import type { FinanceEntryOut } from '../../api/finance';
import { parseEntryDomainId } from './financeIds';
import type { Transacao } from './transaction.types';
import type { FinanceEntryStatus } from '../../api/finance';

export type EditSeriesScope = 'single' | 'following' | 'all';

export type EditSeriesKind = 'recurring' | 'installment' | 'none';

export type ScopeOptionLabels = Record<
  EditSeriesScope,
  { title: string; description: string }
>;

export const EDIT_SCOPE_LABELS: ScopeOptionLabels = {
  single: {
    title: 'Apenas esta parcela',
    description: 'Altera somente o lançamento selecionado, sem afetar a série.',
  },
  following: {
    title: 'Esta e as próximas',
    description: 'Aplica a alteração neste vencimento e em todos os futuros da mesma série.',
  },
  all: {
    title: 'Toda a série',
    description: 'Aplica a alteração em todos os lançamentos da série (passados e futuros).',
  },
};

/** Rótulos do wizard de edição (requisito de produto). */
export const WIZARD_EDIT_SCOPE_LABELS: ScopeOptionLabels = {
  single: {
    title: 'Esta parcela',
    description: 'Atualiza somente este lançamento (parentId mantido nos demais).',
  },
  following: {
    title: 'Esta e as futuras',
    description: 'Atualiza este e todos os vencimentos futuros da mesma série (parentId).',
  },
  all: {
    title: 'Série completa',
    description: 'Atualiza todos os lançamentos com o mesmo parentId da série.',
  },
};

/** Textos do seletor de alcance para excluir / pago / cancelado em série. */
export const SERIES_ACTION_SCOPE_LABELS: ScopeOptionLabels = {
  single: {
    title: 'Somente nesta',
    description: 'A ação vale apenas para o lançamento selecionado.',
  },
  following: {
    title: 'Esta e as próximas',
    description: 'Aplica neste vencimento e em todos os futuros da mesma série.',
  },
  all: {
    title: 'Todas',
    description: 'Aplica em todos os lançamentos da série (passados e futuros).',
  },
};

export type SeriesBulkAction = 'delete' | 'paid' | 'cancelled';

export const SERIES_ACTION_TITLES: Record<SeriesBulkAction, string> = {
  delete: 'Excluir lançamentos',
  paid: 'Marcar como pago',
  cancelled: 'Cancelar lançamentos',
};

export function toApiEditScope(scope: EditSeriesScope): 'single' | 'future' | 'all' {
  return scope === 'following' ? 'future' : scope;
}

export function parseNotesJson(notes: string | null | undefined): Record<string, unknown> {
  if (!notes?.trim()) return {};
  try {
    const o = JSON.parse(notes) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function entryIsReconciledFromNotes(notes: string | null | undefined): boolean {
  const rec = parseNotesJson(notes).gateway_reconciliation;
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as Record<string, unknown>;
  return Boolean(r.matched_at || r.provider);
}

export function entryIsEditLocked(
  status: string,
  notes?: string | null,
): boolean {
  if (status === 'paid' || status === 'LIQUIDADO') return true;
  return entryIsReconciledFromNotes(notes);
}

export type TransacaoLockReason = 'paid' | 'reconciled';

export function transacaoLockReason(row: Transacao): TransacaoLockReason | null {
  const api: FinanceEntryStatus =
    row.apiStatus ??
    (row.status === 'LIQUIDADO' ? 'paid' : row.status === 'CANCELADO' ? 'cancelled' : 'pending');
  if (entryIsReconciledFromNotes(row.notes)) return 'reconciled';
  if (api === 'paid' || row.status === 'LIQUIDADO') return 'paid';
  return null;
}

export function transacaoIsEditLocked(row: Transacao): boolean {
  return transacaoLockReason(row) != null;
}

export function transacaoLockTitle(reason: TransacaoLockReason): string {
  return reason === 'reconciled' ? 'Lançamento conciliado' : 'Lançamento liquidado';
}

export function transacaoLockMessage(reason: TransacaoLockReason, row: Transacao): string {
  if (reason === 'reconciled') {
    return `“${row.descricao}” está conciliado com o extrato. Para alterar valores ou datas, desfaça a conciliação em Financeiro → Conciliação.`;
  }
  const series =
    row.recurringTransactionId || (row.installmentTotal ?? 1) > 1
      ? ' Para editar a série, abra uma parcela ainda pendente ou altere o status deste lançamento.'
      : ' Você pode consultar os dados abaixo; para editar, volte o status para pendente.';
  return `“${row.descricao}” já foi marcado como pago.${series}`;
}

export function transacaoApiId(row: Transacao): number | null {
  return parseEntryDomainId(row.id);
}

export function entryApiIdFromOut(row: FinanceEntryOut): number {
  return row.id;
}

export function detectEditSeriesKindFromOut(entry: FinanceEntryOut): EditSeriesKind {
  if (entry.recurring_transaction_id) return 'recurring';
  if ((entry.installment_total ?? 1) > 1) return 'installment';
  return 'none';
}

export function detectEditSeriesKindFromTransacao(row: Transacao): EditSeriesKind {
  if (row.recurringTransactionId) return 'recurring';
  if ((row.installmentTotal ?? 1) > 1) return 'installment';
  return 'none';
}

export function needsEditScopePrompt(kind: EditSeriesKind): boolean {
  return kind === 'recurring' || kind === 'installment';
}

export function seriesKindLabel(kind: EditSeriesKind): string {
  if (kind === 'recurring') return 'recorrente';
  if (kind === 'installment') return 'parcelada';
  return '';
}
