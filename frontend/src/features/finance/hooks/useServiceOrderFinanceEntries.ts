import { useQuery } from '@tanstack/react-query';
import { listTransacoesByServiceOrderFromApi } from '../financeAdapter';
import { mapToFinanceServiceError } from '../financeErrors';
import type { Transacao } from '../transaction.types';
import { financeQueryKeys } from './financeQueryKeys';

export type UseServiceOrderFinanceEntriesOptions = {
  enabled?: boolean;
};

export function useServiceOrderFinanceEntries(
  serviceOrderId: number | undefined,
  options: UseServiceOrderFinanceEntriesOptions = {},
) {
  const { enabled = true } = options;
  const id = serviceOrderId ?? 0;

  return useQuery<Transacao[], Error>({
    queryKey: financeQueryKeys.serviceOrderEntries(id),
    queryFn: async () => {
      try {
        return await listTransacoesByServiceOrderFromApi(id);
      } catch (err) {
        throw mapToFinanceServiceError(err);
      }
    },
    enabled: enabled && id > 0,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
}
