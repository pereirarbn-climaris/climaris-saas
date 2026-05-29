import { z } from 'zod';

export { PlanosSchema, type Planos } from './plan.types';

export const SimulacaoVendaSchema = z.object({
  valorBruto: z.number().positive(),
  taxaPercentual: z.number().nonnegative(),
  planoRecebimento: z.enum(['D0', 'D1', 'D30']),
});

import type { Planos } from './plan.types';

export type SimulacaoVenda = z.infer<typeof SimulacaoVendaSchema>;

export type PeriodoFiltro = {
  inicio: Date;
  fim: Date;
};

export type ListTransacoesParams = {
  periodo: PeriodoFiltro;
  contaId?: string;
};

export type FinanceServiceContext = {
  planoUsuario: Planos;
  contas: import('./account.types').Conta[];
};

export type CalculateLiquidoParams = {
  valorBruto: number;
  taxaPercentual: number;
  taxaFixa?: number;
};

export type CalculateLiquidoResult = {
  valorBruto: number;
  taxaPercentual: number;
  taxaFixa: number;
  valorTaxa: number;
  valorLiquido: number;
};

/** Re-export domínio segmentado. */
export type { Conta, TipoConta, ContaStatus, AccountBalancePatch } from './account.types';
export {
  ContaSchema,
  TipoContaSchema,
  ContaStatusSchema,
} from './account.types';

export type {
  Transaction,
  Transacao,
  CreateTransactionInput,
  CreateTransacaoInput,
  CreateRecebimentoInput,
  CreatePagamentoInput,
  StatusTransacao,
  TipoTransacao,
  RecebimentoTransacao,
  PagamentoTransacao,
} from './transaction.types';

export {
  StatusTransacaoSchema,
  TransactionSchema,
  CreateTransactionInputSchema,
  CreateRecebimentoInputSchema,
  CreatePagamentoInputSchema,
  transactionKindFromTipo,
  tipoFromTransactionKind,
  isRecebimento,
  isPagamento,
} from './transaction.types';
