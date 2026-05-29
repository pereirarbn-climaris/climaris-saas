import { useQuery } from '@tanstack/react-query';
import { listFinancePaymentFees, type FinancePaymentFeeOut } from '../../../api/finance';
import { configFromPaymentFees } from '../../../lib/financeMaquininhaUtils';
import type { MaquininhaConfig } from '../../../schemas/financeMaquininha';
import { financeQueryKeys } from './financeQueryKeys';

export type MaquininhaOption = {
  providerName: string;
  contaId: string;
  config: MaquininhaConfig;
};

export function useFinancePaymentFees(enabled = true) {
  return useQuery({
    queryKey: [...financeQueryKeys.all, 'payment-fees'] as const,
    queryFn: () => listFinancePaymentFees(),
    enabled,
    staleTime: 60_000,
  });
}

export function buildMaquininhaOptions(
  fees: FinancePaymentFeeOut[] | undefined,
  machineContaIds: Map<string, string>,
): MaquininhaOption[] {
  if (!fees?.length) return [];
  const names = Array.from(new Set(fees.map((f) => f.provider_name.trim()).filter(Boolean)));
  return names.map((providerName) => ({
    providerName,
    contaId: machineContaIds.get(providerName.toLowerCase()) ?? '',
    config: configFromPaymentFees(providerName, fees),
  }));
}
