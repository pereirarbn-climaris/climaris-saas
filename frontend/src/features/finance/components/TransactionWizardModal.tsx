import { Check, ChevronLeft, ChevronRight, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useServiceOrderFinanceEntries } from '../hooks/useServiceOrderFinanceEntries';
import { Link } from 'react-router-dom';
import { patchFinanceEntry } from '../../../api/finance';
import { toast } from '../../../lib/toast';
import wizardStyles from '../../../pages/integrations/CampaignDashboard.module.css';
import type { PlanoRecebimento } from '../../../schemas/financeMaquininha';
import type { SimulatorMode } from '../../../lib/financeMaquininhaUtils';
import {
  amountToCurrencyBrlInput,
  formatCurrencyBrlInput,
  parseCurrencyBrlInput,
} from '../../../lib/brMask';
import { filterContasBancarias } from '../accountService';
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
import { listFinanceCreditCards, type FinanceCreditCardOut } from '../../../api/finance';
import {
  buildMaquininhaSettlementContext,
  calculateInvoiceDueDate,
  calculateProjectedOSMargin,
  calculateSettlementDateFromFlow,
  parseDateInput,
  resolveMaquininhaFee,
  resolveMaquininhaPaymentMethod,
  settlementPlanForMaquininhaPlan,
  type PaymentMethodFlow,
} from '../financeCalculator';
import { EditSeriesScopeField } from './EditSeriesScopeField';
import { ServiceOrderLinkCombobox } from './ServiceOrderLinkCombobox';
import { ServiceOrderExpenseMarginAlert } from './ServiceOrderExpenseMarginAlert';
import { RecurringStep } from './RecurringStep';
import { isVariableCostCategory } from '../osVariableCost';
import {
  detectEditSeriesKindFromTransacao,
  needsEditScopePrompt,
  toApiEditScope,
  transacaoApiId,
  transacaoLockMessage,
  transacaoLockReason,
  transacaoLockTitle,
  WIZARD_EDIT_SCOPE_LABELS,
  type EditSeriesScope,
  type TransacaoLockReason,
} from '../financeEntryEdit';
import type { Transacao } from '../transaction.types';
import {
  buildRecurringPreviewMessage,
  defaultRecurringState,
  isRecurringAllowed,
  toApiRecurringPayload,
  validateRecurringForm,
  type RecurringFormState,
} from '../recurringTransaction';
import styles from './TransactionWizardModal.module.css';

const STEPS_RECEBIMENTO = [
  { id: 1, label: 'Valor' },
  { id: 2, label: 'Pagamento' },
  { id: 3, label: 'Vínculos' },
  { id: 4, label: 'Recorrência' },
  { id: 5, label: 'Revisão' },
] as const;

const STEPS_PAGAMENTO = [
  { id: 1, label: 'Tipo e valor' },
  { id: 2, label: 'Classificação' },
  { id: 3, label: 'Recorrência' },
  { id: 4, label: 'Revisão' },
] as const;

const STEPS_EDIT = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Revisão e escopo' },
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

