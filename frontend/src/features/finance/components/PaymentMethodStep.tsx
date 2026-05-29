import { useMemo } from 'react';
import wizardStyles from '../../../pages/integrations/CampaignDashboard.module.css';
import type { PlanoRecebimento } from '../../../schemas/financeMaquininha';
import type { Conta } from '../account.types';
import {
  calculateNetValue,
  calculateSettlementDateFromFlow,
  machinePlanToPlano,
  planoToMachinePlan,
  resolveMaquininhaFee,
  type PaymentMethodFlow,
} from '../financeCalculator';
import type { MaquininhaOption } from '../hooks/useFinancePaymentFees';
import type { SimulatorMode } from '../../../lib/financeMaquininhaUtils';
import styles from './TransactionWizardModal.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDateBr(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function contaTypeLabel(tipo: Conta['tipo']): string {
  const m: Record<Conta['tipo'], string> = {
    BANCO: 'Banco',
    MAQUININHA: 'Maquininha',
    GATEWAY_PIX: 'Pix',
    GATEWAY_BOLETO: 'Boleto',
  };
  return m[tipo] ?? tipo;
}

const MACHINE_PLAN_OPTIONS: { value: 'D0' | 'D1' | '30D'; label: string }[] = [
  { value: 'D0', label: 'D+0 (mesmo dia)' },
  { value: 'D1', label: 'D+1 (dia útil)' },
  { value: '30D', label: '30 dias' },
];

export type PaymentMethodStepProps = {
  paymentFlow: PaymentMethodFlow | null;
  onPaymentFlowChange: (flow: PaymentMethodFlow) => void;
  contaId: string;
  onContaIdChange: (id: string) => void;
  contas: Conta[];
  valorNum: number;
  dataVenda: string;
  boletoVencimento: string;
  onBoletoVencimentoChange: (v: string) => void;
  maquininhaProvider: string;
  onMaquininhaProviderChange: (provider: string) => void;
  maquininhaPlano: PlanoRecebimento;
  onMaquininhaPlanoChange: (p: PlanoRecebimento) => void;
  maquininhaModo: SimulatorMode;
  onMaquininhaModoChange: (m: SimulatorMode) => void;
  parcelas: number;
  onParcelasChange: (n: number) => void;
  maquininhaOptions: MaquininhaOption[];
  showOsMaquininhaSummary?: boolean;
};

