import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from 'lucide-react';
import { ToastHost } from '../../../components/ToastHost';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import {
  getFinanceReconciliationDashboard,
  postFinanceReconciliationMatch,
  type FinanceReconciliationFeedLine,
  type ReconciliationFeedStatus,
  type ReconciliationEntryStatus,
} from '../../../api/finance';
import { parseBankAccountDomainId } from '../financeIds';
import { useFinanceServiceContext } from '../hooks';
import { financeQueryKeys } from '../hooks/financeQueryKeys';
import { autoMatchTransactions, suggestionForFeed } from './autoMatchTransactions';
import styles from './ReconciliationDashboard.module.css';

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDateBr(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
}

function feedStatusBadge(status: ReconciliationFeedStatus) {
  const map = {
    pending: { label: 'Pendente', variant: 'warning' as const },
    processed: { label: 'Processado', variant: 'success' as const },
    divergent: { label: 'Divergente', variant: 'destructive' as const },
  };
  const x = map[status];
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

function entryStatusBadge(status: ReconciliationEntryStatus) {
  const map = {
    pending: { label: 'Pendente', variant: 'warning' as const },
    reconciled: { label: 'Conciliado', variant: 'success' as const },
    divergent: { label: 'Divergente', variant: 'destructive' as const },
  };
  const x = map[status];
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

function providerLabel(p: string): string {
  if (p === 'mercadopago') return 'Mercado Pago';
  if (p === 'stone') return 'Stone / Pagar.me';
  return p;
}

function ListSkeleton() {
  return (
    <div className={styles.skeletonList} aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}

export function ReconciliationDashboard() {
  const month = useMemo(() => currentMonthRange(), []);
  const [startDate, setStartDate] = useState(month.start);
  const [endDate, setEndDate] = useState(month.end);
  const [contaFilter, setContaFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'mercadopago' | 'stone'>('all');
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: ctx, refetch: refetchCtx } = useFinanceServiceContext();
  const contas = ctx?.contas.filter((c) => c.status === 'ATIVA') ?? [];

  const financeAccountId = useMemo(() => {
    if (!contaFilter) return undefined;
    const c = contas.find((x) => x.id === contaFilter);
    if (c?.bankAccountId) return c.bankAccountId;
    return parseBankAccountDomainId(contaFilter) ?? undefined;
  }, [contaFilter, contas]);

  const dashboardQuery = useQuery({
    queryKey: [
      ...financeQueryKeys.all,
      'reconciliation',
      startDate,
      endDate,
      financeAccountId ?? 'all',
      providerFilter,
    ],
    queryFn: () =>
      getFinanceReconciliationDashboard({
        start_date: startDate,
        end_date: endDate,
        finance_account_id: financeAccountId,
        provider: providerFilter,
      }),
    enabled: Boolean(startDate && endDate),
    staleTime: 20_000,
  });

  const localSuggestions = useMemo(() => {
    if (!dashboardQuery.data) return [];
    return autoMatchTransactions(dashboardQuery.data.feed_lines, dashboardQuery.data.climaris_entries);
  }, [dashboardQuery.data]);

  const suggestions = useMemo(() => {
    const fromApi = dashboardQuery.data?.suggestions ?? [];
    if (fromApi.length > 0) return fromApi;
    return localSuggestions;
  }, [dashboardQuery.data?.suggestions, localSuggestions]);

  const matchMutation = useMutation({
    mutationFn: postFinanceReconciliationMatch,
    onSuccess: async () => {
      toast.success('Conciliação registrada. Saldo atualizado.');
      setSelectedFeedId(null);
      setSelectedEntryId(null);
      await Promise.all([
        dashboardQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.context() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.entriesRoot() }),
        refetchCtx(),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function applyMatch(feedId: string, entryId: number) {
    await matchMutation.mutateAsync({ feed_id: feedId, finance_entry_id: entryId });
  }

  function handleFeedClick(line: FinanceReconciliationFeedLine) {
    if (line.status === 'processed') return;
    setSelectedFeedId((prev) => (prev === line.id ? null : line.id));
    const sug = suggestionForFeed(line.id, suggestions);
    if (sug) setSelectedEntryId(sug.entry_id);
  }

  function handleEntryClick(entryId: number, status: ReconciliationEntryStatus) {
    if (status === 'reconciled') return;
    setSelectedEntryId((prev) => (prev === entryId ? null : entryId));
  }

  const canManualLink = Boolean(selectedFeedId && selectedEntryId);
  const loading = dashboardQuery.isLoading || dashboardQuery.isFetching;

  return (
    <div className={styles.page}>
      <ToastHost />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Conciliação bancária</h1>
          <p className={styles.subtitle}>
            Compare o extrato dos gateways (Mercado Pago / Stone) com os lançamentos do Climaris.
          </p>
        </div>
        <Link to="/app/finance/dashboard" style={{ textDecoration: 'none' }}>
          <Button type="button" variant="outline">
            ← Voltar ao financeiro
          </Button>
        </Link>
      </header>

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Conta</span>
          <Select value={contaFilter} onChange={(e) => setContaFilter(e.target.value)}>
            <option value="">Todas as contas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>De</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Até</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Gateway</span>
          <Select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value as typeof providerFilter)}
          >
            <option value="all">Todos</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="stone">Stone / Pagar.me</option>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void dashboardQuery.refetch()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden />
          Atualizar
        </Button>
      </div>

      {dashboardQuery.data?.fetch_errors?.length ? (
        <div className={styles.alert} role="alert">
          {dashboardQuery.data.fetch_errors.join(' · ')}
        </div>
      ) : null}

      {dashboardQuery.data?.providers_loaded?.length === 0 && !loading && !dashboardQuery.isError ? (
        <div className={styles.hint}>
          Conecte Mercado Pago ou Stone em{' '}
          <Link to="/app/finance/settings/accounts">Contas e carteiras</Link> para carregar o extrato via API.
        </div>
      ) : null}

      {dashboardQuery.isError ? (
        <div className={styles.alert} role="alert">
          {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Erro ao carregar.'}
        </div>
      ) : null}

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="bank-feed-title">
          <div className={styles.panelHeader}>
            <h2 id="bank-feed-title">Extrato bancário</h2>
            <p>Movimentações dos webhooks/API (gateways integrados)</p>
          </div>
          <div className={styles.panelBody}>
            {loading ? (
              <ListSkeleton />
            ) : (dashboardQuery.data?.feed_lines.length ?? 0) === 0 ? (
              <p className={styles.empty}>Nenhuma linha no período.</p>
            ) : (
              dashboardQuery.data?.feed_lines.map((line) => {
                const sug = suggestionForFeed(line.id, suggestions);
                const selected = selectedFeedId === line.id;
                const suggested = Boolean(sug && line.status === 'pending');
                return (
                  <div
                    key={line.id}
                    role="button"
                    tabIndex={0}
                    className={`${styles.item} ${selected ? styles.itemSelected : ''} ${suggested ? styles.itemSuggested : ''}`}
                    onClick={() => handleFeedClick(line)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleFeedClick(line);
                      }
                    }}
                  >
                    {suggested ? <Link2 size={16} className={styles.linkIcon} aria-hidden /> : null}
                    <div className={styles.itemMain}>
                      <p className={styles.itemTitle}>
                        <span className={styles.providerTag}>{providerLabel(line.provider)}</span>
                        {line.description}
                      </p>
                      <p className={styles.itemMeta}>
                        Liquidação {formatDateBr(line.settlement_date)} · ID {line.external_id}
                      </p>
                      <div style={{ marginTop: '0.35rem' }}>{feedStatusBadge(line.status)}</div>
                    </div>
                    <span className={styles.itemAmount}>{money(line.amount)}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="climaris-entries-title">
          <div className={styles.panelHeader}>
            <h2 id="climaris-entries-title">Lançamentos Climaris</h2>
            <p>Recebimentos ainda não conciliados com o extrato</p>
          </div>
          <div className={styles.panelBody}>
            {loading ? (
              <ListSkeleton />
            ) : (dashboardQuery.data?.climaris_entries.length ?? 0) === 0 ? (
              <p className={styles.empty}>Nenhum lançamento pendente de conciliação.</p>
            ) : (
              dashboardQuery.data?.climaris_entries.map((entry) => {
                const selected = selectedEntryId === entry.id;
                const linkedToSelectedFeed =
                  selectedFeedId &&
                  suggestions.some((s) => s.feed_id === selectedFeedId && s.entry_id === entry.id);
                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    className={`${styles.item} ${selected ? styles.itemSelected : ''} ${linkedToSelectedFeed ? styles.itemSuggested : ''}`}
                    onClick={() => handleEntryClick(entry.id, entry.status)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEntryClick(entry.id, entry.status);
                      }
                    }}
                  >
                    {linkedToSelectedFeed ? <Link2 size={16} className={styles.linkIcon} aria-hidden /> : null}
                    <div className={styles.itemMain}>
                      <p className={styles.itemTitle}>{entry.description}</p>
                      <p className={styles.itemMeta}>
                        Prev. {formatDateBr(entry.settlement_date)} · {entry.payment_provider ?? '—'}
                      </p>
                      <div style={{ marginTop: '0.35rem' }}>{entryStatusBadge(entry.status)}</div>
                    </div>
                    <span className={styles.itemAmount}>{money(entry.amount)}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className={styles.toolbar}>
        <Button
          type="button"
          disabled={!canManualLink || matchMutation.isPending}
          onClick={() => {
            if (selectedFeedId && selectedEntryId) void applyMatch(selectedFeedId, selectedEntryId);
          }}
        >
          <Link2 size={16} aria-hidden />
          Conciliar manualmente
        </Button>
        {selectedFeedId ? (
          <Button
            type="button"
            variant="outline"
            disabled={matchMutation.isPending}
            onClick={() => {
              const sug = suggestionForFeed(selectedFeedId, suggestions);
              if (sug) void applyMatch(sug.feed_id, sug.entry_id);
            }}
          >
            Conciliar automaticamente
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled>
            Selecione um item do extrato
          </Button>
        )}
        {matchMutation.isPending ? (
          <span className={styles.subtitle} style={{ alignSelf: 'center' }}>
            Salvando…
          </span>
        ) : null}
      </div>
    </div>
  );
}
