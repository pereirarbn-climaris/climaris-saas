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
} from './ClientFormView';

// Equipment Manager
export {
  ClientEquipmentManager,
  mockCatalog,
  mockEquipments,
  type EquipmentCategory,
  type EquipmentStatus,
  type CatalogBrand,
  type CatalogModel,
  type EquipmentItem,
  type EquipmentCatalog,
  type NewEquipmentData,
  type ClientEquipmentManagerProps,
} from './ClientEquipmentManager';

// Public Equipment Profile (QR Code Page)
export {
  PublicEquipmentProfileView,
  mockEquipmentProfile,
  type EquipmentStatus as PublicEquipmentStatus,
  type EquipmentCategory as PublicEquipmentCategory,
  type MaintenanceEventType,
  type TechnicalSpec,
  type MaintenanceEvent,
  type ProviderCompany,
  type EquipmentProfileData,
  type PublicEquipmentProfileViewProps,
} from './PublicEquipmentProfileView';
