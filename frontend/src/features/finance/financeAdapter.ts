import type {
  FinanceBankAccountOut,
  FinanceEntryOut,
  FinanceEntryStatus,
  FinanceEntryType,
  FinanceGatewaysOut,
} from '../../api/finance';
import {
  createFinanceEntry,
  createFinanceEntryMercadoPagoBoletoCharge,
  createFinanceEntryMercadoPagoPixCharge,
  getFinanceBalanceSnapshot,
  getFinanceEntitlements,
  getFinanceGateways,
  listFinanceAccounts,
  listFinanceCategories,
  listFinanceEntries,
  listFinancePaymentFees,
} from '../../api/finance';
import { resolveCategoryIdByName } from './financeCategoryUtils';
import { apiFetch } from '../../services/api';
import { mapToFinanceServiceError } from './financeErrors';
import {
  bankAccountDomainId,
  entryDomainId,
  gatewayBoletoDomainId,
  gatewayPixDomainId,
  gatewayProviderFromDomainId,
  isGatewayBoletoDomainId,
  isGatewayPixDomainId,
  machineDomainId,
  parseBankAccountDomainId,
} from './financeIds';
import { mapApiPlanToFinancePlan } from './financePlanUtils';
import { resolveFirstRecurringDue } from './recurringTransaction';
import type { Conta, TipoConta } from './account.types';
import type {
  CreateTransacaoInput,
  ListTransacoesParams,
  Planos,
  StatusTransacao,
  TipoTransacao,
  Transacao,
} from './finance.types';
import { tipoFromTransactionKind, transactionKindFromTipo } from './transaction.types';
import type { SettlementReceiptType } from './financeCalculator';

export type CreateTransacaoApiOptions = {
  taxaPercentualMaquininha?: number;
  feeAmount?: number;
  serviceOrderId?: number;
  notes?: string | null;
  competenceDate?: Date;
  settlementDate?: Date;
  netValue?: number;
  feeApplied?: number;
  settlementPlan?: 'same_as_due' | 'next_business_day';
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  installments?: number;
  installmentIntervalMonths?: number;
  settlementType?: SettlementReceiptType;
  /** Parcelas da venda no cartão (metadado quando antecipação total). */
  installmentCount?: number;
  creditCardId?: number;
  reasonForLoss?: string;
  recurring?: {
    frequency: 'weekly' | 'monthly';
    day_of_month?: number;
    weekday?: number;
    end_date?: string | null;
  };
  cobranca?: {
    payerEmail: string;
    payerName?: string;
    payerDocument?: string;
    tipo: 'pix' | 'boleto';
  };
};

