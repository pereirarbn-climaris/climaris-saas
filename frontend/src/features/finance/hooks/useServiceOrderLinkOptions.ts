import { useQuery } from '@tanstack/react-query';
import { listServiceOrders, type ServiceOrderOut } from '../../../api/serviceOrders';
import { financeQueryKeys } from './financeQueryKeys';

export type ServiceOrderLinkOption = {
  id: string;
  serviceOrderId: number;
  label: string;
  status: ServiceOrderOut['status'];
};

const LINKABLE_STATUSES = new Set<ServiceOrderOut['status']>([
  'open',
  'approved',
  'scheduled',
  'in_progress',
  'done',
]);

function matchesOrder(order: ServiceOrderOut, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  if (String(order.id).includes(n)) return true;
  return false;
}

async function fetchServiceOrderLinkOptions(search: string): Promise<ServiceOrderLinkOption[]> {
  const orders = await listServiceOrders({ limit: 120 });
  return orders
    .filter((o) => LINKABLE_STATUSES.has(o.status))
    .filter((o) => matchesOrder(o, search))
    .map((o) => ({
      id: `os:${o.id}`,
      serviceOrderId: o.id,
      label: `OS #${o.id} · ${statusLabel(o.status)}`,
      status: o.status,
    }))
    .sort((a, b) => b.serviceOrderId - a.serviceOrderId);
}

function statusLabel(status: ServiceOrderOut['status']): string {
  const m: Record<ServiceOrderOut['status'], string> = {
    open: 'Aberta',
    approved: 'Aprovada',
    scheduled: 'Agendada',
    in_progress: 'Em andamento',
    done: 'Concluída',
    cancelled: 'Cancelada',
  };
  return m[status] ?? status;
}

export function findServiceOrderLinkOption(
  options: ServiceOrderLinkOption[],
  id: string | null,
): ServiceOrderLinkOption | undefined {
  if (!id) return undefined;
  return options.find((o) => o.id === id);
}

export function useServiceOrderLinkOptions(search: string, enabled: boolean) {
  return useQuery({
    queryKey: [...financeQueryKeys.all, 'os-link-options', search] as const,
    queryFn: () => fetchServiceOrderLinkOptions(search),
    enabled,
    staleTime: 30_000,
  });
}
