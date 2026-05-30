import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TransactionWizardModal } from '../../features/finance/components/TransactionWizardModal';
import { ServiceOrderProfitabilityBadge } from '../../features/finance/components/ServiceOrderProfitabilityBadge';
import { ServiceOrderProfitabilityWidget } from '../../features/finance/components/ServiceOrderProfitabilityWidget';
import { ServiceOrderFinanceSection } from '../../features/finance/components/ServiceOrderFinanceSection';
import { ServiceOrderFinanceTransactionsDrawer } from '../../features/finance/components/ServiceOrderFinanceTransactionsDrawer';
import {
  useFinanceServiceContext,
  useServiceOrderFinanceEntries,
} from '../../features/finance/hooks';
import type { LinkedServiceOrder } from '../../features/finance/serviceOrderFinance.types';
import {
  deriveServiceOrderPaymentStatus,
  financePaymentBadgeLabel,
} from '../../features/finance/serviceOrderFinanceUtils';

function currentMonthRange(): { inicio: Date; fim: Date } {
  const now = new Date();
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), 1),
    fim: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

export type ServiceOrderFinanceIntegrationProps = {
  serviceOrderId: number;
  clientId: number;
  clientLabel: string;
  orderTotal: number;
  orderNumber?: string;
  /** Recebimento (OS concluída). */
  enabled: boolean;
  /** Margem e custos (OS em andamento ou concluída). */
  showProfitability?: boolean;
  /** Widget completo de rentabilidade (OS concluída). */
  showProfitabilityWidget?: boolean;
};

/** Badge + seção financeira + wizard/drawer para OS concluída. */
export function useServiceOrderFinanceBadge(props: {
  serviceOrderId: number;
  orderTotal: number;
  enabled: boolean;
}) {
  const { data: entries = [] } = useServiceOrderFinanceEntries(props.serviceOrderId, {
    enabled: props.enabled && props.serviceOrderId > 0,
  });

  return useMemo(() => {
    if (!props.enabled) return null;
    const status = deriveServiceOrderPaymentStatus(entries, props.orderTotal);
    return financePaymentBadgeLabel(status);
  }, [props.enabled, props.orderTotal, entries]);
}

export function ServiceOrderFinanceIntegration({
  serviceOrderId,
  clientId,
  clientLabel,
  orderTotal,
  orderNumber,
  enabled,
  showProfitability = enabled,
  showProfitabilityWidget = false,
}: ServiceOrderFinanceIntegrationProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expenseWizardOpen, setExpenseWizardOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const financeActive = enabled || showProfitability;
  const financeCtx = useFinanceServiceContext({ enabled: financeActive });
  const listParams = useMemo(() => ({ periodo: currentMonthRange() }), []);
  const { data: entries = [], isLoading: entriesLoading, refetch } = useServiceOrderFinanceEntries(
    serviceOrderId,
    { enabled: financeActive && serviceOrderId > 0 },
  );

  const hasActiveRecebimento = entries.some(
    (e) => e.kind === 'RECEBIMENTO' && e.status !== 'CANCELADO',
  );

  const linkedServiceOrder: LinkedServiceOrder = useMemo(
    () => ({
      serviceOrderId,
      clientId,
      clientLabel,
      totalAmount: orderTotal,
      orderNumber,
    }),
    [serviceOrderId, clientId, clientLabel, orderTotal, orderNumber],
  );

  if (!enabled && !showProfitability) return null;

  if (financeCtx.isError) {
    return (
      <section style={{ padding: '1rem', color: 'var(--color-error)' }}>
        Não foi possível carregar o financeiro.{' '}
        <Link to="/app/finance/dashboard">Abrir módulo financeiro</Link>
      </section>
    );
  }

  if (financeCtx.isLoading || !financeCtx.data) {
    return (
      <section style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>
        Carregando dados financeiros…
      </section>
    );
  }

  return (
    <>
      {showProfitability ? (
        <div style={{ marginBottom: '0.75rem' }}>
          {showProfitabilityWidget ? (
            <ServiceOrderProfitabilityWidget serviceOrderId={serviceOrderId} entries={entries} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <ServiceOrderProfitabilityBadge serviceOrderId={serviceOrderId} entries={entries} />
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setExpenseWizardOpen(true)}
          >
            Registrar custo (insumo)
          </button>
        </div>
      ) : null}

      {enabled ? (
        <ServiceOrderFinanceSection
          orderTotal={orderTotal}
          entries={entries}
          canGenerateRecebimento={!hasActiveRecebimento}
          generateDisabledReason={
            hasActiveRecebimento
              ? 'Já existe um recebimento ativo para esta OS. A API permite apenas um lançamento por ordem.'
              : undefined
          }
          onGenerateRecebimento={() => setWizardOpen(true)}
          onViewTransacoes={() => setDrawerOpen(true)}
        />
      ) : null}

      <TransactionWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        ctx={financeCtx.data}
        contas={financeCtx.data.contas}
        listParams={listParams}
        linkedServiceOrder={linkedServiceOrder}
        linkedServiceOrderId={serviceOrderId}
        onPaymentRecorded={() => void refetch()}
      />

      <TransactionWizardModal
        open={expenseWizardOpen}
        onClose={() => setExpenseWizardOpen(false)}
        ctx={financeCtx.data}
        contas={financeCtx.data.contas}
        listParams={listParams}
        initialKind="PAGAMENTO"
        presetExpenseServiceOrderId={serviceOrderId}
        presetCategoria="Insumos"
        onPaymentRecorded={() => void refetch()}
      />

      <ServiceOrderFinanceTransactionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        serviceOrderId={serviceOrderId}
        entries={entries}
        isLoading={entriesLoading}
      />
    </>
  );
}
