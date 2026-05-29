import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { listClients } from '../../../api/clients';
import { listServiceOrders } from '../../../api/serviceOrders';
import { financeQueryKeys } from './financeQueryKeys';

export type ClientOSLinkOption = {
  /** Chave estável: `os:123` ou `client:45` */
  id: string;
  clientId: number;
  serviceOrderId?: number;
  label: string;
};

function normalizeSearch(q: string): string {
  return q.trim().toLowerCase();
}

function matchesOption(opt: ClientOSLinkOption, q: string): boolean {
  const n = normalizeSearch(q);
  if (!n) return true;
  if (opt.label.toLowerCase().includes(n)) return true;
  if (String(opt.clientId).includes(n)) return true;
  if (opt.serviceOrderId != null && String(opt.serviceOrderId).includes(n)) return true;
  return false;
}

function buildOptions(
  clients: Awaited<ReturnType<typeof listClients>>,
  orders: Awaited<ReturnType<typeof listServiceOrders>>,
  search: string,
): ClientOSLinkOption[] {
  const clientNameById = new Map(clients.map((c) => [c.id, c.name.trim() || `Cliente #${c.id}`]));
  const options: ClientOSLinkOption[] = [];
  const seenOs = new Set<number>();
  const seenClientOnly = new Set<number>();

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const clientName = clientNameById.get(order.client_id) ?? `Cliente #${order.client_id}`;
    const label = `${clientName} (OS #${order.id})`;
    const opt: ClientOSLinkOption = {
      id: `os:${order.id}`,
      clientId: order.client_id,
      serviceOrderId: order.id,
      label,
    };
    if (matchesOption(opt, search)) {
      options.push(opt);
      seenOs.add(order.id);
    }
    clientNameById.set(order.client_id, clientName);
  }

  for (const client of clients) {
    if (seenClientOnly.has(client.id)) continue;
    const hasOsInList = orders.some((o) => o.client_id === client.id && o.status !== 'cancelled');
    const label = hasOsInList
      ? `${client.name.trim()} (cliente #${client.id})`
      : `${client.name.trim()} (cliente #${client.id})`;
    const opt: ClientOSLinkOption = {
      id: `client:${client.id}`,
      clientId: client.id,
      label,
    };
    if (matchesOption(opt, search)) {
      options.push(opt);
      seenClientOnly.add(client.id);
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

async function fetchClientOSLinkOptions(search: string): Promise<ClientOSLinkOption[]> {
  const q = search.trim();
  const [clients, orders] = await Promise.all([
    listClients({ q: q || undefined, limit: 80, status: 'active' }),
    listServiceOrders({ limit: 150 }),
  ]);
  return buildOptions(clients, orders, q);
}

export function useDebouncedValue<T>(value: T, delayMs = 320): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useClientOSLinkOptions(search: string, enabled = true) {
  const debouncedSearch = useDebouncedValue(search, 320);

  const query = useQuery({
    queryKey: financeQueryKeys.clientOsLinks(debouncedSearch),
    queryFn: () => fetchClientOSLinkOptions(debouncedSearch),
    enabled,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });

  const options = useMemo(() => query.data ?? [], [query.data]);

  return {
    options,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export function findClientOSOption(
  options: ClientOSLinkOption[],
  selectionId: string | null | undefined,
): ClientOSLinkOption | undefined {
  if (!selectionId?.trim()) return undefined;
  return options.find((o) => o.id === selectionId);
}

export function isValidClientOSSelection(
  options: ClientOSLinkOption[],
  selectionId: string | null | undefined,
): boolean {
  const opt = findClientOSOption(options, selectionId);
  if (!opt) return false;
  if (!Number.isFinite(opt.clientId) || opt.clientId < 1) return false;
  if (opt.serviceOrderId != null && (!Number.isFinite(opt.serviceOrderId) || opt.serviceOrderId < 1)) {
    return false;
  }
  return true;
}
