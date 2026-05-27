/** Tipos alinhados aos schemas `EquipmentPreventiveRule*` do backend. */

export type PreventiveIntervalType = "months" | "days";

export type EquipmentPreventiveRuleCreate = {
  equipment_id: number;
  interval_value: number;
  interval_type: PreventiveIntervalType;
  is_active: boolean;
};

export type EquipmentPreventiveRuleUpdate = {
  interval_value?: number;
  interval_type?: PreventiveIntervalType;
  is_active?: boolean;
};

export type EquipmentPreventiveRuleOut = {
  id: number;
  equipment_id: number;
  interval_value: number;
  interval_type: PreventiveIntervalType;
  is_active: boolean;
  last_performed_date: string | null;
  next_due_date: string | null;
  created_at: string;
  updated_at: string;
  equipment_identificacao: string | null;
  client_id: number | null;
};

export type ServicePreventiveIntervalType = "days" | "months" | "years";

export type EquipmentServicePreventiveScheduleOut = {
  service_id: number;
  service_name: string;
  service_description: string | null;
  default_interval_value: number;
  default_interval_type: ServicePreventiveIntervalType;
  override_interval_value: number | null;
  override_interval_type: ServicePreventiveIntervalType | null;
  effective_interval_value: number;
  effective_interval_type: ServicePreventiveIntervalType;
  last_performed_at: string | null;
  next_due_at: string | null;
  last_service_order_id: number | null;
  pending_service_order_id?: number | null;
  awaiting_completion?: boolean;
  has_override: boolean;
};