export function PaymentMethodStep({
  paymentFlow,
  onPaymentFlowChange,
  contaId,
  onContaIdChange,
  contas,
  valorNum,
  dataVenda,
  boletoVencimento,
  onBoletoVencimentoChange,
  maquininhaProvider,
  onMaquininhaProviderChange,
  maquininhaPlano,
  onMaquininhaPlanoChange,
  maquininhaModo,
  onMaquininhaModoChange,
  parcelas,
  onParcelasChange,
  maquininhaOptions,
  showOsMaquininhaSummary,
}: PaymentMethodStepProps) {
  const saleDate = useMemo(() => new Date(`${dataVenda}T12:00:00`), [dataVenda]);
  const machinePlan = planoToMachinePlan(maquininhaPlano);
  const selectedConta = contas.find((c) => c.id === contaId);

  const selectedMachine = maquininhaOptions.find(
    (m) => m.providerName === maquininhaProvider,
  );

  const feeResult = useMemo(() => {
    if (!selectedMachine || valorNum <= 0 || paymentFlow !== 'maquininha') return null;
    return resolveMaquininhaFee(
      selectedMachine.config.planos[maquininhaPlano],
      maquininhaModo,
      parcelas,
      valorNum,
    );
  }, [selectedMachine, maquininhaPlano, maquininhaModo, parcelas, valorNum, paymentFlow]);

  const netValue = useMemo(() => {
    if (paymentFlow === 'maquininha' && feeResult) return feeResult.net;
    if (paymentFlow === 'pix' || paymentFlow === 'boleto') return calculateNetValue(valorNum, 0);
    return null;
  }, [paymentFlow, feeResult, valorNum]);

  const settlementPreview = useMemo(() => {
    if (!paymentFlow) return null;
    const boletoDue = boletoVencimento ? new Date(`${boletoVencimento}T12:00:00`) : saleDate;
    return calculateSettlementDateFromFlow(paymentFlow, saleDate, {
      machinePlan: maquininhaPlano,
      boletoDueDate: boletoDue,
      installmentCount: parcelas,
      installmentIndex: 1,
    });
  }, [paymentFlow, parcelas, saleDate, maquininhaPlano, boletoVencimento]);

  return (
    <>
      <label className={wizardStyles.fieldLabel} htmlFor="payment-flow-select">
        Forma de pagamento
      </label>
      <select
        id="payment-flow-select"
        className={wizardStyles.textInput}
        value={paymentFlow ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'pix' || v === 'boleto' || v === 'maquininha') onPaymentFlowChange(v);
        }}
        required
      >
        <option value="">Selecionar forma</option>
        <option value="pix">PIX</option>
        <option value="boleto">Boleto</option>
        <option value="maquininha">Maquininha</option>
      </select>

      {paymentFlow ? (
        <div className={styles.accountBlock}>
          <label className={wizardStyles.fieldLabel} htmlFor="liquidacao-conta-select">
            Em qual conta este valor será liquidado?
          </label>
          <select
            id="liquidacao-conta-select"
            className={wizardStyles.textInput}
            value={contaId}
            onChange={(e) => onContaIdChange(e.target.value)}
            required
          >
            <option value="">Selecionar conta ativa</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({contaTypeLabel(c.tipo)}) — saldo {money(c.saldoAtual)}
              </option>
            ))}
          </select>

          {contas.length === 0 ? (
            <p className={styles.hint}>Nenhuma conta ativa. Cadastre em Financeiro → Contas.</p>
          ) : null}

          {contaId && settlementPreview && selectedConta ? (
            <div className={styles.cashFlowFeedback}>
              <p className={styles.settlementPreviewLine}>
                💰 Entrada prevista no caixa: <strong>{formatDateBr(settlementPreview)}</strong>
              </p>
              <p className={styles.hint} style={{ margin: 0 }}>
                Conta: <strong>{selectedConta.nome}</strong>
                {paymentFlow === 'pix' ? ' · liquidação D+0' : null}
                {paymentFlow === 'boleto' ? ' · conforme vencimento do boleto' : null}
                {paymentFlow === 'maquininha' ? ' · conforme plano da maquininha' : null}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {paymentFlow === 'boleto' ? (
        <div className={styles.flowPanel}>
          <label className={wizardStyles.fieldLabel}>Data de vencimento</label>
          <input
            className={wizardStyles.textInput}
            type="date"
            value={boletoVencimento}
            min={dataVenda}
            onChange={(e) => onBoletoVencimentoChange(e.target.value)}
            required
          />
          <p className={styles.hint}>
            O lançamento ficará <strong>Pendente</strong> até o vencimento ou baixa manual.
          </p>
        </div>
      ) : null}

      {paymentFlow === 'maquininha' ? (
        <div className={styles.flowPanel}>
          <label className={wizardStyles.fieldLabel}>Maquininha cadastrada (taxas)</label>
          <select
            className={wizardStyles.textInput}
            value={maquininhaProvider}
            onChange={(e) => onMaquininhaProviderChange(e.target.value)}
            required
          >
            <option value="">Selecionar maquininha</option>
            {maquininhaOptions.map((m) => (
              <option key={m.providerName} value={m.providerName}>
                {m.providerName}
              </option>
            ))}
          </select>

          {maquininhaOptions.length === 0 ? (
            <p className={styles.hint}>
              Nenhuma maquininha cadastrada. Configure em Financeiro → Maquininhas.
            </p>
          ) : null}

          <label className={wizardStyles.fieldLabel}>Plano</label>
          <select
            className={wizardStyles.textInput}
            value={machinePlan}
            onChange={(e) =>
              onMaquininhaPlanoChange(machinePlanToPlano(e.target.value as 'D0' | 'D1' | '30D'))
            }
          >
            {MACHINE_PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <div className={styles.grid2}>
            <div>
              <label className={wizardStyles.fieldLabel}>Modalidade</label>
              <select
                className={wizardStyles.textInput}
                value={maquininhaModo}
                onChange={(e) => onMaquininhaModoChange(e.target.value as SimulatorMode)}
              >
                <option value="debit">Débito</option>
                <option value="credit">Crédito</option>
              </select>
            </div>
            <div>
              <label className={wizardStyles.fieldLabel}>Parcelas</label>
              <select
                className={wizardStyles.textInput}
                value={parcelas}
                onChange={(e) => onParcelasChange(Number(e.target.value))}
                disabled={maquininhaModo === 'debit'}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </div>
          </div>

          {netValue != null && feeResult ? (
            <div className={styles.netValueCard}>
              <span className={styles.netValueLabel}>Valor líquido</span>
              <strong className={styles.netValueAmount}>{money(netValue)}</strong>
              <span className={styles.netValueMeta}>
                Taxa {feeResult.feePercent}% ({money(feeResult.feeAmount)})
              </span>
            </div>
          ) : null}

          {showOsMaquininhaSummary && feeResult && settlementPreview ? (
            <p className={styles.osSummary}>
              Resumo OS · Taxa {feeResult.feePercent}% · Recebimento estimado em{' '}
              <strong>{formatDateBr(settlementPreview)}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {paymentFlow && paymentFlow !== 'maquininha' && netValue != null ? (
        <div className={styles.netValueCard}>
          <span className={styles.netValueLabel}>Valor líquido</span>
          <strong className={styles.netValueAmount}>{money(netValue)}</strong>
        </div>
      ) : null}
    </>
  );
}
