import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../../lib/toast';
import { AccountService } from '../accountService';
import { buildFinanceServiceContext, createTransacao, type CreateTransacaoOptions } from '../financeService';
import { FinanceServiceError, mapToFinanceServiceError } from '../financeErrors';
import type { FinanceServiceContext, ListTransacoesParams } from '../finance.types';
import type { CreateTransactionInput, Transacao } from '../transaction.types';
import { normalizeCreateInput } from '../transactionService';
import { tipoFromTransactionKind } from '../transaction.types';
import { financeQueryKeys } from './financeQueryKeys';

export type CreateFinanceEntryVariables = {
  input: CreateTransactionInput;
  options?: CreateTransacaoOptions;
  listParams?: ListTransacoesParams;
  ctx?: FinanceServiceContext;
  /** Invalida lançamentos vinculados à OS após criar recebimento. */
  linkedServiceOrderId?: number;
  onRecorded?: (transacao: Transacao) => void;
};

type OptimisticContext = {
  previousEntries: Transacao[] | undefined;
  previousContext: FinanceServiceContext | undefined;
  listKey: ReturnType<typeof financeQueryKeys.entries> | null;
};

function errorMessage(err: unknown): string {
  if (err instanceof FinanceServiceError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return 'Não foi possível criar a transação.';
}

function buildOptimisticRow(input: CreateTransactionInput): Transacao {
  const normalized = normalizeCreateInput(input);
  return {
    id: `opt-${crypto.randomUUID()}`,
    valor: normalized.valor,
    dataPrevista: normalized.dataPrevista,
    dataLiquidacao: normalized.dataLiquidacao,
    status: normalized.status ?? 'PENDENTE',
    tipo: tipoFromTransactionKind(normalized.kind),
    kind: normalized.kind,
    contaId: normalized.contaId,
    categoria: normalized.categoria,
    descricao: normalized.descricao,
    clienteId: normalized.kind === 'RECEBIMENTO' ? normalized.clienteId : undefined,
    ordemServicoId: normalized.kind === 'RECEBIMENTO' ? normalized.ordemServicoId : undefined,
    fornecedor: normalized.kind === 'PAGAMENTO' ? normalized.fornecedor : undefined,
  };
}

export function useCreateFinanceEntry() {
  const queryClient = useQueryClient();

  return useMutation<Transacao, Error, CreateFinanceEntryVariables, OptimisticContext>({
    mutationFn: async ({ input, options, ctx }) => {
      try {
        const serviceCtx = ctx ?? (await buildFinanceServiceContext());
        return await createTransacao(serviceCtx, input, options);
      } catch (err) {
        throw mapToFinanceServiceError(err);
      }
    },
    onMutate: async (variables) => {
      const normalized = normalizeCreateInput(variables.input);
      const listKey = variables.listParams
        ? financeQueryKeys.entries(variables.listParams)
        : null;

      await queryClient.cancelQueries({ queryKey: financeQueryKeys.entriesRoot() });
      await queryClient.cancelQueries({ queryKey: financeQueryKeys.context('auto') });
      if (listKey) await queryClient.cancelQueries({ queryKey: listKey });

      const previousEntries = listKey
        ? queryClient.getQueryData<Transacao[]>(listKey)
        : undefined;
      const previousContext = queryClient.getQueryData<FinanceServiceContext>(
        financeQueryKeys.context('auto'),
      );

      const optimistic = buildOptimisticRow(normalized);
      if (listKey) {
        queryClient.setQueryData<Transacao[]>(listKey, (old) => [optimistic, ...(old ?? [])]);
      }

      const delta = AccountService.balanceDeltaForTransaction(
        normalized.kind,
        normalized.valor,
        normalized.status ?? 'PENDENTE',
      );

      const patch = [{ contaId: normalized.contaId, delta }];
      queryClient.setQueryData<FinanceServiceContext>(financeQueryKeys.context('auto'), (old) => {
        if (!old) return old;
        const contas = AccountService.applyBalancePatches(old.contas, patch);
        queryClient.setQueryData(financeQueryKeys.accounts(), contas);
        return { ...old, contas };
      });

      return { previousEntries, previousContext, listKey };
    },
    onError: (err, _variables, context) => {
      if (context?.listKey && context.previousEntries) {
        queryClient.setQueryData(context.listKey, context.previousEntries);
      }
      if (context?.previousContext) {
        queryClient.setQueryData(financeQueryKeys.context('auto'), context.previousContext);
        if (context.previousContext?.contas) {
          queryClient.setQueryData(financeQueryKeys.accounts(), context.previousContext.contas);
        }
      }
      toast.error(errorMessage(err));
    },
    onSuccess: (data, variables) => {
      toast.success('Transação registrada com sucesso.');
      if (variables.listParams) {
        void queryClient.invalidateQueries({
          queryKey: financeQueryKeys.entries(variables.listParams),
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: financeQueryKeys.entriesRoot() });
      }
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.context('auto') });
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts() });
      if (variables.linkedServiceOrderId != null && variables.linkedServiceOrderId > 0) {
        void queryClient.invalidateQueries({
          queryKey: financeQueryKeys.serviceOrderEntries(variables.linkedServiceOrderId),
        });
      }
      variables.onRecorded?.(data);
    },
  });
}

/** Alias alinhado ao domínio `Transaction`. */
export const useCreateTransaction = useCreateFinanceEntry;
