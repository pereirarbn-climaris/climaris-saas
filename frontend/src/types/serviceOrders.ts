/** Tipos da API de ordens de serviço (pivot equipamento ↔ serviço). */

export type ServiceOrderMissingRequirement = {
  code: string;
  message: string;
  field?: string | null;
  blocking?: boolean;
};

export type OrderStatus = "open" | "approved" | "scheduled" | "in_progress" | "done" | "cancelled";

export type ServiceOrderEquipmentServiceOut = {
  id: number;
  service_id: number;
  equipment_id?: number | null;
  quantity: number;
  unit_price: number;
  duration_minutes: number;
  service_name?: string | null;
  periodicidade_meses?: number | null;
};

export type ServiceOrderEquipmentCardOut = {
  equipment_id: number | null;
  equipment_identificacao: string | null;
  equipment_tipo: string | null;
  equipment_modelo: string | null;
  /** true quando o equipamento foi cadastrado sem marca/modelo conhecidos
   * ("a identificar") — precisa ser identificado antes de concluir a OS. */
  equipment_pending_identification?: boolean;
  services: ServiceOrderEquipmentServiceOut[];
  total_duration_minutes: number;
};

export type ServiceOrderProductItemOut = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
};

export type ServiceOrderScheduleOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  service_order_id: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
};

export type ServiceOrderOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  client_site_id?: number | null;
  client_site_name?: string | null;
  service_address?: string | null;
  title: string;
  description: string | null;
  discount_amount?: number;
  status: OrderStatus;
  opened_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  completed_at?: string | null;
  actual_duration_minutes?: number | null;
  stock_consumed_at?: string | null;
  assigned_technician_name?: string | null;
  technician_ids?: number[];
  total_duration_minutes?: number;
  equipment_services?: ServiceOrderEquipmentServiceOut[];
  equipment_cards?: ServiceOrderEquipmentCardOut[];
  service_items: ServiceOrderEquipmentServiceOut[];
  product_items: ServiceOrderProductItemOut[];
  schedule: ServiceOrderScheduleOut | null;
};

export type ServiceOrderEquipmentServiceInput = {
  service_id: number;
  quantity?: number;
  equipment_id?: number | null;
  unit_price?: number | null;
};

export type ServiceOrderCreatePayload = {
  client_id: number;
  client_site_id?: number | null;
  title: string;
  description?: string | null;
  technician_ids?: number[];
  services: ServiceOrderEquipmentServiceInput[];
  equipment_services?: ServiceOrderEquipmentServiceInput[];
  products?: Array<{ product_id: number; quantity: number; unit_price?: number }>;
  discount_amount?: number;
};
