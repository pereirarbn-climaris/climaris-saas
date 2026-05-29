import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import wizardStyles from '../../../pages/integrations/CampaignDashboard.module.css';
import type { PlanoRecebimento } from '../../../schemas/financeMaquininha';
import type { SimulatorMode } from '../../../lib/financeMaquininhaUtils';
import { gatewayProviderFromDomainId } from '../financeIds';
import type { Conta } from '../account.types';
import type { FinanceServiceContext } from '../finance.types';
import type { CreateTransacaoApiOptions } from '../financeAdapter';
import { ClientOSCombobox } from './ClientOSCombobox';
import { PaymentMethodStep } from './PaymentMethodStep';
import {
  useClientOSLinkOptions,
  isValidClientOSSelection,
} from '../hooks/useClientOSLinkOptions';
import { useCreateFinanceEntry } from '../hooks';
import { buildMaquininhaOptions, useFinancePaymentFees } from '../hooks/useFinancePaymentFees';
import type { CreateTransactionInput } from '../transaction.types';
import type { LinkedServiceOrder } from '../serviceOrderFinance.types';
import {
  calculateNetValue,
  calculateParcelDueDate,
  calculateSettlementDateFromFlow,
  parseDateInput,
  resolveMaquininhaFee,
  resolveMaquininhaPaymentMethod,
  settlementPlanForMaquininhaPlan,
  type PaymentMethodFlow,
} from '../financeCalculator';
import styles from './TransactionWizardModal.module.css';

const STEPS_RECEBIMENTO = [
  { id: 1, label: 'Valor' },
  { id: 2, label: 'Pagamento' },
  { id: 3, label: 'Vínculos' },
  { id: 4, label: 'Revisão' },
] as const;

