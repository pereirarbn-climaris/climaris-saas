import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { fetchPlanoUsuarioFromApi } from '../financeAdapter';
import { AccountService } from '../accountService';
import { mapToFinanceServiceError } from '../financeErrors';
import type { Conta } from '../account.types';
import type { FinanceServiceContext, Planos } from '../finance.types';
import { financeQueryKeys } from './financeQueryKeys';

export type UseFinanceServiceContextOptions = {
  planoUsuario?: Planos;
  enabled?: boolean;
  /** Atualização periódica de contas/saldos (ms). Padrão: 30s. */
  refetchIntervalMs?: number | false;
};

/**
 * Fonte única de verdade: plano + contas bancárias (saldos).
 * `useFinanceAccounts` deriva deste hook — não busca em paralelo.
 */
export function useFinanceServiceContext(options: UseFinanceServiceContextOptions = {}) {
  const {
    planoUsuario,
    enabled = true,
    refetchIntervalMs = 30_000,
  } = options;
  const queryClient = useQueryClient();
  const planKey = planoUsuario ?? 'auto';

  const query = useQuery<FinanceServiceContext, Error>({
    queryKey: financeQueryKeys.context(planKey),
    queryFn: async () => {
      try {
        const [contas, plano] = await Promise.all([
          AccountService.listFromApi(),
          planoUsuario != null ? Promise.resolve(planoUsuario) : fetchPlanoUsuarioFromApi(),
        ]);
        const ctx: FinanceServiceContext = { planoUsuario: plano, contas };
        queryClient.setQueryData(financeQueryKeys.accounts(), contas);
        return ctx;
      } catch (err) {
        throw mapToFinanceServiceError(err);
      }
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: refetchIntervalMs === false ? false : refetchIntervalMs,
    refetchOnWindowFocus: true,
  });

  const patchContas = useCallback(
    (updater: (contas: Conta[]) => Conta[]) => {
      queryClient.setQueryData<FinanceServiceContext>(financeQueryKeys.context(planKey), (old) => {
        if (!old) return old;
        const contas = updater(old.contas);
        queryClient.setQueryData(financeQueryKeys.accounts(), contas);
        return { ...old, contas };
      });
    },
    [queryClient, planKey],
  );

  return {
    ...query,
    patchContas,
  };
}

/** Contas derivadas do contexto financeiro (mesma fonte de verdade). */
export function useFinanceAccounts(options: UseFinanceServiceContextOptions = {}) {
  const ctx = useFinanceServiceContext(options);

  const data = useMemo(() => ctx.data?.contas, [ctx.data?.contas]);

  return {
    data,
    isLoading: ctx.isLoading,
    isError: ctx.isError,
    error: ctx.error,
    isFetching: ctx.isFetching,
    refetch: ctx.refetch,
    patchContas: ctx.patchContas,
  };
}
