import { listTransacoesFromApi } from './financeAdapter';
import { financeCache } from './financeCache';
import { FinanceServiceError, mapToFinanceServiceError } from './financeErrors';
import { fetchPlanoUsuarioFromApi } from './financeAdapter';
import { AccountService, assertPodeUsarConta } from './accountService';
import { TransactionService, type CreateTransacaoApiOptions } from './transactionService';
import {
  SimulacaoVendaSchema,
  type CalculateLiquidoParams,
  type CalculateLiquidoResult,
  type Conta,
  type CreateTransacaoInput,
  type FinanceServiceContext,
  type ListTransacoesParams,
  type Planos,
  type Transacao,
} from './finance.types';

export { FinanceServiceError, mapToFinanceServiceError } from './financeErrors';
export { mapApiPlanToFinancePlan } from './financePlanUtils';
export { AccountService, assertPodeUsarConta } from './accountService';
export { TransactionService } from './transactionService';
export type { CreateTransacaoApiOptions };

/** @deprecated Use `assertPodeUsarConta`. */
export function assertPodeCriarTransacao(ctx: FinanceServiceContext, input: CreateTransacaoInput): Conta {
  return assertPodeUsarConta(ctx, input.contaId, { gerarLink: Boolean(input.gerarLinkPagamento) });
}

export async function buildFinanceServiceContext(
  planoUsuario?: Planos,
): Promise<FinanceServiceContext> {
  try {
    const [contas, plano] = await Promise.all([
      AccountService.listFromApi(),
      planoUsuario != null ? Promise.resolve(planoUsuario) : fetchPlanoUsuarioFromApi(),
    ]);
    financeCache.setContas(contas);
    return { planoUsuario: plano, contas };
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

export async function listTransacoes(params: ListTransacoesParams): Promise<Transacao[]> {
  TransactionService.assertPeriodoValido(params);
  try {
    const rows = await listTransacoesFromApi(params);
    financeCache.setTransacoes(rows);
    return rows;
  } catch (err) {
    throw mapToFinanceServiceError(err);
  }
}

export type CreateTransacaoOptions = CreateTransacaoApiOptions;

export async function createTransacao(
  ctx: FinanceServiceContext,
  raw: CreateTransacaoInput,
  options?: CreateTransacaoOptions,
): Promise<Transacao> {
  return TransactionService.create(ctx, raw, options);
}

export function calculateLiquido(params: CalculateLiquidoParams): CalculateLiquidoResult {
  const valorBruto = Math.max(0, params.valorBruto);
  const taxaPercentual = Math.max(0, Math.min(100, params.taxaPercentual));
  const taxaFixa = Math.max(0, params.taxaFixa ?? 0);

  const valorTaxa = Math.round((valorBruto * (taxaPercentual / 100) + taxaFixa) * 100) / 100;
  const valorLiquido = Math.max(0, Math.round((valorBruto - valorTaxa) * 100) / 100);

  return {
    valorBruto,
    taxaPercentual,
    taxaFixa,
    valorTaxa,
    valorLiquido,
  };
}

export function calculateLiquidoFromSimulacao(
  simulacao: { valorBruto: number; taxaPercentual: number },
): CalculateLiquidoResult {
  const parsed = SimulacaoVendaSchema.pick({ valorBruto: true, taxaPercentual: true }).safeParse(simulacao);
  if (!parsed.success) {
    throw new FinanceServiceError('Parâmetros de simulação inválidos.', 'VALIDACAO');
  }
  return calculateLiquido(parsed.data);
}
