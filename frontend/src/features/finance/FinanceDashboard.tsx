import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Repeat, Trash2, X } from 'lucide-react';
import { ToastHost } from '../../components/ToastHost';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { FinancialCharts } from './components/FinancialCharts';
import { FinanceSummarySidebar } from './components/FinanceSummarySidebar';
import { deleteFinanceEntry, patchFinanceEntry } from '../../api/finance';
import { toast } from '../../lib/toast';
import { FinanceDeleteConfirmModal } from './components/FinanceDeleteConfirmModal';
import { SeriesActionScopeModal } from './components/SeriesActionScopeModal';
import { TransactionWizardModal } from './components/TransactionWizardModal';
import {
  detectEditSeriesKindFromTransacao,
  needsEditScopePrompt,
  toApiEditScope,
  transacaoApiId,
  transacaoIsEditLocked,
  transacaoLockReason,
  type EditSeriesScope,
  type SeriesBulkAction,
} from './financeEntryEdit';
import { chartPeriodBounds } from './financialChartsData';
import {
  FINANCE_PERIOD_PRESET_LABELS,
  detectPeriodPreset,
  periodRangeForPreset,
  type FinancePeriodPreset,
} from './financePeriodPresets';
import type { Conta } from './account.types';
import type { StatusTransacao, Transacao } from './transaction.types';
import {
  useFinanceEntries,
  useFinanceServiceContext,
  useFinanceUpcoming,
  useCreditCardInvoicesSummary,
} from './hooks';
import {
  effectiveReceivableAmount,
  getLiquidityBadge,
  isSameCalendarDay,
} from './financeCalculator';
import styles from './FinanceDashboard.module.css';

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMonthRange(): { inicio: Date; fim: Date } {
  const now = new Date();
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), 1),
    fim: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function statusBadgeVariant(status: StatusTransacao): 'warning' | 'success' | 'destructive' {
  if (status === 'LIQUIDADO') return 'success';
  if (status === 'CANCELADO') return 'destructive';
  return 'warning';
}

function statusLabel(status: StatusTransacao): string {
  const m: Record<StatusTransacao, string> = {
    PENDENTE: 'Pendente',
    LIQUIDADO: 'Liquidado',
    CANCELADO: 'Cancelado',
  };
  return m[status];
}

function EntriesTableSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          {Array.from({ length: 7 }, (__, j) => (
            <div key={j} className={styles.skeletonCell} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FinanceErrorAlert({ message }: { message: string }) {
  return (
    <div className={styles.alert} role="alert">
      <div>
        <p className={styles.alertTitle}>Não foi possível carregar as transações</p>
        <p>{message}</p>
      </div>
    </div>
  );
}

function contaNome(contas: Conta[], contaId: string): string {
  return contas.find((c) => c.id === contaId)?.nome ?? '—';
}

function liquidityBadgeClass(variant: ReturnType<typeof getLiquidityBadge>['variant']): string {
  if (variant === 'success') return styles.liquidityAvailable;
  if (variant === 'warning') return styles.liquidityPending;
  if (variant === 'destructive') return styles.liquidityCancelled;
  return styles.liquidityNeutral;
}

function transacaoScopeHint(row: Transacao): string | undefined {
  if (row.installmentNumber != null && (row.installmentTotal ?? 1) > 1) {
    return `Parcela ${row.installmentNumber} de ${row.installmentTotal}`;
  }
  if (row.recurringTransactionId) return 'Lançamento da série recorrente';
  return undefined;
}

function TransacaoRow({
  row,
  contas,
  onOpenEdit,
  onAction,
}: {
  row: Transacao;
  contas: Conta[];
  onOpenEdit: (row: Transacao) => void;
  onAction: (row: Transacao, action: SeriesBulkAction) => void;
}) {
  const amountClass = row.kind === 'RECEBIMENTO' ? styles.amountPositive : styles.amountNegative;
  const prefix = row.kind === 'RECEBIMENTO' ? '+' : '−';
  const dataVenda = row.dataCompetencia ?? row.dataPrevista;
  const dataLiquidacao = row.settlementDate ?? row.dataLiquidacaoPrevista ?? row.dataPrevista;
  const liquidity = getLiquidityBadge(dataLiquidacao, row.status, row.kind);
  const displayAmount =
    row.kind === 'RECEBIMENTO'
      ? effectiveReceivableAmount(row.valor, row.netValue, row.taxaDescontada)
      : row.valor;

  const isFinal = row.status === 'LIQUIDADO' || row.status === 'CANCELADO';
  const locked = transacaoIsEditLocked(row);

  return (
    <TableRow
      className={`${styles.clickableRow} ${locked ? styles.lockedRow : ''}`}
      tabIndex={0}
      role="button"
      aria-label={locked ? `Ver ${row.descricao}` : `Editar ${row.descricao}`}
      onClick={() => onOpenEdit(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenEdit(row);
        }
      }}
    >
      <TableCell>{formatDate(dataVenda)}</TableCell>
      <TableCell>
        <div className={styles.dateCell}>
          <span>{formatDate(dataLiquidacao)}</span>
          <span className={`${styles.liquidityBadge} ${liquidityBadgeClass(liquidity.variant)}`}>
            {liquidity.label}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {(row.isRecurring ?? row.recurringTransactionId != null) ? (
          <span className={styles.recurringIconWrap} title="Série recorrente">
            <Repeat size={14} className={styles.recurringIcon} aria-label="Série recorrente" />
          </span>
        ) : null}{' '}
        {row.descricao}
        {row.kind === 'RECEBIMENTO' && row.ordemServicoId ? (
          <span className={styles.rowMeta}> · OS #{row.ordemServicoId}</span>
        ) : null}
        {row.kind === 'PAGAMENTO' && row.fornecedor ? (
          <span className={styles.rowMeta}> · {row.fornecedor}</span>
        ) : null}
      </TableCell>
      <TableCell>{row.categoria}</TableCell>
      <TableCell>{contaNome(contas, row.contaId)}</TableCell>
      <TableCell>
        <div className={styles.statusCell}>
          <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
          {locked ? (
            <span className={styles.lockedBadge} title="Edição bloqueada">
              Bloqueado
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className={amountClass}>
        {prefix} {money(displayAmount)}
        {row.netValue != null && row.netValue < row.valor ? (
          <span className={styles.rowMeta}> bruto {money(row.valor)}</span>
        ) : null}
      </TableCell>
      <TableCell className={styles.actionsCol} onClick={(e) => e.stopPropagation()}>
        <div className={styles.rowActions}>
          {row.status !== 'LIQUIDADO' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.actionBtnIcon}
              title="Marcar como pago"
              aria-label="Marcar como pago"
              onClick={() => onAction(row, 'paid')}
            >
              <Check size={16} className={styles.actionIconPaid} />
            </Button>
          ) : null}
          {!isFinal ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.actionBtnIcon}
              title="Cancelar lançamento"
              aria-label="Cancelar lançamento"
              onClick={() => onAction(row, 'cancelled')}
            >
              <X size={16} className={styles.actionIconCancel} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${styles.actionBtnIcon} ${styles.actionBtnDelete}`}
            title="Excluir lançamento"
            aria-label="Excluir lançamento"
            onClick={() => onAction(row, 'delete')}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function FinanceDashboard() {
  const month = useMemo(() => currentMonthRange(), []);
  const [dataInicio, setDataInicio] = useState(() => toDateInput(month.inicio));
  const [dataFim, setDataFim] = useState(() => toDateInput(month.fim));
  const [periodPreset, setPeriodPreset] = useState<FinancePeriodPreset | 'custom'>('month');
  const [modalOpen, setModalOpen] = useState(false);
  const [filterContaId, setFilterContaId] = useState<string | undefined>();
  const [editWizardOpen, setEditWizardOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Transacao | null>(null);
  const [scopeActionOpen, setScopeActionOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    row: Transacao;
    action: SeriesBulkAction;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Transacao | null>(null);

  async function runSeriesAction(
    row: Transacao,
    action: SeriesBulkAction,
    scope: EditSeriesScope,
  ) {
    const entryId = transacaoApiId(row);
    if (entryId == null) return;
    const apiScope = toApiEditScope(scope);
    setActionBusy(true);
    try {
      if (action === 'delete') {
        await deleteFinanceEntry(entryId, { edit_scope: apiScope });
        toast.success('Lançamento(s) excluído(s).');
      } else {
        await patchFinanceEntry(entryId, {
          status: action === 'paid' ? 'paid' : 'cancelled',
          edit_scope: apiScope,
        });
        toast.success(action === 'paid' ? 'Marcado como pago.' : 'Lançamento(s) cancelado(s).');
      }
      setScopeActionOpen(false);
      setPendingAction(null);
      setDeleteConfirmOpen(false);
      setPendingDelete(null);
      if (editingRow?.id === row.id) {
        setEditWizardOpen(false);
        setEditingRow(null);
      }
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setActionBusy(false);
    }
  }

  function requestRowAction(row: Transacao, action: SeriesBulkAction) {
    if (transacaoLockReason(row) === 'reconciled') {
      toast.error('Lançamento conciliado. Desfaça a conciliação antes de alterar ou excluir.');
      return;
    }
    const kind = detectEditSeriesKindFromTransacao(row);
    if (needsEditScopePrompt(kind)) {
      setPendingAction({ row, action });
      setScopeActionOpen(true);
      return;
    }
    if (action === 'delete') {
      setPendingDelete(row);
      setDeleteConfirmOpen(true);
      return;
    }
    void runSeriesAction(row, action, 'single');
  }

  function beginEditRow(row: Transacao) {
    setEditingRow(row);
    setEditWizardOpen(true);
  }

  function closeEditWizard() {
    setEditWizardOpen(false);
    setEditingRow(null);
  }

  function applyPeriodPreset(preset: FinancePeriodPreset) {
    const { inicio, fim } = periodRangeForPreset(preset);
    setDataInicio(toDateInput(inicio));
    setDataFim(toDateInput(fim));
    setPeriodPreset(preset);
  }

  const periodo = useMemo(
    () => ({
      inicio: new Date(`${dataInicio}T00:00:00`),
      fim: new Date(`${dataFim}T23:59:59`),
    }),
    [dataInicio, dataFim],
  );

  const listParams = useMemo(
    () => ({ periodo, contaId: filterContaId }),
    [periodo, filterContaId],
  );

  const chartListParams = useMemo(() => {
    const bounds = chartPeriodBounds();
    return { periodo: bounds, contaId: filterContaId };
  }, [filterContaId]);

  const { data: ctx, isLoading: ctxLoading, isFetching: ctxFetching } = useFinanceServiceContext();
  const { data: entries, isLoading, isError, error, isSuccess, refetch, isFetching } = useFinanceEntries(
    listParams,
    { enabled: Boolean(dataInicio && dataFim) },
  );
  const { data: chartEntries, isLoading: chartLoading } = useFinanceEntries(chartListParams, {
    enabled: true,
  });

  const contas = ctx?.contas ?? [];
  const plano = ctx?.planoUsuario ?? 'SIMPLES';
  const isSimples = plano === 'SIMPLES';
  const upcoming = useFinanceUpcoming(entries);
  const { data: creditCardInvoicesSummary, isLoading: creditCardInvoicesLoading } =
    useCreditCardInvoicesSummary(!isSimples);
  const openInvoicesFromApi = creditCardInvoicesSummary?.open_invoices_total;

  const cashFlowSummary = useMemo(() => {
    if (!entries?.length) return { vendido: 0, liquidaHoje: 0 };
    const today = new Date();
    const recebimentos = entries.filter(
      (e) => e.kind === 'RECEBIMENTO' && e.status !== 'CANCELADO',
    );
    const vendido = recebimentos.reduce((s, e) => s + e.valor, 0);
    const liquidaHoje = recebimentos
      .filter((e) => {
        const prev = e.settlementDate ?? e.dataLiquidacaoPrevista ?? e.dataPrevista;
        return e.status === 'PENDENTE' && isSameCalendarDay(prev, today);
      })
      .reduce(
        (s, e) => s + effectiveReceivableAmount(e.valor, e.netValue, e.taxaDescontada),
        0,
      );
    return { vendido, liquidaHoje };
  }, [entries]);

  return (
    <div className={styles.page}>
      <ToastHost />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.subtitle}>
            Contas, fluxo de pagamentos e recebimentos.
            {(isFetching || ctxFetching) && !isLoading ? ' Atualizando…' : null}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/app/finance/reconciliation" style={{ textDecoration: 'none' }}>
            <Button type="button" variant="outline">
              Conciliação
            </Button>
          </Link>
          <Link to="/app/finance/reports/dre" style={{ textDecoration: 'none' }}>
            <Button type="button" variant="outline">
              DRE mensal
            </Button>
          </Link>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Atualizar
          </Button>
          <Button
            type="button"
            disabled={isSimples || ctxLoading || !ctx}
            title={isSimples ? 'Disponível no plano PRO' : undefined}
            onClick={() => setModalOpen(true)}
          >
            Nova transação
          </Button>
        </div>
      </header>

      {isSimples ? (
        <div className={styles.upgradeBanner}>
          <span>
            Seu plano <strong>SIMPLES</strong> permite visualizar o financeiro. Para registrar transações,
            faça upgrade para <strong>PRO</strong>.
          </span>
          <Link to="/app/marketplace">Ver planos</Link>
        </div>
      ) : null}

      <div className={styles.layout}>
        <FinanceSummarySidebar
          contas={contas}
          upcoming={upcoming}
          creditCardInvoices={creditCardInvoicesSummary?.cards}
          creditCardInvoicesLoading={creditCardInvoicesLoading}
          openInvoicesTotalOverride={openInvoicesFromApi}
          selectedContaId={filterContaId}
          onSelectConta={(id) =>
            setFilterContaId((prev) => (prev === id ? undefined : id))
          }
        />

        <div className={styles.main}>
          <FinancialCharts
            entries={chartEntries ?? entries}
            isLoading={isLoading || chartLoading}
          />

          <Card>
            <CardContent className={styles.filterBar}>
              <div className={styles.filterBarRow}>
                <h2 className={styles.filterBarTitle}>Filtros</h2>
                <div className={styles.periodPresets} role="group" aria-label="Período rápido">
                  {(['month', 'quarter', 'semester', 'year'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={
                        periodPreset === preset ? styles.presetBtnActive : styles.presetBtn
                      }
                      onClick={() => applyPeriodPreset(preset)}
                    >
                      {FINANCE_PERIOD_PRESET_LABELS[preset]}
                    </button>
                  ))}
                </div>
                <div className={styles.filterDates}>
                  <Input
                    id="filter-inicio"
                    type="date"
                    className={styles.filterDateInput}
                    value={dataInicio}
                    max={dataFim}
                    aria-label="Data início"
                    onChange={(e) => {
                      setDataInicio(e.target.value);
                      setPeriodPreset(
                        detectPeriodPreset(e.target.value, dataFim),
                      );
                    }}
                  />
                  <span className={styles.filterDateSep} aria-hidden>
                    até
                  </span>
                  <Input
                    id="filter-fim"
                    type="date"
                    className={styles.filterDateInput}
                    value={dataFim}
                    min={dataInicio}
                    aria-label="Data fim"
                    onChange={(e) => {
                      setDataFim(e.target.value);
                      setPeriodPreset(
                        detectPeriodPreset(dataInicio, e.target.value),
                      );
                    }}
                  />
                </div>
                {filterContaId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.filterClearConta}
                    onClick={() => setFilterContaId(undefined)}
                  >
                    Limpar conta
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transações</CardTitle>
              <CardDescription>
                {isSuccess && entries
                  ? `${entries.length} lançamento${entries.length === 1 ? '' : 's'} no período`
                  : 'Carregando movimentações…'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSuccess && entries && entries.length > 0 ? (
                <div className={styles.cashFlowStrip} role="status">
                  <div className={styles.cashFlowItem}>
                    <span className={styles.cashFlowLabel}>Vendido no período</span>
                    <strong className={styles.cashFlowValue}>{money(cashFlowSummary.vendido)}</strong>
                  </div>
                  <div className={styles.cashFlowDivider} aria-hidden />
                  <div className={styles.cashFlowItem}>
                    <span className={styles.cashFlowLabel}>Entra no caixa hoje (previsto)</span>
                    <strong className={styles.cashFlowValueAccent}>
                      {money(cashFlowSummary.liquidaHoje)}
                    </strong>
                  </div>
                </div>
              ) : null}
              {isLoading ? <EntriesTableSkeleton /> : null}
              {isError && error ? <FinanceErrorAlert message={error.message} /> : null}
              {isSuccess && entries && entries.length === 0 ? (
                <p className={styles.empty}>Nenhuma transação no período selecionado.</p>
              ) : null}
              {isSuccess && entries && entries.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data da venda</TableHead>
                      <TableHead>Data prevista</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className={styles.actionsCol}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((row) => (
                      <TransacaoRow
                        key={row.id}
                        row={row}
                        contas={contas}
                        onOpenEdit={beginEditRow}
                        onAction={requestRowAction}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {ctx ? (
        <TransactionWizardModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          ctx={ctx}
          contas={contas}
          listParams={listParams}
          defaultContaId={filterContaId}
        />
      ) : null}

      {ctx && editingRow ? (
        <TransactionWizardModal
          open={editWizardOpen}
          mode="edit"
          editTransaction={editingRow}
          onClose={closeEditWizard}
          onSaved={() => {
            closeEditWizard();
            void refetch();
          }}
          ctx={ctx}
          contas={contas}
          listParams={listParams}
        />
      ) : null}

      {pendingDelete ? (
        <FinanceDeleteConfirmModal
          open={deleteConfirmOpen}
          onOpenChange={(open) => {
            setDeleteConfirmOpen(open);
            if (!open) setPendingDelete(null);
          }}
          description={`Deseja excluir o lançamento "${pendingDelete.descricao}"?`}
          busy={actionBusy}
          onConfirm={() => void runSeriesAction(pendingDelete, 'delete', 'single')}
        />
      ) : null}

      {pendingAction ? (
        <SeriesActionScopeModal
          open={scopeActionOpen}
          onOpenChange={(open) => {
            setScopeActionOpen(open);
            if (!open) setPendingAction(null);
          }}
          action={pendingAction.action}
          seriesKind={detectEditSeriesKindFromTransacao(pendingAction.row)}
          hint={transacaoScopeHint(pendingAction.row)}
          busy={actionBusy}
          onConfirm={(scope) => void runSeriesAction(pendingAction.row, pendingAction.action, scope)}
        />
      ) : null}

    </div>
  );
}
