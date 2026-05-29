import type { ListTransacoesParams } from '../finance.types';

/** Chaves estáveis para TanStack Query v5. */
export const financeQueryKeys = {
  all: ['finance'] as const,
  context: (planoKey = 'auto') => [...financeQueryKeys.all, 'context', planoKey] as const,
  entries: (params: ListTransacoesParams) =>
    [
      ...financeQueryKeys.all,
      'entries',
      params.periodo.inicio.toISOString(),
      params.periodo.fim.toISOString(),
      params.contaId ?? 'all',
    ] as const,
  entriesRoot: () => [...financeQueryKeys.all, 'entries'] as const,
  accounts: () => [...financeQueryKeys.all, 'accounts'] as const,
  upcoming: (contaId?: string) =>
    [...financeQueryKeys.all, 'upcoming', contaId ?? 'all'] as const,
  plan: (planoKey = 'auto') => [...financeQueryKeys.all, 'plan', planoKey] as const,
  clientOsLinks: (search = '') => [...financeQueryKeys.all, 'client-os-links', search] as const,
  serviceOrderEntries: (serviceOrderId: number) =>
    [...financeQueryKeys.all, 'service-order-entries', serviceOrderId] as const,
};
