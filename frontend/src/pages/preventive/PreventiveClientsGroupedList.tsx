import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { PreventiveClientGroup, PreventiveItem } from "../../api/preventiveMaintenance";
import { formatFriendlyDatePt } from "../../lib/preventiveLastService";
import styles from "./PreventiveClientsGroupedList.module.css";

type Props = {
  clients: PreventiveClientGroup[];
  windowDays: number;
  canEdit: boolean;
  sendingId: number | null;
  selectedHistoricoId: number | null;
  onSend: (row: PreventiveItem) => void;
  onTogglePreview: (row: PreventiveItem) => void;
};

function formatConfiguredInterval(row: PreventiveItem): string {
  const value = row.interval_value ?? row.periodicidade_meses ?? 0;
  const type = row.interval_type ?? "months";
  if (type === "days") {
    return `A cada ${value} ${value === 1 ? "dia" : "dias"}`;
  }
  return `A cada ${value} ${value === 1 ? "mês" : "meses"}`;
}

function equipmentDisplayName(row: PreventiveItem): string {
  const ident = row.equipment_identificacao?.trim();
  const fromService = row.service_name?.replace(/^Preventiva\s*[—-]\s*/i, "").trim();
  if (ident && fromService && ident !== fromService) {
    return `${ident} — ${fromService}`;
  }
  return ident || fromService || "Equipamento";
}

function formatDueDate(iso: string): string {
  return formatFriendlyDatePt(iso) ?? iso.split("T")[0] ?? iso;
}

function formatLastMaintenance(iso: string): string {
  return formatFriendlyDatePt(iso) ?? iso.split("T")[0] ?? iso;
}

function dueTone(dias: number): "overdue" | "warning" {
  return dias < 0 ? "overdue" : "warning";
}

export function PreventiveClientsGroupedList({
  clients,
  windowDays,
  canEdit,
  sendingId,
  selectedHistoricoId,
  onSend,
  onTogglePreview,
}: Props) {
  const defaultOpen = useMemo(
    () => new Set(clients.slice(0, 3).map((c) => c.client_id)),
    [clients],
  );
  const [openIds, setOpenIds] = useState<Set<number>>(() => defaultOpen);

  const toggleClient = (clientId: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  if (clients.length === 0) {
    return (
      <p className={styles.empty}>
        Nenhum cliente com equipamentos vencidos ou a vencer nesta janela ({windowDays} dias). Cadastre
        regras na ficha do cliente (aba Preventiva) ou histórico de serviços com periodicidade.
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {clients.map((group) => {
        const isOpen = openIds.has(group.client_id);
        const alertCount = group.equipments.length;
        const overdueCount = group.equipments.filter((e) => e.dias_ate_vencimento < 0).length;

        return (
          <article key={group.client_id} className={styles.card}>
            <button
              type="button"
              className={styles.cardHeader}
              aria-expanded={isOpen}
              onClick={() => toggleClient(group.client_id)}
            >
              <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden>
                <ChevronDown size={18} strokeWidth={2} />
              </span>
              <span className={styles.clientMain}>
                <span className={styles.clientName}>{group.client_name}</span>
                <span className={styles.clientMeta}>
                  {alertCount} equipamento{alertCount === 1 ? "" : "s"} na janela
                  {overdueCount > 0 ? ` · ${overdueCount} vencido${overdueCount === 1 ? "" : "s"}` : ""}
                </span>
              </span>
              <span className={styles.badges}>
                <span
                  className={`${styles.badge} ${overdueCount > 0 ? styles.badgeDanger : styles.badgeWarn}`}
                >
                  {alertCount}
                </span>
              </span>
              <Link
                to={`/app/clients/${group.client_id}?tab=preventiva`}
                className={styles.clientLink}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={14} strokeWidth={2} aria-hidden />
                Abrir ficha
              </Link>
            </button>

            {isOpen ? (
              <div className={styles.cardBody}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Equipamento</th>
                        <th>Intervalo</th>
                        <th>Última manutenção</th>
                        <th>Próximo vencimento</th>
                        <th className={styles.thActions}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.equipments.map((row) => {
                        const tone = dueTone(row.dias_ate_vencimento);
                        const canSendWa =
                          row.whatsapp_valido && row.historico_servico_id > 0 && group.whatsapp_valido;

                        return (
                          <tr key={`${row.rule_id ?? 0}-${row.equipment_id ?? row.historico_servico_id}`}>
                            <td>
                              <span className={styles.equipName}>{equipmentDisplayName(row)}</span>
                              {row.dias_ate_vencimento < 0 ? (
                                <span className={styles.equipTagOverdue}>Vencido</span>
                              ) : (
                                <span className={styles.equipTagSoon}>
                                  Em {row.dias_ate_vencimento} dia
                                  {row.dias_ate_vencimento === 1 ? "" : "s"}
                                </span>
                              )}
                            </td>
                            <td>{formatConfiguredInterval(row)}</td>
                            <td>{formatLastMaintenance(row.data_ultima_realizacao)}</td>
                            <td>
                              <span className={tone === "overdue" ? styles.dueOverdue : styles.dueWarning}>
                                {formatDueDate(row.data_proximo_vencimento)}
                              </span>
                            </td>
                            <td className={styles.actions}>
                              {row.historico_servico_id > 0 ? (
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => onTogglePreview(row)}
                                >
                                  {selectedHistoricoId === row.historico_servico_id
                                    ? "Fechar prévia"
                                    : "Prévia"}
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className={styles.btnSend}
                                  disabled={!canSendWa || sendingId === row.historico_servico_id}
                                  title={
                                    row.historico_servico_id <= 0
                                      ? "Envio por WhatsApp disponível para registros com histórico de serviço."
                                      : !row.whatsapp_valido
                                        ? "WhatsApp do cliente inválido ou ausente."
                                        : undefined
                                  }
                                  onClick={() => void onSend(row)}
                                >
                                  {sendingId === row.historico_servico_id
                                    ? "Enviando…"
                                    : "WhatsApp"}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
