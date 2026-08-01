/**
 * Clients Components
 * 
 * Componentes para gerenciamento de clientes do Climaris SaaS.
 */

export {
  ClientFormView,
  type ClientData,
  type ClientType,
  type ClientRegime,
  type Equipment,
  type HistoryItem,
  type ServiceOrder,
  type Budget,
  type PMOCData,
  type TabId,
  type ClientFormViewProps,
} from "./client-form";

export {
  ClientEquipmentManager,
  AddEquipmentModal,
  type ClientEquipmentManagerProps,
  type AddEquipmentModalProps,
  type CatalogBrand,
  type CatalogModel,
  type EquipmentCatalog,
  type EquipmentItem,
  type EquipmentStatus,
  type NewEquipmentData,
  type EquipmentCategoryPickerOption,
} from "./ClientEquipmentManager";

export {
  ClientsListView,
  ClientsStatsGrid,
  ClientsListTable,
  type ClientListSortKey,
  type ClientListSortDir,
  type ClientsListViewProps,
} from "./clients-list";
