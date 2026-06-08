import { syncFinanceAccountBalances } from '../../api/finance';
import { fetchContasFromApi } from './financeAdapter';
import { FinanceServiceError } from './financeErrors';
import { mapToFinanceServiceError } from './financeErrors';
import { isContaGateway, planoAtendeMinimo } from './financePlanUtils';
import type { Conta, AccountBalancePatch } from './account.types';
import type { FinanceServiceContext } from './finance.types';

/** Contas do cadastro bancário (extrato lateral) — exclui maquininha e gateways. */
export function filterContasBancarias(contas: Conta[]): Conta[] {
  return contas.filter((c) => c.tipo === 'BANCO' && (c.status ?? 'ATIVA') === 'ATIVA');
}

export const AccountService = {
  async listFromApi(): Promise<Conta[]> {
    try {
      return await fetchContasFromApi();
    } catch (err) {
      throw mapToFinanceServiceError(err);
    }
  },

  getActiveContas(contas: Conta[]): Conta[] {
    return contas.filter((c) => (c.status ?? 'ATIVA') === 'ATIVA');
  },

  findConta(contas: Conta[], contaId: string): Conta | undefined {
    return contas.find((c) => c.id === contaId);
  },

  assertContaAtiva(conta: Conta): void {
    if ((conta.status ?? 'ATIVA') !== 'ATIVA') {
      throw new FinanceServiceError('Esta conta está inativa. Selecione outra conta.', 'CONTA_INATIVA');
    }
  },

  assertContaPermitidaNoPlano(ctx: FinanceServiceContext, conta: Conta, gerarLink = false): void {
    const contaGateway = isContaGateway(conta.tipo);

    if (ctx.planoUsuario === 'SIMPLES' && (gerarLink || contaGateway)) {
      throw new FinanceServiceError(
        'Seu plano SIMPLES não permite gerar link de pagamento (Pix/Boleto). Faça upgrade para PRO.',
        'PLANO_INSUFICIENTE',
      );
    }

    if (!planoAtendeMinimo(ctx.planoUsuario, conta.planoMinimo)) {
      throw new FinanceServiceError(
        `Esta conta exige plano ${conta.planoMinimo} ou superior. Seu plano atual: ${ctx.planoUsuario}.`,
        'PLANO_INSUFICIENTE',
      );
    }
  },

  /** Aplica delta otimista ao saldo em memória (UI). */
  applyBalancePatches(contas: Conta[], patches: AccountBalancePatch[]): Conta[] {
    if (!patches.length) return contas;
    const byId = new Map(patches.map((p) => [p.contaId, p.delta]));
    return contas.map((c) => {
      const delta = byId.get(c.id);
      if (delta == null || delta === 0) return c;
      return {
        ...c,
        saldoAtual: Math.round((c.saldoAtual + delta) * 100) / 100,
      };
    });
  },

  balanceDeltaForTransaction(
    kind: 'RECEBIMENTO' | 'PAGAMENTO',
    valor: number,
    status: import('./transaction.types').StatusTransacao,
  ): number {
    if (status === 'CANCELADO') return 0;
    const signed = kind === 'RECEBIMENTO' ? valor : -valor;
    return signed;
  },

  async syncBalances(_contas: Conta[]): Promise<Conta[]> {
    await syncFinanceAccountBalances();
    return this.listFromApi();
  },
};

export function assertPodeUsarConta(
  ctx: FinanceServiceContext,
  contaId: string,
  options?: { gerarLink?: boolean },
): Conta {
  const conta = AccountService.findConta(ctx.contas, contaId);
  if (!conta) {
    throw new FinanceServiceError('Conta financeira não encontrada.', 'CONTA_NAO_ENCONTRADA');
  }
  AccountService.assertContaAtiva(conta);
  AccountService.assertContaPermitidaNoPlano(ctx, conta, options?.gerarLink ?? false);
  return conta;
}
