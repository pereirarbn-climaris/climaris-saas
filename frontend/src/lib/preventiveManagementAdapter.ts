import type { PreventiveItem } from "../api/preventiveMaintenance";
import type {
  PreventiveContract,
  PreventiveMetrics,
  PreventiveStatus,
} from "../components/v0-ui/preventive/PreventiveManagementView";
import { getPreventiveStatus } from "./preventiveStatus";

function equipmentDisplayName(row: PreventiveItem): string {
  const ident = row.equipment_identificacao?.trim();
  const fromService = row.service_name?.replace(/^Preventiva\s*[—-]\s*/i, "").trim();
  if (ident && fromService && ident !== fromService) {
    return `${ident} — ${fromService}`;
  }
  return ident || fromService || "Equipamento";
}

function equipmentSector(row: PreventiveItem): string {
  const service = row.service_name?.replace(/^Preventiva\s*[—-]\s*/i, "").trim();
  return service || "";
}

export function preventiveStatusToV0(
  diasAteVencimento: number,
  dataProximoVencimento: string,
): PreventiveStatus {
  const kind = getPreventiveStatus(diasAteVencimento, dataProximoVencimento);
  if (kind === "overdue") return "atrasada";
  if (kind === "due_this_month") return "vence_este_mes";
  return "em_dia";
}

export function preventiveItemToContract(row: PreventiveItem): PreventiveContract {
  return {
    id: `${row.client_id}-${row.rule_id ?? 0}-${row.equipment_id ?? row.historico_servico_id}`,
    clientName: row.client_name,
    clientId: String(row.client_id),
    equipmentName: equipmentDisplayName(row),
    sector: equipmentSector(row),
    lastMaintenanceDate: row.data_ultima_realizacao?.split("T")[0] ?? null,
    nextMaintenanceDate: row.data_proximo_vencimento?.split("T")[0] ?? row.data_proximo_vencimento,
    status: preventiveStatusToV0(row.dias_ate_vencimento, row.data_proximo_vencimento),
    contractId: String(row.service_id),
  };
}

export function preventiveItemsToContracts(items: PreventiveItem[]): PreventiveContract[] {
  return items.map(preventiveItemToContract);
}

export function computeV0PreventiveMetrics(
  items: PreventiveItem[],
  activeClientCount: number,
): PreventiveMetrics {
  let onTime = 0;
  let overdue = 0;

  for (const row of items) {
    const status = preventiveStatusToV0(row.dias_ate_vencimento, row.data_proximo_vencimento);
    if (status === "atrasada") overdue += 1;
    else onTime += 1;
  }

  return {
    activeContracts: activeClientCount,
    onTime,
    overdue,
  };
}

export function contractIdToPreventiveItem(
  contracts: PreventiveContract[],
  items: PreventiveItem[],
  contractId: string,
): PreventiveItem | undefined {
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) return undefined;
  return items.find((row) => preventiveItemToContract(row).id === contract.id);
}
