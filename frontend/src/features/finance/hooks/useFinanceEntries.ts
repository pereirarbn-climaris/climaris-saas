import { useQuery } from '@tanstack/react-query';
import { listTransacoesFromApi } from '../financeAdapter';
import { mapToFinanceServiceError } from '../financeErrors';
import type { ListTransacoesParams, Transacao } from '../finance.types';
import { financeQueryKeys } from './financeQueryKeys';

export type UseFinanceEntriesFilters = ListTransacoesParams;

export type UseFinanceEntriesOptions = {
  enabled?: boolean;
};

/**
 * Lista transações (lançamentos) via adaptador + API.
 * `refetchOnWindowFocus` mantém saldos/listagens atualizados ao voltar à aba.
 */
export function useFinanceEntries(
  filters: UseFinanceEntriesFilters,
  options: UseFinanceEntriesOptions = {},
) {
  const { enabled = true } = options;

  return useQuery<Transacao[], Error>({
    queryKey: financeQueryKeys.entries(filters),
    enabled:
      enabled &&
      Boolean(filters.periodo.inicio) &&
      Boolean(filters.periodo.fim) &&
      filters.periodo.inicio.getTime() <= filters.periodo.fim.getTime(),
    queryFn: async () => {
      try {
        return await listTransacoesFromApi(filters);
      } catch (err) {
        throw mapToFinanceServiceError(err);
      }
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