function parseEntryMeta(notes: string | null | undefined): {
  clienteId?: number;
  fornecedor?: string;
  settlement_date?: string;
  net_value?: number;
  fee_applied?: number;
} {
  if (!notes?.trim()) return {};
  try {
    const o = JSON.parse(notes) as {
      client_id?: number;
      fornecedor?: string;
      settlement_date?: string;
      net_value?: number;
      fee_applied?: number;
    };
    return {
      clienteId: typeof o.client_id === 'number' ? o.client_id : undefined,
      fornecedor: typeof o.fornecedor === 'string' ? o.fornecedor : undefined,
      settlement_date: typeof o.settlement_date === 'string' ? o.settlement_date : undefined,
      net_value: typeof o.net_value === 'number' ? o.net_value : undefined,
      fee_applied: typeof o.fee_applied === 'number' ? o.fee_applied : undefined,
    };
  } catch {
    return {};
  }
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function mapEntryStatus(api: FinanceEntryOut['status']): StatusTransacao {
  const m: Record<FinanceEntryOut['status'], StatusTransacao> = {
    pending: 'PENDENTE',
    paid: 'LIQUIDADO',
    overdue: 'PENDENTE',
    cancelled: 'CANCELADO',
    awaiting_invoice: 'PENDENTE',
  };
  return m[api] ?? 'PENDENTE';
}

function mapEntryType(api: FinanceEntryType): TipoTransacao {
  return api === 'income' ? 'ENTRADA' : 'SAIDA';
}

function mapStatusToApi(status: StatusTransacao): FinanceEntryStatus {
  const m: Record<StatusTransacao, FinanceEntryStatus> = {
    PENDENTE: 'pending',
    LIQUIDADO: 'paid',
    CANCELADO: 'cancelled',
  };
  return m[status] ?? 'pending';
}

function accountTypeLabel(account: FinanceBankAccountOut): TipoConta {
  if (account.account_type === 'cash') return 'BANCO';
  return 'BANCO';
}

function resolveContaIdFromEntry(row: FinanceEntryOut): string {
  if (row.finance_account_id != null) return bankAccountDomainId(row.finance_account_id);
  const provider = row.payment_provider?.trim();
  if (provider) return machineDomainId(provider);
  return bankAccountDomainId(1);
}

/** API → domínio: lançamento financeiro. */
export function mapEntryToTransacao(row: FinanceEntryOut): Transacao {
  const tipo = mapEntryType(row.entry_type);
  const kind = transactionKindFromTipo(tipo);
  const meta = parseEntryMeta(row.notes);
  const settlementFromMeta = meta.settlement_date ? parseDateOnly(meta.settlement_date) : undefined;
  const dataLiquidacaoPrevista = settlementFromMeta ?? parseDateOnly(row.expected_settlement_date);
  const netValue =
    row.net_amount > 0
      ? row.net_amount
      : meta.net_value != null && meta.net_value > 0
        ? meta.net_value
        : undefined;
  const feeApplied =
    row.fee_percent > 0 ? row.fee_percent : meta.fee_applied != null ? meta.fee_applied : undefined;

  return {
    id: entryDomainId(row.id),
    valor: row.amount,
    dataPrevista: parseDateOnly(row.due_date),
    dataCompetencia: parseDateOnly(row.competence_date),
    dataLiquidacaoPrevista,
    settlementDate: dataLiquidacaoPrevista,
    dataLiquidacao: row.paid_at ? new Date(row.paid_at) : undefined,
    netValue,
    feeApplied,
    status: row.status === 'paid' ? 'LIQUIDADO' : mapEntryStatus(row.status),
    tipo,
    kind,
    contaId: resolveContaIdFromEntry(row),
    categoria: row.category_name ?? 'Sem categoria',
    descricao: row.description,
    taxaDescontada: row.fee_amount > 0 ? row.fee_amount : undefined,
    clienteId: meta.clienteId,
    ordemServicoId: row.service_order_id ?? undefined,
    fornecedor: meta.fornecedor,
    recurringTransactionId: row.recurring_transaction_id ?? undefined,
    parentSeriesId: row.recurring_transaction_id ?? undefined,
    isRecurring: row.recurring_transaction_id != null,
    creditCardInvoiceId: row.credit_card_invoice_id ?? undefined,
    installmentNumber: row.installment_number ?? undefined,
    installmentTotal: row.installment_total ?? undefined,
    apiStatus: row.status,
    notes: row.notes ?? undefined,
  };
}

/** API → domínio: conta bancária/caixa. */
export function mapBankAccountToConta(
  account: FinanceBankAccountOut,
  saldoAtual = account.initial_balance,
): Conta {
  const isCash = account.account_type === 'cash' || account.name.toLowerCase().includes('caixa');
  return {
    id: bankAccountDomainId(account.id),
    nome: account.name,
    tipo: isCash ? 'BANCO' : accountTypeLabel(account),
    status: account.is_active === false ? 'INATIVA' : 'ATIVA',
    saldoAtual,
    planoMinimo: 'SIMPLES',
    bankAccountId: account.id,
  };
}

function mapGatewayContas(gateways: FinanceGatewaysOut): Conta[] {
  const contas: Conta[] = [];
  if (gateways.mercadopago?.connected) {
    contas.push({
      id: gatewayPixDomainId('mercadopago'),
      nome: 'Mercado Pago (Pix)',
      tipo: 'GATEWAY_PIX',
      status: 'ATIVA',
      saldoAtual: 0,
      planoMinimo: 'PRO',
    });
    if (gateways.mercadopago.products?.boleto) {
      contas.push({
        id: gatewayBoletoDomainId('mercadopago'),
        nome: 'Mercado Pago (Boleto)',
        tipo: 'GATEWAY_BOLETO',
        status: 'ATIVA',
        saldoAtual: 0,
        planoMinimo: 'PRO',
      });
    }
  }
  if (gateways.asaas?.connected) {
    contas.push({
      id: gatewayPixDomainId('asaas'),
      nome: 'Asaas (Pix/Boleto)',
      tipo: 'GATEWAY_PIX',
      status: 'ATIVA',
      saldoAtual: 0,
      planoMinimo: 'PRO',
    });
  }
  if (gateways.stone?.connected) {
    contas.push({
      id: gatewayPixDomainId('stone'),
      nome: 'Stone (Pix)',
      tipo: 'GATEWAY_PIX',
      status: 'ATIVA',
      saldoAtual: 0,
      planoMinimo: 'PRO',
    });
    contas.push({
      id: gatewayBoletoDomainId('stone'),
      nome: 'Stone (Boleto)',
      tipo: 'GATEWAY_BOLETO',
      status: 'ATIVA',
      saldoAtual: 0,
      planoMinimo: 'PRO',
    });
  }
  return contas;
}

function mapMachineContas(providerNames: string[]): Conta[] {
  return providerNames.map((name) => ({
    id: machineDomainId(name),
    nome: name,
    tipo: 'MAQUININHA' as TipoConta,
    status: 'ATIVA' as const,
    saldoAtual: 0,
    planoMinimo: 'PRO' as const,
  }));
}

/** Carrega contas do workspace (bancos + gateways + maquininhas). */
export async function fetchContasFromApi(): Promise<Conta[]> {
  try {
    const [accounts, gateways, fees, snapshot] = await Promise.all([
      listFinanceAccounts(),
      getFinanceGateways(),
      listFinancePaymentFees(),
      getFinanceBalanceSnapshot({
        end_date: formatDateOnly(new Date()),
        date_basis: 'due_date',
      }).catch(() => null),
    ]);

    const balanceById = new Map<number, number>();
    if (snapshot) {
      for (const row of snapshot.accounts) {
        balanceById.set(row.id, row.current_balance);
      }
    }

    const bankContas = accounts.map((a) =>
      mapBankAccountToConta(a, balanceById.get(a.id) ?? a.initial_balance),
    );

    const machineNames = Array.from(
      new Set(fees.map((f) => f.provider_name.trim()).filter(Boolean)),
    );

    return [...bankContas, ...mapGatewayContas(gateways), ...mapMachineContas(machineNames)];
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

/** Plano do tenant via API de entitlements. */
export async function fetchPlanoUsuarioFromApi(): Promise<Planos> {
  try {
    const ent = await getFinanceEntitlements();
    return mapApiPlanToFinancePlan(ent.plan_key);
  } catch {
    return 'SIMPLES';
  }
}

function resolvePaymentFromConta(contaId: string): {
  finance_account_id: number | null;
  payment_method: string | null;
  payment_provider: string | null;
} {
  const bankId = parseBankAccountDomainId(contaId);
  if (bankId != null) {
    return { finance_account_id: bankId, payment_method: null, payment_provider: null };
  }
  if (isGatewayPixDomainId(contaId) || isGatewayBoletoDomainId(contaId)) {
    const provider = gatewayProviderFromDomainId(contaId);
    return {
      finance_account_id: null,
      payment_method: isGatewayBoletoDomainId(contaId) ? 'boleto' : 'pix',
      payment_provider: provider ?? 'mercadopago',
    };
  }
  return { finance_account_id: null, payment_method: 'credit_card', payment_provider: null };
}

/** Domínio → payload da API para POST /finance/entries. */
export async function mapCreateInputToApiPayload(
  input: CreateTransacaoInput,
  options?: CreateTransacaoApiOptions & {
    feePercent?: number;
  },
): Promise<Parameters<typeof createFinanceEntry>[0]> {
  const categories = await listFinanceCategories();
  const category_id = resolveCategoryIdByName(input.categoria, categories);
  const pay = options?.creditCardId
    ? {
        finance_account_id: null,
        payment_method: 'credit_card' as const,
        payment_provider: options?.paymentProvider ?? null,
      }
    : resolvePaymentFromConta(input.contaId);
  const feePercent = options?.taxaPercentualMaquininha ?? options?.feePercent ?? 0;
  const feeAmount =
    options?.feeAmount ??
    (feePercent > 0 ? Math.round(input.valor * (feePercent / 100) * 100) / 100 : 0);

  const tipo =
    'tipo' in input && input.tipo
      ? input.tipo
      : 'kind' in input && input.kind
        ? tipoFromTransactionKind(input.kind)
        : 'ENTRADA';

  const competence = options?.competenceDate ?? input.dataPrevista;
  const installments = options?.installments ?? 1;

  const dueDate =
    options?.recurring != null
      ? resolveFirstRecurringDue(input.dataPrevista, options.recurring)
      : input.dataPrevista;

  return {
    description: input.descricao,
    entry_type: tipo === 'ENTRADA' ? 'income' : 'expense',
    amount: input.valor,
    due_date: formatDateOnly(dueDate),
    competence_date: formatDateOnly(competence),
    settlement_plan: options?.settlementPlan ?? 'same_as_due',
    status: mapStatusToApi(input.status ?? 'PENDENTE'),
    category_id,
    notes: options?.notes ?? null,
    service_order_id: options?.serviceOrderId ?? null,
    reason_for_loss: options?.reasonForLoss?.trim() || undefined,
    finance_account_id: pay.finance_account_id,
    payment_method: options?.paymentMethod ?? pay.payment_method,
    payment_provider: options?.paymentProvider ?? pay.payment_provider,
    credit_card_id: options?.creditCardId ?? null,
    fee_percent: feePercent,
    fee_amount: feeAmount,
    fee_fixed_amount: 0,
    installments,
    installment_interval_months: options?.installmentIntervalMonths ?? 1,
    recurring: options?.recurring,
  };
}

async function emitirCobrancaGateway(
  entryId: number,
  contaId: string,
  cobranca: NonNullable<CreateTransacaoApiOptions['cobranca']>,
): Promise<FinanceEntryOut> {
  const provider = gatewayProviderFromDomainId(contaId) ?? 'mercadopago';
  const email = cobranca.payerEmail.trim();
  if (!email) {
    throw new Error('E-mail do pagador é obrigatório para gerar cobrança.');
  }

  if (cobranca.tipo === 'boleto') {
    if (provider === 'mercadopago') {
      const cpf = (cobranca.payerDocument ?? '').replace(/\D/g, '');
      if (cpf.length < 11) {
        throw new Error('CPF/CNPJ do pagador é obrigatório para boleto Mercado Pago.');
      }
      const res = await createFinanceEntryMercadoPagoBoletoCharge(entryId, {
        payer_email: email,
        payer_cpf: cpf,
        payer_first_name: cobranca.payerName?.split(' ')[0] ?? null,
        payer_last_name: cobranca.payerName?.split(' ').slice(1).join(' ') || null,
      });
      return res.entry;
    }
    throw new Error('Boleto disponível via Mercado Pago ou Stone nesta integração.');
  }

  if (provider === 'mercadopago') {
    const res = await createFinanceEntryMercadoPagoPixCharge(entryId, {
      payer_email: email,
      payer_first_name: cobranca.payerName?.split(' ')[0] ?? null,
      payer_last_name: cobranca.payerName?.split(' ').slice(1).join(' ') || null,
    });
    return res.entry;
  }

  throw new Error(`Pix via ${provider} não configurado. Conecte o gateway em Financeiro → Contas.`);
}

/** Lista lançamentos da API e converte para `Transacao[]`. */
export async function listTransacoesFromApi(params: ListTransacoesParams): Promise<Transacao[]> {
  try {
    const rows = await listFinanceEntries({
      start_date: formatDateOnly(params.periodo.inicio),
      end_date: formatDateOnly(params.periodo.fim),
      date_basis: 'due_date',
    });
    let transacoes = rows.map(mapEntryToTransacao);
    if (params.contaId) {
      transacoes = transacoes.filter((t) => t.contaId === params.contaId);
    }
    return transacoes;
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

/** Lançamentos (receitas e despesas) vinculados a uma OS. */
export async function listTransacoesByServiceOrderFromApi(serviceOrderId: number): Promise<Transacao[]> {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear() - 2, 0, 1);
    const end = new Date(now.getFullYear() + 1, 11, 31);
    const rows = await listFinanceEntries({
      start_date: formatDateOnly(start),
      end_date: formatDateOnly(end),
      date_basis: 'due_date',
      service_order_id: serviceOrderId,
    });
    return rows.map(mapEntryToTransacao);
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

/** Cria lançamento na API (+ cobrança opcional) e retorna transação de domínio. */
export async function createTransacaoViaApi(
  input: CreateTransacaoInput & { tipo?: TipoTransacao },
  options?: CreateTransacaoApiOptions,
): Promise<Transacao> {
  try {
    const feePercent = options?.taxaPercentualMaquininha ?? 0;
    const feeAmount =
      options?.feeAmount ??
      (feePercent > 0 ? Math.round(input.valor * (feePercent / 100) * 100) / 100 : 0);

    const payload = await mapCreateInputToApiPayload(input, {
      ...options,
      feePercent,
      feeAmount,
    });
    let entry = await createFinanceEntry(payload);

    if (input.gerarLinkPagamento && options?.cobranca) {
      entry = await emitirCobrancaGateway(entry.id, input.contaId, options.cobranca);
    }

    return mapEntryToTransacao(entry);
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

/** Exemplo de uso direto do `apiFetch` (rotas futuras). */
export async function pingFinanceHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/health', { errFallback: 'API indisponível.' });
}
