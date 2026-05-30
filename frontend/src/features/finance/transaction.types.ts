import { z } from 'zod';

export const StatusTransacaoSchema = z.enum(['PENDENTE', 'LIQUIDADO', 'CANCELADO']);

const TransacaoBaseSchema = z.object({
  valor: z.number().positive('Informe um valor maior que zero.'),
  dataPrevista: z.date(),
  dataLiquidacao: z.date().optional(),
  status: StatusTransacaoSchema.default('PENDENTE'),
  contaId: z.string().uuid(),
  descricao: z.string().min(1, 'Descrição é obrigatória.'),
  taxaDescontada: z.number().optional(),
  gerarLinkPagamento: z.boolean().optional(),
  categoria: z.string().min(1, 'Categoria é obrigatória.'),
});

export const RecebimentoTransacaoSchema = TransacaoBaseSchema.extend({
  kind: z.literal('RECEBIMENTO'),
  clienteId: z.number().int().positive().optional(),
  ordemServicoId: z.number().int().positive().optional(),
});

export const PagamentoTransacaoSchema = TransacaoBaseSchema.extend({
  kind: z.literal('PAGAMENTO'),
  fornecedor: z.string().optional(),
  ordemServicoId: z.number().int().positive().optional(),
});

export const TransactionSchema = z.discriminatedUnion('kind', [
  RecebimentoTransacaoSchema,
  PagamentoTransacaoSchema,
]);

export const CreateRecebimentoInputSchema = RecebimentoTransacaoSchema;
export const CreatePagamentoInputSchema = PagamentoTransacaoSchema;

export const CreateTransactionInputSchema = z
  .discriminatedUnion('kind', [CreateRecebimentoInputSchema, CreatePagamentoInputSchema])
  .superRefine((data, ctx) => {
    if (data.kind === 'RECEBIMENTO') {
      if (!data.clienteId && !data.ordemServicoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Recebimentos devem estar vinculados a um cliente ou a uma ordem de serviço.',
          path: ['clienteId'],
        });
      }
      return;
    }
    if (!data.fornecedor?.trim() && !data.categoria?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pagamentos devem ter fornecedor ou categoria informados.',
        path: ['fornecedor'],
      });
    }
  });

export type StatusTransacao = z.infer<typeof StatusTransacaoSchema>;
export type RecebimentoTransacao = z.infer<typeof RecebimentoTransacaoSchema>;
export type PagamentoTransacao = z.infer<typeof PagamentoTransacaoSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type CreateRecebimentoInput = z.infer<typeof CreateRecebimentoInputSchema>;
export type CreatePagamentoInput = z.infer<typeof CreatePagamentoInputSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionInputSchema>;

/** Legado API/UI — mapeia para discriminated union. */
export type TipoTransacao = 'ENTRADA' | 'SAIDA';

export type Transacao = {
  id: string;
  valor: number;
  /** Vencimento / due_date */
  dataPrevista: Date;
  /** Competência (data da venda/serviço) */
  dataCompetencia?: Date;
  /** Previsão de entrada no caixa (expected_settlement_date) */
  dataLiquidacaoPrevista?: Date;
  /** Alias explícito para liquidação prevista */
  settlementDate?: Date;
  dataLiquidacao?: Date;
  /** Valor líquido (após taxas) */
  netValue?: number;
  /** Taxa % aplicada no cálculo */
  feeApplied?: number;
  status: StatusTransacao;
  tipo: TipoTransacao;
  kind: 'RECEBIMENTO' | 'PAGAMENTO';
  contaId: string;
  categoria: string;
  descricao: string;
  taxaDescontada?: number;
  clienteId?: number;
  ordemServicoId?: number;
  fornecedor?: string;
  /** Série recorrente no backend (edição em massa "esta e próximas"). */
  recurringTransactionId?: number;
  /** Alias de negócio: `parent_id` = recurring_transaction_id. */
  parentSeriesId?: number;
  isRecurring?: boolean;
  creditCardInvoiceId?: number;
  installmentNumber?: number;
  installmentTotal?: number;
  /** Status bruto da API (pending, paid, …). */
  apiStatus?: import('../../api/finance').FinanceEntryStatus;
  notes?: string | null;
};

export type CreateTransacaoInput = CreateTransactionInput;

export function transactionKindFromTipo(tipo: TipoTransacao): 'RECEBIMENTO' | 'PAGAMENTO' {
  return tipo === 'ENTRADA' ? 'RECEBIMENTO' : 'PAGAMENTO';
}

export function tipoFromTransactionKind(kind: 'RECEBIMENTO' | 'PAGAMENTO'): TipoTransacao {
  return kind === 'RECEBIMENTO' ? 'ENTRADA' : 'SAIDA';
}

export function isRecebimento(t: Transaction | Transacao): t is RecebimentoTransacao & { id: string } {
  return t.kind === 'RECEBIMENTO';
}

export function isPagamento(t: Transaction | Transacao): t is PagamentoTransacao & { id: string } {
  return t.kind === 'PAGAMENTO';
}
