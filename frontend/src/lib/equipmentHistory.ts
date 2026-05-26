import type { EquipmentHistoryRowOut } from "../api/clients";
import type { EquipmentHistoryTimelineEntry } from "../components/equipment/EquipmentHistoryTimeline";

const VISIT_SOURCES = new Set([
  "ordem_concluida",
  "ordem_agendada",
  "ordem_em_andamento",
  "ordem_aprovada",
  "ordem_pendente",
  "ordem_servico",
]);

function isVisitRow(row: EquipmentHistoryRowOut): boolean {
  return VISIT_SOURCES.has(row.source);
}

function buildVisitTitle(row: EquipmentHistoryRowOut): string {
  const osNum = row.service_order_number ?? String(row.service_order_id);
  const status = row.order_status_label ?? "";
  const service = row.service_name ?? "Serviço";
  const parts = [`OS #${osNum}`];
  if (status) parts.push(status);
  parts.push(service);
  return parts.join(" — ");
}

function formatChecklistSummary(items: EquipmentHistoryRowOut["checklist_items"]): string | null {
  if (!items?.length) return null;
  const validated = items.filter((i) => i.status === "sim").length;
  return `Checklist: ${validated}/${items.length} itens validados`;
}

function buildVisitDetail(row: EquipmentHistoryRowOut): string | null {
  const bits: string[] = [];
  if (row.service_type) bits.push(row.service_type);
  const tech = row.technician_name ?? row.changed_by_user_name;
  if (tech) bits.push(`Técnico: ${tech}`);
  const checklist = formatChecklistSummary(row.checklist_items);
  if (checklist) bits.push(checklist);
  return bits.length ? bits.join(" · ") : null;
}

export function mapEquipmentHistoryToTimeline(
  rows: EquipmentHistoryRowOut[],
): EquipmentHistoryTimelineEntry[] {
  return rows.map((row) => {
    const isVisit = isVisitRow(row);
    const detail = isVisit
      ? buildVisitDetail(row)
      : row.source === "auto_split"
        ? "Separação automática"
        : row.source === "app"
          ? "Vinculação no app"
          : `Origem: ${row.source}`;
    return {
      occurred_at: row.changed_at,
      kind: isVisit ? "servico" : "registro",
      title: isVisit ? buildVisitTitle(row) : `OS #${row.service_order_id} — ${row.service_name ?? "Serviço"}`,
      detail,
      changed_by_user_name: row.technician_name ?? row.changed_by_user_name,
      order_status_label: row.order_status_label,
      checklist_items: row.checklist_items?.map((i) => ({ descricao: i.descricao, status: i.status })),
    };
  });
}

export function sortTimelineEntries(
  entries: EquipmentHistoryTimelineEntry[],
): EquipmentHistoryTimelineEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
}
