import { createTransacaoViaApi, type CreateTransacaoApiOptions } from './financeAdapter';
import { financeCache } from './financeCache';
import { FinanceServiceError } from './financeErrors';
import { mapToFinanceServiceError } from './financeErrors';
import { isContaGateway } from './financePlanUtils';
import { assertPodeUsarConta } from './accountService';
import type {
  CreateTransactionInput,
  CreateTransacaoInput,
  ListTransacoesParams,
  Transacao,
} from './finance.types';
import {
  buildSettlementPayloadMeta,
  mergeEntryNotes,
} from './financeCalculator';
import {
  CreateTransactionInputSchema,
  tipoFromTransactionKind,
  transactionKindFromTipo,
} from './transaction.types';
import type { FinanceServiceContext } from './finance.types';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function buildTransactionNotes(
  input: CreateTransactionInput,
  options?: import('./financeAdapter').CreateTransacaoApiOptions,
): string | null {
  const base: Record<string, unknown> = {};

  if (input.kind === 'RECEBIMENTO') {
    if (input.clienteId) base.client_id = input.clienteId;
    if (input.ordemServicoId) base.service_order_id = input.ordemServicoId;
  } else if (input.fornecedor?.trim()) {
    base.fornecedor = input.fornecedor.trim();
  }

  const settlement =
    options?.settlementDate != null &&
    options.netValue != null &&
    options.feeApplied != null
      ? buildSettlementPayloadMeta(options.settlementDate, options.netValue, options.feeApplied, {
          settlement_type: options.settlementType,
          installment_count: options.installmentCount,
        })
      : undefined;

  return mergeEntryNotes(Object.keys(base).length ? base : null, settlement);
}

/** Normaliza input legado (sem `kind`) para discriminated union. */
export function normalizeCreateInput(raw: CreateTransacaoInput | CreateTransactionInput): CreateTransactionInput {
  if ('kind' in raw && (raw.kind === 'RECEBIMENTO' || raw.kind === 'PAGAMENTO')) {
    return raw as CreateTransactionInput;
  }
  const legacy = raw as {
    tipo?: 'ENTRADA' | 'SAIDA';
    valor: number;
    dataPrevista: Date;
    dataLiquidacao?: Date;
    status?: import('./transaction.types').StatusTransacao;
    contaId: string;
    categoria: string;
    descricao: string;
    gerarLinkPagamento?: boolean;
    clienteId?: number;
    ordemServicoId?: number;
    fornecedor?: string;
  };
  const kind = transactionKindFromTipo(legacy.tipo ?? 'ENTRADA');
  if (kind === 'RECEBIMENTO') {
    return {
      kind: 'RECEBIMENTO',
      valor: legacy.valor,
      dataPrevista: legacy.dataPrevista,
      dataLiquidacao: legacy.dataLiquidacao,
      status: legacy.status ?? 'PENDENTE',
      contaId: legacy.contaId,
      categoria: legacy.categoria,
      descricao: legacy.descricao,
      gerarLinkPagamento: legacy.gerarLinkPagamento,
      clienteId: legacy.clienteId,
      ordemServicoId: legacy.ordemServicoId,
    };
  }
  return {
    kind: 'PAGAMENTO',
    valor: legacy.valor,
    dataPrevista: legacy.dataPrevista,
    dataLiquidacao: legacy.dataLiquidacao,
    status: legacy.status ?? 'PENDENTE',
    contaId: legacy.contaId,
    categoria: legacy.categoria,
    descricao: legacy.descricao,
    gerarLinkPagamento: legacy.gerarLinkPagamento,
    fornecedor: legacy.fornecedor,
  };
}

export const TransactionService = {
  assertPeriodoValido(params: ListTransacoesParams): void {
    const inicio = startOfDay(params.periodo.inicio);
    const fim = endOfDay(params.periodo.fim);
    if (inicio.getTime() > fim.getTime()) {
      throw new FinanceServiceError('Período inválido: data inicial posterior à final.', 'PERIODO_INVALIDO');
    }
  },

  validateCreateInput(raw: CreateTransacaoInput | CreateTransactionInput): CreateTransactionInput {
    const normalized = normalizeCreateInput(raw);
    const parsed = CreateTransactionInputSchema.safeParse(normalized);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(' ') || 'Dados da transação inválidos.';
      throw new FinanceServiceError(msg, 'VALIDACAO');
    }
    return parsed.data;
  },

  assertBusinessRules(input: CreateTransactionInput): void {
    if (input.kind === 'PAGAMENTO') {
      const hasSupplier = Boolean(input.fornecedor?.trim());
      const hasCategory = Boolean(input.categoria?.trim());
      if (!hasSupplier && !hasCategory) {
        throw new FinanceServiceError(
          'Pagamentos devem ter obrigatoriamente fornecedor ou categoria.',
          'VALIDACAO',
        );
      }
    }
    if (input.kind === 'RECEBIMENTO') {
      if (!input.clienteId && !input.ordemServicoId) {
        throw new FinanceServiceError(
          'Recebimentos devem estar vinculados a um cliente ou a uma ordem de serviço.',
          'VALIDACAO',
        );
      }
    }
  },

  toLegacyCreatePayload(input: CreateTransactionInput): CreateTransacaoInput & { tipo: 'ENTRADA' | 'SAIDA' } {
    return {
      ...input,
      tipo: tipoFromTransactionKind(input.kind),
    };
  },

  async create(
    ctx: FinanceServiceContext,
    raw: CreateTransacaoInput | CreateTransactionInput,
    options?: CreateTransacaoApiOptions,
  ): Promise<Transacao> {
    const input = this.validateCreateInput(raw);
    this.assertBusinessRules(input);
    const conta = assertPodeUsarConta(ctx, input.contaId, { gerarLink: input.gerarLinkPagamento });

    if (input.gerarLinkPagamento) {
      if (!options?.cobranca?.payerEmail?.trim()) {
        throw new FinanceServiceError(
          'Informe o e-mail do pagador para gerar link de pagamento.',
          'VALIDACAO',
        );
      }
      if (!isContaGateway(conta.tipo)) {
        throw new FinanceServiceError(
          'Links de pagamento só podem ser gerados em contas gateway (Pix/Boleto).',
          'VALIDACAO',
        );
      }
    }

    let taxaPercentual = options?.taxaPercentualMaquininha;
    if (conta.tipo === 'MAQUININHA' && taxaPercentual == null) {
      taxaPercentual = 0;
    }

    try {
      const notes = buildTransactionNotes(input, options);
      const transacao = await createTransacaoViaApi(input, {
        ...options,
        taxaPercentualMaquininha: taxaPercentual,
        serviceOrderId:
          input.kind === 'RECEBIMENTO'
            ? input.ordemServicoId ?? options?.serviceOrderId
            : options?.serviceOrderId,
        notes,
      });
      const cached = financeCache.getTransacoes();
      if (cached) financeCache.setTransacoes([transacao, ...cached]);
      return transacao;
    } catch (err) {
      throw mapToFinanceServiceError(err);
    }
  },
};

export type { CreateTransacaoApiOptions };
