/**
 * Re-export da listagem de OS (implementação em service-orders-list.tsx).
 */

export {
  ServiceOrdersListView,
  ServiceOrdersListTable,
  statusConfig,
  serviceTypeLabels,
  formatCurrency,
  formatDate,
} from "./service-orders-list";

export type {
  ServiceOrder,
  ServiceOrderStatus,
  ServiceType,
  Technician,
  ServiceOrderMetrics,
  ServiceOrdersListViewProps,
  ServiceOrdersListTableProps,
  ListPagination,
} from "./service-orders-list";
