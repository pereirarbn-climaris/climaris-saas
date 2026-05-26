import { Link } from "react-router-dom";
import type { PmocOccurrenceAlertOut, PmocOccurrenceOut } from "../../api/pmoc";

type Props = {
  alerts?: PmocOccurrenceAlertOut[];
  occurrences?: PmocOccurrenceOut[];
  pmocId?: number;
};

export function PmocOccurrencesPanel({ alerts, occurrences, pmocId }: Props) {
  const rows = occurrences?.length
    ? occurrences.map((o) => ({
        id: o.id,
        pmocId: o.pmoc_id,
        title: o.checklist_item_descricao,
        client: o.client_name ?? "Cliente",
        machine: o.equipment_label ?? "—",
        description: o.failure_description,
        createdAt: o.created_at,
      }))
    : (alerts ?? []).map((a) => ({
        id: a.id,
        pmocId: a.pmoc_id,
        title: a.checklist_item_descricao,
        client: a.client_name,
        machine: a.equipment_label ?? "—",
        description: a.failure_description,
        createdAt: a.created_at,
      }));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 text-sm text-[#64748b]">
        Nenhuma ocorrência aberta no momento.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="text-sm font-semibold text-red-900">
            Nova ocorrência no {row.client} — {row.machine}
          </p>
          <p className="mt-1 text-sm text-[#0f172a]">
            <strong>{row.title}:</strong> {row.description}
          </p>
          <p className="mt-2 text-xs text-[#64748b]">{new Date(row.createdAt).toLocaleString("pt-BR")}</p>
          {pmocId || row.pmocId ? (
            <Link
              to={`/app/pmoc/conformidade/${pmocId ?? row.pmocId}`}
              className="mt-2 inline-block text-xs font-semibold text-[#006FEE]"
            >
              Ver painel de conformidade
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
