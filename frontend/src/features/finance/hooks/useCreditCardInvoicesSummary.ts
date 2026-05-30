import { useQuery } from '@tanstack/react-query';
import { getFinanceCreditCardInvoicesSummary } from '../../../api/finance';

export function useCreditCardInvoicesSummary(enabled = true) {
  return useQuery({
    queryKey: ['finance', 'credit-card-invoices-summary'],
    queryFn: getFinanceCreditCardInvoicesSummary,
    enabled,
    staleTime: 60_000,
  });
}
