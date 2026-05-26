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