const STEPS_PAGAMENTO = [
  { id: 1, label: 'Tipo e valor' },
  { id: 2, label: 'Classificação' },
  { id: 3, label: 'Revisão' },
] as const;

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDateBr(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function pickPrincipalBank(contas: Conta[]): Conta | undefined {
  return (
    contas.find((c) => c.status === 'ATIVA' && c.tipo === 'BANCO' && c.bankAccountId) ??
    contas.find((c) => c.status === 'ATIVA' && c.tipo === 'BANCO')
  );
}

function pickBoletoConta(contas: Conta[]): Conta | undefined {
  return contas.find((c) => c.status === 'ATIVA' && c.tipo === 'GATEWAY_BOLETO');
}

export type TransactionWizardModalProps = {
  open: boolean;
  onClose: () => void;
  ctx: FinanceServiceContext;
  contas: Conta[];
  listParams: { periodo: { inicio: Date; fim: Date }; contaId?: string };
  defaultContaId?: string;
  linkedServiceOrder?: LinkedServiceOrder | null;
  linkedServiceOrderId?: number;
  onPaymentRecorded?: () => void;
};

export function TransactionWizardModal({
  open,
  onClose,
  ctx,
  contas,
  listParams,
  defaultContaId,
  linkedServiceOrder = null,
  linkedServiceOrderId,
  onPaymentRecorded,
}: TransactionWizardModalProps) {
  const osLink = linkedServiceOrder;
  const osLinkLocked = Boolean(osLink);
  const createEntry = useCreateFinanceEntry();
  const { data: paymentFees = [] } = useFinancePaymentFees(open);
  const activeContas = useMemo(() => contas.filter((c) => c.status === 'ATIVA'), [contas]);

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<'RECEBIMENTO' | 'PAGAMENTO'>('RECEBIMENTO');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVenda, setDataVenda] = useState(() => toDateInput(new Date()));
  const [dataPrevista, setDataPrevista] = useState(() => toDateInput(new Date()));
  const [contaId, setContaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('venda');
  const [fornecedor, setFornecedor] = useState('');
  const [linkSelectionId, setLinkSelectionId] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [clienteId, setClienteId] = useState<number | undefined>();
  const [ordemServicoId, setOrdemServicoId] = useState<number | undefined>();

  const [paymentFlow, setPaymentFlow] = useState<PaymentMethodFlow | null>(null);
  const [boletoVencimento, setBoletoVencimento] = useState(() => toDateInput(new Date()));
  const [maquininhaProvider, setMaquininhaProvider] = useState('');
  const [maquininhaPlano, setMaquininhaPlano] = useState<PlanoRecebimento>('D1');
  const [maquininhaModo, setMaquininhaModo] = useState<SimulatorMode>('debit');
  const [parcelas, setParcelas] = useState(1);

  const steps = kind === 'RECEBIMENTO' ? STEPS_RECEBIMENTO : STEPS_PAGAMENTO;
  const maxStep = steps.length;

  const valorNum = Number.parseFloat(valorBruto.replace(',', '.')) || 0;
  const saleDate = useMemo(() => parseDateInput(dataVenda), [dataVenda]);

  const machineIdByProvider = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of activeContas.filter((x) => x.tipo === 'MAQUININHA')) {
      m.set(c.nome.trim().toLowerCase(), c.id);
    }
    return m;
  }, [activeContas]);

  const maquininhaOptions = useMemo(
    () => buildMaquininhaOptions(paymentFees, machineIdByProvider),
    [paymentFees, machineIdByProvider],
  );

  const principalBank = useMemo(() => pickPrincipalBank(activeContas), [activeContas]);
  const boletoConta = useMemo(() => pickBoletoConta(activeContas), [activeContas]);

  const { options: linkOptions } = useClientOSLinkOptions('', open);
  const linkSelectionValid = useMemo(
    () => isValidClientOSSelection(linkOptions, linkSelectionId),
    [linkOptions, linkSelectionId],
  );

  const selectedMachine = maquininhaOptions.find((m) => m.providerName === maquininhaProvider);
  const liquidacaoConta = activeContas.find((c) => c.id === contaId);

  const settlementPreview = useMemo(() => {
    if (kind !== 'RECEBIMENTO' || !paymentFlow) return null;
    const boletoDue = boletoVencimento ? parseDateInput(boletoVencimento) : saleDate;
    return calculateSettlementDateFromFlow(paymentFlow, saleDate, {
      machinePlan: maquininhaPlano,
      boletoDueDate: boletoDue,
      installmentCount: parcelas,
      installmentIndex: 1,
    });
  }, [kind, paymentFlow, parcelas, saleDate, maquininhaPlano, boletoVencimento]);

  const maquininhaFeePreview = useMemo(() => {
    if (!selectedMachine || valorNum <= 0) return null;
    return resolveMaquininhaFee(
      selectedMachine.config.planos[maquininhaPlano],
      maquininhaModo,
      parcelas,
      valorNum,
    );
  }, [selectedMachine, maquininhaPlano, maquininhaModo, parcelas, valorNum]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setKind('RECEBIMENTO');
    const today = toDateInput(new Date());
    setDataVenda(today);
    setDataPrevista(today);
    setBoletoVencimento(today);
    setPaymentFlow(null);
    setMaquininhaPlano('D1');
    setMaquininhaModo('debit');
    setParcelas(1);
    setMaquininhaProvider('');
    setCategoria('venda');
    setFornecedor('');

    if (osLink) {
      const osNum = osLink.orderNumber ?? String(osLink.serviceOrderId);
      setValorBruto(String(osLink.totalAmount));
      setDescricao(`Recebimento OS #${osNum}`);
      setClienteId(osLink.clientId);
      setOrdemServicoId(osLink.serviceOrderId);
      setLinkSelectionId(`os:${osLink.serviceOrderId}`);
      setLinkLabel(osLink.clientLabel);
    } else {
      setValorBruto('');
      setDescricao('');
      setLinkSelectionId(null);
      setLinkLabel('');
      setClienteId(undefined);
      setOrdemServicoId(undefined);
    }

    const first = defaultContaId ?? principalBank?.id ?? activeContas[0]?.id ?? '';
    setContaId(first);
  }, [open, defaultContaId, activeContas, osLink, principalBank?.id]);

  useEffect(() => {
    if (maquininhaOptions.length && !maquininhaProvider) {
      setMaquininhaProvider(maquininhaOptions[0].providerName);
    }
  }, [maquininhaOptions, maquininhaProvider]);

  function suggestLiquidationAccount(flow: PaymentMethodFlow): string {
    if (flow === 'pix') return principalBank?.id ?? activeContas[0]?.id ?? '';
    if (flow === 'boleto') {
      return boletoConta?.id ?? principalBank?.id ?? activeContas[0]?.id ?? '';
    }
    return principalBank?.id ?? activeContas[0]?.id ?? '';
  }

  function handlePaymentFlowChange(flow: PaymentMethodFlow) {
    setPaymentFlow(flow);
    setContaId((prev) => {
      if (prev && activeContas.some((c) => c.id === prev)) return prev;
      return suggestLiquidationAccount(flow);
    });
  }

  function paymentProviderFromConta(conta: Conta | undefined): string | null {
    if (!conta) return null;
    if (conta.tipo === 'GATEWAY_PIX' || conta.tipo === 'GATEWAY_BOLETO') {
      return gatewayProviderFromDomainId(conta.id);
    }
    if (conta.nome.toLowerCase().includes('caixa')) return 'caixa';
    return null;
  }

  useEffect(() => {
    if (maquininhaModo === 'debit') setParcelas(1);
  }, [maquininhaModo]);

  if (!open) return null;

  const conta = activeContas.find((c) => c.id === contaId);
  const linkOk = osLinkLocked || linkSelectionValid;

  const paymentStepValid = Boolean(
    paymentFlow &&
      contaId &&
      activeContas.some((c) => c.id === contaId) &&
      (paymentFlow !== 'boleto' || Boolean(boletoVencimento)) &&
      (paymentFlow !== 'maquininha' || Boolean(maquininhaProvider && selectedMachine)),
  );

  const canNext =
    (step === 1 &&
      valorNum > 0 &&
      descricao.trim().length >= 2 &&
      (kind === 'RECEBIMENTO' ? Boolean(dataVenda) : Boolean(contaId) && Boolean(dataPrevista))) ||
    (step === 2 &&
      kind === 'RECEBIMENTO' &&
      paymentStepValid) ||
    (step === 2 &&
      kind === 'PAGAMENTO' &&
      Boolean(fornecedor.trim() || categoria.trim())) ||
    (step === 3 &&
      kind === 'RECEBIMENTO' &&
      linkOk) ||
    (step === 3 && kind === 'PAGAMENTO');

  const reviewStep = maxStep;
  const canFinish =
    step === reviewStep &&
    (kind === 'PAGAMENTO'
      ? Boolean(fornecedor.trim() || categoria.trim()) && Boolean(contaId)
      : linkOk && paymentStepValid);

  function resolveRecebimentoContaAndStatus(): {
    contaId: string;
    status: 'PENDENTE' | 'LIQUIDADO';
    dueDate: Date;
  } {
    if (!contaId) throw new Error('Selecione a conta de liquidação.');

    if (paymentFlow === 'pix') {
      return {
        contaId,
        status: 'LIQUIDADO',
        dueDate: saleDate,
      };
    }
    if (paymentFlow === 'boleto') {
      return {
        contaId,
        status: 'PENDENTE',
        dueDate: parseDateInput(boletoVencimento),
      };
    }
    const due = calculateParcelDueDate('maquininha', saleDate, {
      installmentIndex: 1,
      machinePlan: maquininhaPlano,
      installmentCount: parcelas,
    });
    return {
      contaId,
      status: 'PENDENTE',
      dueDate: due,
    };
  }

  function buildSettlementMeta(): {
    settlementDate: Date;
    netValue: number;
    feeApplied: number;
  } | undefined {
    if (!paymentFlow || !settlementPreview) return undefined;
    const feePercent = maquininhaFeePreview?.feePercent ?? 0;
    const net = maquininhaFeePreview?.net ?? calculateNetValue(valorNum, feePercent);
    return {
      settlementDate: settlementPreview,
      netValue: net,
      feeApplied: feePercent,
    };
  }

  function buildApiOptions(): CreateTransacaoApiOptions | undefined {
    if (kind !== 'RECEBIMENTO' || !paymentFlow) return undefined;

    const settlementPlan =
      paymentFlow === 'maquininha'
        ? settlementPlanForMaquininhaPlan(maquininhaPlano)
        : 'same_as_due';
    const meta = buildSettlementMeta();

    if (paymentFlow === 'pix') {
      return {
        competenceDate: saleDate,
        settlementPlan,
        settlementDate: meta?.settlementDate,
        netValue: meta?.netValue,
        feeApplied: meta?.feeApplied,
        paymentMethod: 'pix',
        paymentProvider: paymentProviderFromConta(liquidacaoConta),
        installments: 1,
      };
    }

    if (paymentFlow === 'boleto') {
      return {
        competenceDate: saleDate,
        settlementPlan,
        settlementDate: meta?.settlementDate,
        netValue: meta?.netValue,
        feeApplied: meta?.feeApplied,
        paymentMethod: 'boleto',
        paymentProvider: paymentProviderFromConta(liquidacaoConta),
        installments: 1,
      };
    }

    if (!selectedMachine) return undefined;
    const fee = maquininhaFeePreview;
    return {
      competenceDate: saleDate,
      settlementPlan,
      settlementDate: meta?.settlementDate,
      netValue: meta?.netValue,
      feeApplied: meta?.feeApplied,
      paymentMethod: resolveMaquininhaPaymentMethod(maquininhaPlano, maquininhaModo),
      paymentProvider: selectedMachine.providerName,
      installments: parcelas,
      installmentIntervalMonths: 1,
      taxaPercentualMaquininha: fee?.feePercent,
      feeAmount: fee?.feeAmount,
    };
  }

  function buildInput(): CreateTransactionInput {
    if (kind === 'RECEBIMENTO') {
      if (!linkOk || clienteId == null || !paymentFlow) {
        throw new Error('Complete o vínculo e a forma de pagamento.');
      }
      const { contaId: resolvedConta, status, dueDate } = resolveRecebimentoContaAndStatus();
      return {
        kind: 'RECEBIMENTO',
        valor: valorNum,
        dataPrevista: dueDate,
        status,
        contaId: resolvedConta,
        descricao: descricao.trim(),
        categoria: categoria.trim(),
        clienteId,
        ordemServicoId,
      };
    }

    return {
      kind: 'PAGAMENTO',
      valor: valorNum,
      dataPrevista: new Date(`${dataPrevista}T12:00:00`),
      status: 'PENDENTE',
      contaId,
      descricao: descricao.trim(),
      categoria: categoria.trim(),
      fornecedor: fornecedor.trim() || undefined,
    };
  }

  function handleClose() {
    if (!createEntry.isPending) onClose();
  }

  function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (step < maxStep) {
      if (step === 3 && kind === 'RECEBIMENTO' && !linkOk) return;
      setStep((s) => s + 1);
      return;
    }
    if (!canFinish) return;

    const input = buildInput();
    const apiOpts = buildApiOptions();
    const soId = linkedServiceOrderId ?? osLink?.serviceOrderId;

    createEntry.mutate(
      {
        ctx,
        input,
        listParams,
        linkedServiceOrderId: soId,
        options: apiOpts,
        onRecorded: () => onPaymentRecorded?.(),
      },
      { onSuccess: () => onClose() },
    );
  }

  function paymentFlowLabel(flow: PaymentMethodFlow | null): string {
    if (flow === 'pix') return 'PIX (D+0)';
    if (flow === 'boleto') return 'Boleto';
    if (flow === 'maquininha') return `Maquininha · ${selectedMachine?.providerName ?? ''}`;
    return '—';
  }

  return (
    <div
      className={wizardStyles.wizardOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Nova transação"
    >
      <header className={wizardStyles.wizardTop}>
        <button type="button" className={wizardStyles.btnIcon} onClick={handleClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>{osLinkLocked ? 'Recebimento da OS' : 'Nova transação'}</h2>
        <nav className={wizardStyles.stepper} aria-label="Etapas">
          {steps.map((s, idx) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className={wizardStyles.stepItem}>
                <div
                  className={`${wizardStyles.stepDot} ${active ? wizardStyles.stepDotActive : ''} ${done ? wizardStyles.stepDotDone : ''}`}
                >
                  {done ? <Check size={14} /> : s.id}
                </div>
                <span className={`${wizardStyles.stepLabel} ${active ? wizardStyles.stepLabelActive : ''}`}>
                  {s.label}
                </span>
                {idx < steps.length - 1 ? (
                  <div className={`${wizardStyles.stepLine} ${done ? wizardStyles.stepLineDone : ''}`} />
                ) : null}
              </div>
            );
          })}
        </nav>
        <div style={{ width: '2.25rem' }} />
      </header>

      <form className={wizardStyles.wizardBody} onSubmit={handleSubmit}>
        <div className={wizardStyles.wizardContent}>
          {step === 1 ? (
            <>
              {!osLinkLocked ? (
                <div className={styles.kindRow}>
                  <button
                    type="button"
                    className={`${styles.kindBtn} ${kind === 'RECEBIMENTO' ? styles.kindBtnActive : ''}`}
                    onClick={() => {
                      setKind('RECEBIMENTO');
                      setStep(1);
                    }}
                  >
                    Recebimento
                  </button>
                  <button
                    type="button"
                    className={`${styles.kindBtn} ${kind === 'PAGAMENTO' ? styles.kindBtnActive : ''}`}
                    onClick={() => {
                      setKind('PAGAMENTO');
                      setStep(1);
                    }}
                  >
                    Pagamento
                  </button>
                </div>
              ) : (
                <p className={styles.hint}>Recebimento vinculado à ordem de serviço concluída.</p>
              )}

              <label className={wizardStyles.fieldLabel}>Descrição</label>
              <input
                className={wizardStyles.textInput}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Venda OS #1024"
                required
              />

              <div className={styles.grid2}>
                <div>
                  <label className={wizardStyles.fieldLabel}>Valor bruto (R$)</label>
                  <input
                    className={wizardStyles.textInput}
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorBruto}
                    onChange={(e) => setValorBruto(e.target.value)}
                    readOnly={osLinkLocked}
                    required
                  />
                </div>
                <div>
                  <label className={wizardStyles.fieldLabel}>
                    {kind === 'RECEBIMENTO' ? 'Data da venda' : 'Data prevista'}
                  </label>
                  <input
                    className={wizardStyles.textInput}
                    type="date"
                    value={kind === 'RECEBIMENTO' ? dataVenda : dataPrevista}
                    onChange={(e) =>
                      kind === 'RECEBIMENTO' ? setDataVenda(e.target.value) : setDataPrevista(e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {kind === 'PAGAMENTO' ? (
                <>
                  <label className={wizardStyles.fieldLabel}>Conta</label>
                  <select
                    className={wizardStyles.textInput}
                    value={contaId}
                    onChange={(e) => setContaId(e.target.value)}
                    required
                  >
                    <option value="">Selecionar conta ativa</option>
                    {activeContas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.tipo}) — {money(c.saldoAtual)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className={styles.hint}>A conta e a liquidação serão definidas na etapa de pagamento.</p>
              )}
            </>
          ) : null}

          {step === 2 && kind === 'RECEBIMENTO' ? (
            <PaymentMethodStep
              paymentFlow={paymentFlow}
              onPaymentFlowChange={handlePaymentFlowChange}
              contaId={contaId}
              onContaIdChange={setContaId}
              contas={activeContas}
              valorNum={valorNum}
              dataVenda={dataVenda}
              boletoVencimento={boletoVencimento}
              onBoletoVencimentoChange={setBoletoVencimento}
              maquininhaProvider={maquininhaProvider}
              onMaquininhaProviderChange={setMaquininhaProvider}
              maquininhaPlano={maquininhaPlano}
              onMaquininhaPlanoChange={setMaquininhaPlano}
              maquininhaModo={maquininhaModo}
              onMaquininhaModoChange={setMaquininhaModo}
              parcelas={parcelas}
              onParcelasChange={setParcelas}
              maquininhaOptions={maquininhaOptions}
              showOsMaquininhaSummary={osLinkLocked && paymentFlow === 'maquininha'}
            />
          ) : null}

          {step === 2 && kind === 'PAGAMENTO' ? (
            <>
              <p className={styles.hint}>Classifique o pagamento com fornecedor e/ou categoria.</p>
              <label className={wizardStyles.fieldLabel}>Fornecedor</label>
              <input
                className={wizardStyles.textInput}
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Nome do fornecedor"
              />
              <label className={wizardStyles.fieldLabel}>Categoria</label>
              <input
                className={wizardStyles.textInput}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                required
              />
            </>
          ) : null}

          {((kind === 'RECEBIMENTO' && step === 3) || (kind === 'PAGAMENTO' && step === 2)) ? (
            <>
              {kind === 'RECEBIMENTO' ? (
                <>
                  {osLinkLocked ? (
                    <>
                      <p className={styles.hint}>Cliente e OS definidos pela ordem de serviço.</p>
                      <label className={wizardStyles.fieldLabel}>Vínculo</label>
                      <input className={wizardStyles.textInput} value={linkLabel} readOnly />
                    </>
                  ) : (
                    <>
                      <p className={styles.hint}>Busque cliente ou OS para vincular o recebimento.</p>
                      <label className={wizardStyles.fieldLabel} htmlFor="client-os-combo">
                        Cliente / ordem de serviço
                      </label>
                      <ClientOSCombobox
                        id="client-os-combo"
                        value={linkSelectionId}
                        error={Boolean(linkSelectionId && !linkSelectionValid)}
                        onChange={(selection, option) => {
                          if (!selection || !option) {
                            setLinkSelectionId(null);
                            setLinkLabel('');
                            setClienteId(undefined);
                            setOrdemServicoId(undefined);
                            return;
                          }
                          setLinkSelectionId(option.id);
                          setLinkLabel(option.label);
                          setClienteId(selection.clientId);
                          setOrdemServicoId(selection.serviceOrderId);
                        }}
                      />
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {step === reviewStep ? (
            <div className={styles.review}>
              <p>
                <strong>Tipo:</strong> {kind === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento'}
              </p>
              <p>
                <strong>Valor:</strong> {money(valorNum)}
              </p>
              {kind === 'RECEBIMENTO' ? (
                <>
                  <p>
                    <strong>Data da venda:</strong> {formatDateBr(saleDate)}
                  </p>
                  <p>
                    <strong>Forma de pagamento:</strong> {paymentFlowLabel(paymentFlow)}
                  </p>
                  {settlementPreview ? (
                    <p>
                      <strong>Liquidação prevista:</strong> {formatDateBr(settlementPreview)}
                    </p>
                  ) : null}
                  {paymentFlow === 'maquininha' && maquininhaFeePreview ? (
                    <p>
                      <strong>Taxa:</strong> {maquininhaFeePreview.feePercent}% · Líquido:{' '}
                      {money(maquininhaFeePreview.net)}
                    </p>
                  ) : null}
                  <p>
                    <strong>Conta de liquidação:</strong> {liquidacaoConta?.nome ?? '—'}
                  </p>
                  <p>
                    <strong>Status:</strong>{' '}
                    {paymentFlow === 'pix' ? 'Liquidado' : 'Pendente'}
                  </p>
                  <p>
                    <strong>Vínculo:</strong> {linkLabel || '—'}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Conta:</strong> {conta?.nome ?? '—'}
                  </p>
                  <p>
                    <strong>Fornecedor / categoria:</strong> {fornecedor || '—'} / {categoria}
                  </p>
                </>
              )}
              <p>
                <strong>Descrição:</strong> {descricao}
              </p>
            </div>
          ) : null}
        </div>

        <footer className={wizardStyles.wizardFooter}>
          {step > 1 ? (
            <button
              type="button"
              className={wizardStyles.btnSecondary}
              onClick={() => setStep((s) => s - 1)}
              disabled={createEntry.isPending}
            >
              <ChevronLeft size={16} /> Voltar
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className={wizardStyles.btnPrimary}
            disabled={(step < reviewStep ? !canNext : !canFinish) || createEntry.isPending}
          >
            {step < reviewStep ? (
              <>
                Próximo <ChevronRight size={16} />
              </>
            ) : createEntry.isPending ? (
              'Salvando…'
            ) : (
              'Confirmar transação'
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}
