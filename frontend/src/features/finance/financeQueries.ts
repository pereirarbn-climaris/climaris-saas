/**
 * @deprecated Prefira importar de `./hooks` (`useFinanceEntries`, `useCreateFinanceEntry`).
 * Mantido para compatibilidade com código existente.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildFinanceServiceContext, createTransacao, listTransacoes, type CreateTransacaoOptions } from './financeService';
import type { CreateTransacaoInput, ListTransacoesParams, Planos } from './finance.types';
import { financeQueryKeys, useFinanceServiceContext } from './hooks';

/** @deprecated Use `financeQueryKeys` de `./hooks`. */
export const financeKeys = {
  all: financeQueryKeys.all,
  context: (plano?: Planos) => financeQueryKeys.context(plano ?? 'auto'),
  transacoes: (params: ListTransacoesParams) => financeQueryKeys.entries(params),
};

export { useFinanceServiceContext };

/** @deprecated Use `useFinanceEntries`. */
export function useTransacoesQuery(params: ListTransacoesParams, enabled = true) {
  return useQuery({
    queryKey: financeQueryKeys.entries(params),
    queryFn: () => listTransacoes(params),
    enabled,
    refetchOnWindowFocus: true,
  });
}

/** @deprecated Use `useCreateFinanceEntry`. */
export function useCreateTransacaoMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ctx,
      input,
      options,
    }: {
      ctx: Awaited<ReturnType<typeof buildFinanceServiceContext>>;
      input: CreateTransacaoInput;
      options?: CreateTransacaoOptions;
      listParams?: ListTransacoesParams;
    }) => createTransacao(ctx, input, options),
    onSuccess: (_data, variables) => {
      if (variables.listParams) {
        void qc.invalidateQueries({ queryKey: financeQueryKeys.entries(variables.listParams) });
      } else {
        void qc.invalidateQueries({ queryKey: financeQueryKeys.entriesRoot() });
      }
    },
  });
}
