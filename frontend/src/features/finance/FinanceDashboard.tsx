import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { TransactionWizardModal } from './components/TransactionWizardModal';
import { chartPeriodBounds } from './financialChartsData';
import type { Conta } from './account.types';
import type { StatusTransacao, Transacao } from './transaction.types';
import {
  useFinanceEntries,
  useFinanceServiceContext,
  useFinanceUpcoming,
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

function TransacaoRow({ row, contas }: { row: Transacao; contas: Conta[] }) {
  const amountClass = row.kind === 'RECEBIMENTO' ? styles.amountPositive : styles.amountNegative;
  const prefix = row.kind === 'RECEBIMENTO' ? '+' : '−';
  const dataVenda = row.dataCompetencia ?? row.dataPrevista;
  const dataLiquidacao = row.settlementDate ?? row.dataLiquidacaoPrevista ?? row.dataPrevista;
  const liquidity = getLiquidityBadge(dataLiquidacao, row.status);
  const displayAmount =
    row.kind === 'RECEBIMENTO'
      ? effectiveReceivableAmount(row.valor, row.netValue, row.taxaDescontada)
      : row.valor;

  return (
    <TableRow>
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
        <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
      </TableCell>
      <TableCell className={amountClass}>
        {prefix} {money(displayAmount)}
        {row.netValue != null && row.netValue < row.valor ? (
          <span className={styles.rowMeta}> bruto {money(row.valor)}</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function FinanceDashboard() {
  const month = useMemo(() => currentMonthRange(), []);
  const [dataInicio, setDataInicio] = useState(() => toDateInput(month.inicio));
  const [dataFim, setDataFim] = useState(() => toDateInput(month.fim));
  const [modalOpen, setModalOpen] = useState(false);
  const [filterContaId, setFilterContaId] = useState<string | undefined>();

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
  const upcoming = useFinanceUpcoming(entries);

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

  const plano = ctx?.planoUsuario ?? 'SIMPLES';
  const isSimples = plano === 'SIMPLES';

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
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Período e conta para a listagem.</CardDescription>
            </CardHeader>
            <CardContent className={styles.filters}>
              <div className={styles.field}>
                <label htmlFor="filter-inicio">Data início</label>
                <Input
                  id="filter-inicio"
                  type="date"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="filter-fim">Data fim</label>
                <Input
                  id="filter-fim"
                  type="date"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
              {filterContaId ? (
                <Button type="button" variant="outline" onClick={() => setFilterContaId(undefined)}>
                  Limpar filtro de conta
                </Button>
              ) : null}
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((row) => (
                      <TransacaoRow key={row.id} row={row} contas={contas} />
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
    </div>
  );
}