function formatDateOnlyBr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickPrincipalBank(contas: Conta[]): Conta | undefined {
  return (
    contas.find((c) => c.status === 'ATIVA' && c.tipo === 'BANCO' && c.bankAccountId) ??
    contas.find((c) => c.status === 'ATIVA' && c.tipo === 'BANCO')
  );
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
  /** Edição de lançamento existente (escopo em cascata no passo final). */
  mode?: 'create' | 'edit';
  editTransaction?: Transacao | null;
  onSaved?: () => void;
  /** Abre em modo pagamento com OS/categoria pré-definidos (custos na OS). */
  initialKind?: 'RECEBIMENTO' | 'PAGAMENTO';
  presetExpenseServiceOrderId?: number;
  presetCategoria?: string;
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
  mode = 'create',
  editTransaction = null,
  onSaved,
  initialKind,
  presetExpenseServiceOrderId,
  presetCategoria,
}: TransactionWizardModalProps) {
  const isEditMode = mode === 'edit' && editTransaction != null;
  const osLink = linkedServiceOrder;
  const osLinkLocked = Boolean(osLink);
  const createEntry = useCreateFinanceEntry();
  const [editBusy, setEditBusy] = useState(false);
  const [editScope, setEditScope] = useState<EditSeriesScope | null>(null);
  const [editScopeTouched, setEditScopeTouched] = useState(false);
  const [forceEditLocked, setForceEditLocked] = useState(false);
  const editSeriesKind = isEditMode ? detectEditSeriesKindFromTransacao(editTransaction) : 'none';
  const showEditScopePicker = isEditMode && needsEditScopePrompt(editSeriesKind);
  const lockReason: TransacaoLockReason | null = isEditMode ? transacaoLockReason(editTransaction) : null;
  const reconciledLocked = lockReason === 'reconciled';
  const effectivelyReadOnly = isEditMode && lockReason != null && !(reconciledLocked && forceEditLocked);
  const { data: paymentFees = [] } = useFinancePaymentFees(open);
  const activeContas = useMemo(() => contas.filter((c) => c.status === 'ATIVA'), [contas]);
  const bankContas = useMemo(() => filterContasBancarias(contas), [contas]);

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<'RECEBIMENTO' | 'PAGAMENTO'>('RECEBIMENTO');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVenda, setDataVenda] = useState(() => toDateInput(new Date()));
  const [dataPrevista, setDataPrevista] = useState(() => toDateInput(new Date()));
  const [contaId, setContaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('venda');
  const [fornecedor, setFornecedor] = useState('');
  const [expensePayMode, setExpensePayMode] = useState<'bank' | 'credit_card'>('bank');
  const [creditCardId, setCreditCardId] = useState<number | ''>('');
  const [creditCards, setCreditCards] = useState<FinanceCreditCardOut[]>([]);
  const [linkSelectionId, setLinkSelectionId] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [clienteId, setClienteId] = useState<number | undefined>();
  const [ordemServicoId, setOrdemServicoId] = useState<number | undefined>();
  const [expenseOsLinkId, setExpenseOsLinkId] = useState<string | null>(null);
  const [expenseOsLinkSelection, setExpenseOsLinkSelection] = useState<number | undefined>();
  const [reasonForLoss, setReasonForLoss] = useState('');
  const [debouncedExpenseAmount, setDebouncedExpenseAmount] = useState(0);

  const [paymentFlow, setPaymentFlow] = useState<PaymentMethodFlow | null>(null);
  const [boletoVencimento, setBoletoVencimento] = useState(() => toDateInput(new Date()));
  const [maquininhaProvider, setMaquininhaProvider] = useState('');
  const [maquininhaPlano, setMaquininhaPlano] = useState<PlanoRecebimento>('D1');
  const [maquininhaModo, setMaquininhaModo] = useState<SimulatorMode>('debit');
  const [parcelas, setParcelas] = useState(1);
  const [recurring, setRecurring] = useState<RecurringFormState>(() =>
    defaultRecurringState(new Date()),
  );

  const steps = isEditMode ? STEPS_EDIT : kind === 'RECEBIMENTO' ? STEPS_RECEBIMENTO : STEPS_PAGAMENTO;
  const maxStep = steps.length;

  const valorNum = parseCurrencyBrlInput(valorBruto);

  const expenseOsId = expenseOsLinkSelection ?? presetExpenseServiceOrderId;
  const showExpenseOsMarginAudit =
    !isEditMode &&
    kind === 'PAGAMENTO' &&
    expenseOsId != null &&
    expenseOsId > 0 &&
    expensePayMode !== 'credit_card';
  const isExpenseClassificationStep = !isEditMode && kind === 'PAGAMENTO' && step === 2;

  const { data: osMarginEntries = [] } = useServiceOrderFinanceEntries(expenseOsId, {
    enabled: open && showExpenseOsMarginAudit,
  });

  useEffect(() => {
    if (!showExpenseOsMarginAudit) {
      setDebouncedExpenseAmount(0);
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedExpenseAmount(valorNum > 0 ? valorNum : 0);
    }, 500);
    return () => window.clearTimeout(handle);
  }, [valorNum, showExpenseOsMarginAudit]);
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

  const principalBank = useMemo(() => pickPrincipalBank(bankContas), [bankContas]);
  const { options: linkOptions } = useClientOSLinkOptions('', open);
  const linkSelectionValid = useMemo(
    () => isValidClientOSSelection(linkOptions, linkSelectionId),
    [linkOptions, linkSelectionId],
  );

  const selectedMachine = maquininhaOptions.find((m) => m.providerName === maquininhaProvider);
  const liquidacaoConta = bankContas.find((c) => c.id === contaId);

  const maquininhaFeePreview = useMemo(() => {
    if (!selectedMachine || valorNum <= 0) return null;
    return resolveMaquininhaFee(
      selectedMachine.config.planos[maquininhaPlano],
      maquininhaModo,
      parcelas,
      valorNum,
    );
  }, [selectedMachine, maquininhaPlano, maquininhaModo, parcelas, valorNum]);

  const maquininhaSettlement = useMemo(() => {
    if (paymentFlow !== 'maquininha' || !selectedMachine || valorNum <= 0) return null;
    return buildMaquininhaSettlementContext({
      plan: maquininhaPlano,
      saleDate,
      installmentCount: parcelas,
      gross: valorNum,
      feeResult: maquininhaFeePreview,
    });
  }, [
    paymentFlow,
    selectedMachine,
    maquininhaPlano,
    saleDate,
    parcelas,
    valorNum,
    maquininhaFeePreview,
  ]);

  const settlementPreview = useMemo(() => {
    if (paymentFlow === 'maquininha' && maquininhaSettlement) {
      return maquininhaSettlement.settlementDate;
    }
    if (kind !== 'RECEBIMENTO' || !paymentFlow) return null;
    const boletoDue = boletoVencimento ? parseDateInput(boletoVencimento) : saleDate;
    return calculateSettlementDateFromFlow(paymentFlow, saleDate, {
      machinePlan: maquininhaPlano,
      boletoDueDate: boletoDue,
      installmentCount: parcelas,
      installmentIndex: 1,
    });
  }, [
    kind,
    paymentFlow,
    parcelas,
    saleDate,
    maquininhaPlano,
    boletoVencimento,
    maquininhaSettlement,
  ]);

  useEffect(() => {
    if (!open || !isEditMode || !editTransaction) return;
    setStep(1);
    setKind(editTransaction.kind);
    setValorBruto(amountToCurrencyBrlInput(editTransaction.valor));
    setDescricao(editTransaction.descricao);
    setCategoria(editTransaction.categoria);
    setFornecedor(editTransaction.fornecedor ?? '');
    setContaId(editTransaction.contaId);
    setDataPrevista(toDateInput(editTransaction.dataPrevista));
    setDataVenda(toDateInput(editTransaction.dataCompetencia ?? editTransaction.dataPrevista));
    setEditScope(showEditScopePicker ? null : 'single');
    setEditScopeTouched(false);
    setForceEditLocked(false);
  }, [open, isEditMode, editTransaction, showEditScopePicker]);

  useEffect(() => {
    if (!open || isEditMode) return;
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
    setRecurring(defaultRecurringState(new Date()));
    setMaquininhaProvider('');
    setCategoria('venda');
    setFornecedor('');
    setExpensePayMode('bank');
    setCreditCardId('');
    setCreditCards([]);
    setExpenseOsLinkId(null);
    setExpenseOsLinkSelection(undefined);
    setReasonForLoss('');
    setDebouncedExpenseAmount(0);

    if (initialKind) setKind(initialKind);
    if (presetCategoria?.trim()) setCategoria(presetCategoria.trim());
    if (presetExpenseServiceOrderId) {
      setExpenseOsLinkId(`os:${presetExpenseServiceOrderId}`);
      setExpenseOsLinkSelection(presetExpenseServiceOrderId);
    }

    if (osLink) {
      const osNum = osLink.orderNumber ?? String(osLink.serviceOrderId);
      setValorBruto(amountToCurrencyBrlInput(osLink.totalAmount));
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

    const first =
      (defaultContaId &&
      (bankContas.some((c) => c.id === defaultContaId) || activeContas.some((c) => c.id === defaultContaId))
        ? defaultContaId
        : null) ??
      principalBank?.id ??
      bankContas[0]?.id ??
      activeContas[0]?.id ??
      '';
    setContaId(first);
  }, [
    open,
    defaultContaId,
    activeContas,
    bankContas,
    osLink,
    principalBank?.id,
    initialKind,
    presetCategoria,
    presetExpenseServiceOrderId,
  ]);

  useEffect(() => {
    if (!open || kind !== 'PAGAMENTO') return;
    if (contaId && bankContas.some((c) => c.id === contaId)) return;
    setContaId(principalBank?.id ?? bankContas[0]?.id ?? '');
  }, [kind, open, contaId, bankContas, principalBank?.id]);

  useEffect(() => {
    if (!open || kind !== 'PAGAMENTO') return;
    let cancelled = false;
    listFinanceCreditCards()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((c) => c.is_active);
        setCreditCards(active);
        if (active.length > 0) {
          setCreditCardId((prev) =>
            prev !== '' && active.some((c) => c.id === prev) ? prev : active[0].id,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCreditCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind]);

  const selectedCreditCard = useMemo(
    () => creditCards.find((c) => c.id === creditCardId),
    [creditCards, creditCardId],
  );

  const showExpenseOsLink =
    !isEditMode && kind === 'PAGAMENTO' && isVariableCostCategory(categoria);

  const invoiceDuePreview = useMemo(() => {
    if (expensePayMode !== 'credit_card' || !selectedCreditCard) return null;
    return calculateInvoiceDueDate(parseDateInput(dataPrevista), {
      closingDay: selectedCreditCard.closing_day,
      dueDay: selectedCreditCard.due_day,
    });
  }, [expensePayMode, selectedCreditCard, dataPrevista]);

  useEffect(() => {
    if (maquininhaOptions.length && !maquininhaProvider) {
      setMaquininhaProvider(maquininhaOptions[0].providerName);
    }
  }, [maquininhaOptions, maquininhaProvider]);

  function suggestLiquidationAccount(flow: PaymentMethodFlow): string {
    void flow;
    return principalBank?.id ?? bankContas[0]?.id ?? '';
  }

  function handlePaymentFlowChange(flow: PaymentMethodFlow) {
    setPaymentFlow(flow);
    setContaId((prev) => {
      if (prev && bankContas.some((c) => c.id === prev)) return prev;
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

  const firstDueForRecurring = useMemo(() => {
    if (kind === 'PAGAMENTO') {
      return parseDateInput(dataPrevista);
    }
    if (paymentFlow === 'boleto' && boletoVencimento) {
      return parseDateInput(boletoVencimento);
    }
    if (maquininhaSettlement) {
      return maquininhaSettlement.settlementDate;
    }
    return saleDate;
  }, [
    kind,
    dataPrevista,
    paymentFlow,
    boletoVencimento,
    maquininhaSettlement,
    saleDate,
  ]);

  const recurringValidationError = useMemo(
    () => validateRecurringForm(recurring, firstDueForRecurring),
    [recurring, firstDueForRecurring],
  );

  if (!open) return null;

  const conta = activeContas.find((c) => c.id === contaId);
  const linkOk = osLinkLocked || linkSelectionValid;

  const recurringStepId = kind === 'RECEBIMENTO' ? 4 : 3;

  const recurringAllowed = isRecurringAllowed({
    osLinkLocked,
    installmentCount: parcelas,
  });

  const recurringStepValid =
    recurring.frequency === 'none' || (recurringAllowed && !recurringValidationError);

  const paymentStepValid = Boolean(
    paymentFlow &&
      contaId &&
      bankContas.some((c) => c.id === contaId) &&
      (paymentFlow !== 'boleto' || Boolean(boletoVencimento)) &&
      (paymentFlow !== 'maquininha' || Boolean(maquininhaProvider && selectedMachine)),
  );

  const editStep1Valid =
    valorNum > 0 && descricao.trim().length >= 2 && Boolean(dataPrevista) && categoria.trim().length >= 1;

  const canNext =
    (isEditMode && step === 1 && editStep1Valid) ||
    (!isEditMode &&
      step === 1 &&
      valorNum > 0 &&
      descricao.trim().length >= 2 &&
      (kind === 'RECEBIMENTO'
        ? Boolean(dataVenda)
        : Boolean(dataPrevista) &&
          (expensePayMode === 'credit_card'
            ? Boolean(creditCardId) && creditCards.length > 0
            : Boolean(contaId) && bankContas.some((c) => c.id === contaId)))) ||
    (step === 2 &&
      kind === 'RECEBIMENTO' &&
      paymentStepValid) ||
    (step === 2 &&
      kind === 'PAGAMENTO' &&
      Boolean(fornecedor.trim() || categoria.trim())) ||
    (step === 3 && kind === 'RECEBIMENTO' && linkOk) ||
    (step === recurringStepId && recurringStepValid);

  const reviewStep = maxStep;
  const canFinish =
    step === reviewStep &&
    (isEditMode
      ? effectivelyReadOnly ||
        (editStep1Valid && (!showEditScopePicker || editScope != null))
      : kind === 'PAGAMENTO'
        ? Boolean(fornecedor.trim() || categoria.trim()) &&
          (expensePayMode === 'credit_card'
            ? Boolean(creditCardId)
            : Boolean(contaId) && bankContas.some((c) => c.id === contaId))
        : linkOk && paymentStepValid && recurringStepValid);

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
    if (maquininhaSettlement) {
      return {
        contaId,
        status: 'PENDENTE',
        dueDate: maquininhaSettlement.settlementDate,
      };
    }
    return {
      contaId,
      status: 'PENDENTE',
      dueDate: saleDate,
    };
  }

  function buildSettlementMeta():
    | {
        settlementDate: Date;
        netValue: number;
        feeApplied: number;
        settlementType?: 'standard' | 'total_anticipated';
        installmentCount?: number;
      }
    | undefined {
    if (!paymentFlow) return undefined;
    if (paymentFlow === 'maquininha' && maquininhaSettlement) {
      return {
        settlementDate: maquininhaSettlement.settlementDate,
        netValue: maquininhaSettlement.netValue,
        feeApplied: maquininhaSettlement.feeApplied,
        settlementType: maquininhaSettlement.receiptType,
        installmentCount: maquininhaSettlement.saleInstallmentCount,
      };
    }
    if (!settlementPreview) return undefined;
    return {
      settlementDate: settlementPreview,
      netValue: valorNum,
      feeApplied: 0,
    };
  }

  function resolveExpenseServiceOrderId(): number | undefined {
    if (expenseOsLinkSelection) return expenseOsLinkSelection;
    if (presetExpenseServiceOrderId) return presetExpenseServiceOrderId;
    return undefined;
  }

  function buildPagamentoApiOptions(): CreateTransacaoApiOptions | undefined {
    const serviceOrderId = resolveExpenseServiceOrderId();
    const base: CreateTransacaoApiOptions = {
      serviceOrderId,
      competenceDate: parseDateInput(dataPrevista),
      settlementPlan: 'same_as_due',
    };
    if (expensePayMode !== 'credit_card' || creditCardId === '') {
      return serviceOrderId ? base : undefined;
    }
    const card = creditCards.find((c) => c.id === creditCardId);
    return {
      ...base,
      paymentMethod: 'credit_card',
      creditCardId: Number(creditCardId),
      paymentProvider: card?.name ?? null,
      installments: 1,
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

    if (!selectedMachine || !maquininhaSettlement) return undefined;
    const fee = maquininhaFeePreview;
    return {
      competenceDate: saleDate,
      settlementPlan,
      settlementDate: meta?.settlementDate,
      netValue: meta?.netValue,
      feeApplied: meta?.feeApplied,
      settlementType: maquininhaSettlement.receiptType,
      installmentCount: maquininhaSettlement.saleInstallmentCount,
      paymentMethod: resolveMaquininhaPaymentMethod(maquininhaPlano, maquininhaModo),
      paymentProvider: selectedMachine.providerName,
      installments: maquininhaSettlement.installmentsForPersistence,
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

    const payContaId =
      expensePayMode === 'credit_card'
        ? principalBank?.id ?? bankContas[0]?.id ?? contaId
        : contaId;

    const osId = resolveExpenseServiceOrderId();
    return {
      kind: 'PAGAMENTO',
      valor: valorNum,
      dataPrevista: new Date(`${dataPrevista}T12:00:00`),
      status: 'PENDENTE',
      contaId: payContaId,
      descricao: descricao.trim(),
      categoria: categoria.trim(),
      fornecedor: fornecedor.trim() || undefined,
      ...(osId ? { ordemServicoId: osId } : {}),
    };
  }

  function handleClose() {
    if (!createEntry.isPending && !editBusy) onClose();
  }

  async function submitEdit() {
    if (!editTransaction || effectivelyReadOnly) return;
    const entryId = transacaoApiId(editTransaction);
    if (entryId == null) return;
    if (showEditScopePicker && editScope == null) {
      setEditScopeTouched(true);
      toast.error('Selecione o escopo da edição em cascata.');
      return;
    }
    const amt = parseCurrencyBrlInput(valorBruto);
    if (!(amt > 0)) {
      toast.error('Informe um valor válido.');
      return;
    }
    setEditBusy(true);
    try {
      await patchFinanceEntry(entryId, {
        description: descricao.trim(),
        amount: amt,
        due_date: dataPrevista,
        edit_scope: toApiEditScope(editScope ?? 'single'),
        force_edit_locked: forceEditLocked && reconciledLocked,
      });
      toast.success('Lançamento atualizado.');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setEditBusy(false);
    }
  }

  function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (step < maxStep) {
      if (!isEditMode && step === 3 && kind === 'RECEBIMENTO' && !linkOk) return;
      setStep((s) => s + 1);
      return;
    }
    if (!canFinish) return;

    if (isEditMode) {
      if (effectivelyReadOnly) {
        onClose();
        return;
      }
      void submitEdit();
      return;
    }

    if (kind === 'PAGAMENTO' && expensePayMode === 'credit_card' && recurring.frequency !== 'none') {
      return;
    }

    const recurErr = validateRecurringForm(recurring, firstDueForRecurring);
    if (recurErr) return;

    if (showExpenseOsMarginAudit && expenseOsId && valorNum > 0) {
      const projected = calculateProjectedOSMargin(expenseOsId, valorNum, osMarginEntries);
      if (projected.margem != null && projected.margem < 0 && !reasonForLoss.trim()) {
        toast.error('Informe a justificativa de prejuízo para registrar esta despesa na OS.');
        return;
      }
    }

    const input = buildInput();
    const pagamentoOpts = buildPagamentoApiOptions();
    const lossJustification = reasonForLoss.trim();
    const apiOpts = {
      ...(kind === 'PAGAMENTO'
        ? {
            ...pagamentoOpts,
            serviceOrderId: resolveExpenseServiceOrderId() ?? pagamentoOpts?.serviceOrderId,
            ...(lossJustification ? { reasonForLoss: lossJustification } : {}),
          }
        : buildApiOptions()),
      recurring: toApiRecurringPayload(recurring),
    };
    const soId =
      kind === 'PAGAMENTO'
        ? resolveExpenseServiceOrderId() ?? linkedServiceOrderId ?? osLink?.serviceOrderId
        : linkedServiceOrderId ?? osLink?.serviceOrderId;

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
      aria-label={isEditMode ? 'Editar transação' : 'Nova transação'}
    >
      <header className={wizardStyles.wizardTop}>
        <button type="button" className={wizardStyles.btnIcon} onClick={handleClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>
          {isEditMode
            ? 'Editar lançamento'
            : osLinkLocked
              ? 'Recebimento da OS'
              : 'Nova transação'}
        </h2>
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
          {isEditMode && lockReason ? (
            <div className={styles.lockBanner} role="status">
              <Lock size={18} aria-hidden />
              <div>
                <strong>{transacaoLockTitle(lockReason)}</strong>
                <p>{transacaoLockMessage(lockReason, editTransaction!)}</p>
                {reconciledLocked ? (
                  <>
                    <Link className={styles.lockBannerLink} to="/app/finance/reconciliation" onClick={onClose}>
                      Abrir conciliação
                    </Link>
                    <label className={styles.forceEditLabel}>
                      <input
                        type="checkbox"
                        checked={forceEditLocked}
                        onChange={(e) => setForceEditLocked(e.target.checked)}
                      />
                      Editar mesmo assim (estorno manual)
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {isEditMode && step === 1 ? (
            <>
              <p className={styles.hint}>
                {kind === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento'}
                {editTransaction?.isRecurring || editTransaction?.recurringTransactionId
                  ? ' · série recorrente'
                  : ''}
                {(editTransaction?.installmentTotal ?? 1) > 1
                  ? ` · parcela ${editTransaction?.installmentNumber}/${editTransaction?.installmentTotal}`
                  : ''}
              </p>
              <label className={wizardStyles.fieldLabel}>Descrição</label>
              <input
                className={wizardStyles.textInput}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                readOnly={effectivelyReadOnly}
                disabled={effectivelyReadOnly}
                required
              />
              <div className={styles.editValueRow}>
                <div>
                  <label className={wizardStyles.fieldLabel}>Valor</label>
                  <input
                    className={styles.moneyInput}
                    value={valorBruto}
                    onChange={(e) => setValorBruto(formatCurrencyBrlInput(e.target.value))}
                    readOnly={effectivelyReadOnly}
                    disabled={effectivelyReadOnly}
                  />
                </div>
                <div>
                  <label className={wizardStyles.fieldLabel}>Vencimento</label>
                  <input
                    className={wizardStyles.textInput}
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    readOnly={effectivelyReadOnly}
                    disabled={effectivelyReadOnly}
                    required
                  />
                </div>
              </div>
              <label className={wizardStyles.fieldLabel}>Categoria</label>
              <input
                className={wizardStyles.textInput}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                readOnly={effectivelyReadOnly}
                disabled={effectivelyReadOnly}
                required
              />
              {kind === 'PAGAMENTO' ? (
                <>
                  <label className={wizardStyles.fieldLabel}>Fornecedor</label>
                  <input
                    className={wizardStyles.textInput}
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    readOnly={effectivelyReadOnly}
                    disabled={effectivelyReadOnly}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {!isEditMode && step === 1 ? (
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
                  <label className={wizardStyles.fieldLabel}>Valor bruto</label>
                  <div className={styles.moneyInputWrap}>
                    <span className={styles.moneyPrefix} aria-hidden>
                      R$
                    </span>
                    <input
                      className={styles.moneyInput}
                      inputMode="numeric"
                      value={valorBruto}
                      onChange={(e) => setValorBruto(formatCurrencyBrlInput(e.target.value))}
                      placeholder="0,00"
                      readOnly={osLinkLocked}
                      aria-label="Valor bruto em reais"
                      required
                    />
                  </div>
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
                  <fieldset className={styles.payModeFieldset}>
                    <legend className={wizardStyles.fieldLabel}>Forma de pagamento</legend>
                    <label className={styles.payModeOption}>
                      <input
                        type="radio"
                        name="expensePayMode"
                        checked={expensePayMode === 'bank'}
                        onChange={() => setExpensePayMode('bank')}
                      />
                      Conta bancária / PIX / boleto
                    </label>
                    <label className={styles.payModeOption}>
                      <input
                        type="radio"
                        name="expensePayMode"
                        checked={expensePayMode === 'credit_card'}
                        onChange={() => setExpensePayMode('credit_card')}
                        disabled={creditCards.length === 0}
                      />
                      Cartão de crédito
                    </label>
                  </fieldset>
                  {expensePayMode === 'bank' ? (
                    <>
                      <label className={wizardStyles.fieldLabel}>Conta</label>
                      <select
                        className={wizardStyles.textInput}
                        value={contaId}
                        onChange={(e) => setContaId(e.target.value)}
                        required
                      >
                        <option value="">Selecionar conta bancária</option>
                        {bankContas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} — {money(c.saldoAtual)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className={wizardStyles.fieldLabel}>Cartão</label>
                      {creditCards.length === 0 ? (
                        <p className={styles.hint}>
                          Cadastre um cartão em Configurações → Cartões de crédito.
                        </p>
                      ) : (
                        <select
                          className={wizardStyles.textInput}
                          value={creditCardId === '' ? '' : String(creditCardId)}
                          onChange={(e) =>
                            setCreditCardId(e.target.value ? Number(e.target.value) : '')
                          }
                          required
                        >
                          {creditCards.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — disponível {money(c.available_limit)}
                            </option>
                          ))}
                        </select>
                      )}
                      {invoiceDuePreview ? (
                        <p className={styles.hint}>
                          Vencimento da fatura previsto:{' '}
                          <strong>{formatDateBr(invoiceDuePreview)}</strong> (não debita a conta
                          bancária até essa data).
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <p className={styles.hint}>A conta e a liquidação serão definidas na etapa de pagamento.</p>
              )}
            </>
          ) : null}

          {!isEditMode && step === 2 && kind === 'RECEBIMENTO' ? (
            <PaymentMethodStep
              paymentFlow={paymentFlow}
              onPaymentFlowChange={handlePaymentFlowChange}
              contaId={contaId}
              onContaIdChange={setContaId}
              contas={bankContas}
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

          {!isEditMode && step === 2 && kind === 'PAGAMENTO' ? (
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
                onChange={(e) => {
                  setCategoria(e.target.value);
                  if (!isVariableCostCategory(e.target.value)) {
                    setExpenseOsLinkId(null);
                    setExpenseOsLinkSelection(undefined);
                  }
                }}
                required
              />
              {showExpenseOsLink ? (
                <>
                  <label className={wizardStyles.fieldLabel}>Vincular a OS (opcional)</label>
                  <ServiceOrderLinkCombobox
                    value={expenseOsLinkId}
                    onChange={(sel) => {
                      setExpenseOsLinkSelection(sel?.serviceOrderId);
                      setExpenseOsLinkId(sel ? `os:${sel.serviceOrderId}` : null);
                    }}
                    placeholder="Buscar OS em andamento ou concluída…"
                  />
                  <p className={styles.hint}>
                    Custos de insumos/peças podem ser atribuídos à margem da ordem de serviço.
                  </p>
                  {showExpenseOsMarginAudit && expenseOsId ? (
                    <ServiceOrderExpenseMarginAlert
                      serviceOrderId={expenseOsId}
                      expenseAmount={debouncedExpenseAmount}
                      entries={osMarginEntries}
                      reasonForLoss={reasonForLoss}
                      onReasonForLossChange={setReasonForLoss}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {!isEditMode && step === recurringStepId ? (
            <RecurringStep
              state={recurring}
              onChange={(patch) => setRecurring((prev) => ({ ...prev, ...patch }))}
              disabled={!recurringAllowed}
              disabledReason={
                !recurringAllowed
                  ? osLinkLocked
                    ? 'Recorrência não está disponível para recebimentos vinculados à OS.'
                    : 'Recorrência não está disponível com parcelamento em mais de uma vez.'
                  : undefined
              }
              validationError={recurring.frequency !== 'none' ? recurringValidationError : null}
            />
          ) : null}

          {!isEditMode &&
          ((kind === 'RECEBIMENTO' && step === 3) || (kind === 'PAGAMENTO' && step === 2)) ? (
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

          {isEditMode && step === 2 ? (
            <>
              {showEditScopePicker && !effectivelyReadOnly ? (
                <EditSeriesScopeField
                  seriesKind={editSeriesKind}
                  value={editScope}
                  onChange={(scope) => {
                    setEditScope(scope);
                    setEditScopeTouched(false);
                  }}
                  labels={WIZARD_EDIT_SCOPE_LABELS}
                  legend="Qual parte da série deseja alterar?"
                  invalid={editScopeTouched && editScope == null}
                  hint={
                    editTransaction?.installmentNumber != null &&
                    (editTransaction.installmentTotal ?? 1) > 1
                      ? `Parcela ${editTransaction.installmentNumber} de ${editTransaction.installmentTotal}`
                      : editTransaction?.recurringTransactionId
                        ? 'Série recorrente (parentId)'
                        : undefined
                  }
                />
              ) : null}
              <div className={styles.review}>
                <p>
                  <strong>Valor:</strong> {money(valorNum)}
                </p>
                <p>
                  <strong>Vencimento:</strong> {formatDateBr(parseDateInput(dataPrevista))}
                </p>
                <p>
                  <strong>Descrição:</strong> {descricao}
                </p>
                <p>
                  <strong>Categoria:</strong> {categoria}
                </p>
              </div>
            </>
          ) : null}

          {!isEditMode && step === reviewStep ? (
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
                  {paymentFlow === 'maquininha' &&
                  maquininhaSettlement?.receiptType === 'total_anticipated' ? (
                    <p className={styles.anticipatedHighlight}>
                      <strong>Valor total antecipado:</strong>{' '}
                      {money(maquininhaSettlement.netValue)}{' '}
                      <span className={styles.reviewMeta}>
                        (Data: {formatDateOnlyBr(maquininhaSettlement.settlementDate)})
                      </span>
                    </p>
                  ) : settlementPreview ? (
                    <p>
                      <strong>Liquidação prevista:</strong> {formatDateBr(settlementPreview)}
                    </p>
                  ) : null}
                  {paymentFlow === 'maquininha' && maquininhaSettlement ? (
                    <>
                      {maquininhaSettlement.receiptType === 'standard' &&
                      maquininhaSettlement.saleInstallmentCount > 1 ? (
                        <p>
                          <strong>Parcelas:</strong> {maquininhaSettlement.saleInstallmentCount}{' '}
                          recebimentos no cronograma padrão (30/60/90…)
                        </p>
                      ) : null}
                      <p>
                        <strong>Taxa sobre o total:</strong> {maquininhaSettlement.feeApplied}% ·
                        Bruto: {money(valorNum)} · Líquido: {money(maquininhaSettlement.netValue)}
                      </p>
                    </>
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
                    <strong>Forma:</strong>{' '}
                    {expensePayMode === 'credit_card'
                      ? `Cartão — ${selectedCreditCard?.name ?? '—'}`
                      : `Conta — ${conta?.nome ?? '—'}`}
                  </p>
                  {expensePayMode === 'credit_card' && invoiceDuePreview ? (
                    <p>
                      <strong>Vencimento da fatura:</strong> {formatDateBr(invoiceDuePreview)}
                    </p>
                  ) : null}
                  <p>
                    <strong>Fornecedor / categoria:</strong> {fornecedor || '—'} / {categoria}
                  </p>
                  {expensePayMode === 'credit_card' ? (
                    <p className={styles.hint}>
                      A compra ficará aguardando fatura; o saldo bancário só será afetado no
                      vencimento.
                    </p>
                  ) : null}
                </>
              )}
              <p>
                <strong>Descrição:</strong> {descricao}
              </p>
              {recurring.frequency !== 'none' && buildRecurringPreviewMessage(recurring) ? (
                <p className={styles.recurringPreview}>{buildRecurringPreviewMessage(recurring)}</p>
              ) : null}
            </div>
          ) : null}

          {showExpenseOsMarginAudit && expenseOsId && !isExpenseClassificationStep ? (
            <ServiceOrderExpenseMarginAlert
              serviceOrderId={expenseOsId}
              expenseAmount={debouncedExpenseAmount}
              entries={osMarginEntries}
              reasonForLoss={reasonForLoss}
              onReasonForLossChange={setReasonForLoss}
            />
          ) : null}
        </div>

        <footer className={wizardStyles.wizardFooter}>
          {step > 1 ? (
            <button
              type="button"
              className={wizardStyles.btnSecondary}
              onClick={() => setStep((s) => s - 1)}
              disabled={createEntry.isPending || editBusy}
            >
              <ChevronLeft size={16} /> Voltar
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className={wizardStyles.btnPrimary}
            disabled={
              (step < reviewStep ? !canNext : !canFinish) ||
              createEntry.isPending ||
              editBusy
            }
          >
            {step < reviewStep ? (
              <>
                Próximo <ChevronRight size={16} />
              </>
            ) : createEntry.isPending || editBusy ? (
              'Salvando…'
            ) : isEditMode ? (
              effectivelyReadOnly ? 'Fechar' : 'Salvar alterações'
            ) : (
              'Confirmar transação'
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}
