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

export { ServiceOrderFormView, default as ServiceOrderFormViewDefault } from "./ServiceOrderFormView";

export type {
  ServiceOrderData,
  ServiceOrderFormViewProps,
  ServiceOrderStatus as FormServiceOrderStatus,
  ServiceType as FormServiceType,
  ChecklistItem,
  ChecklistItemStatus,
  Cliente,
  Tecnico,
  Equipamento,
} from "./ServiceOrderFormView";
