/**
 * Service Orders Module - Exports
 */

export {
  ServiceOrdersListView,
  statusConfig,
  serviceTypeLabels,
  formatCurrency,
  formatDate,
} from "./ServiceOrdersListView";

export type {
  ServiceOrder,
  ServiceOrderStatus,
  ServiceType,
  Technician,
  ServiceOrderMetrics,
  ServiceOrdersListViewProps,
} from "./ServiceOrdersListView";

// Form View
export {
  ServiceOrderFormView,
} from "./ServiceOrderFormView";

export type {
  ServiceOrderData,
  ServiceOrderFormViewProps,
  Cliente,
  Tecnico,
  Equipamento,
  ChecklistItem,
  ChecklistItemStatus,
} from "./ServiceOrderFormView";
