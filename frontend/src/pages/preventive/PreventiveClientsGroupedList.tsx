import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardList, ExternalLink, MessageCircle } from "lucide-react";
import type { PreventiveClientGroup, PreventiveItem } from "../../api/preventiveMaintenance";
import { formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { buildPreventiveServiceOrderUrl } from "../../lib/preventiveServiceOrder";
import styles from "./PreventiveClientsGroupedList.module.css";

type Props = {
  clients: PreventiveClientGroup[];
  monthLabel: string;
  loading?: boolean;
  canEdit?: boolean;
  sendingClientId?: number | null;
  onSendClient?: (clientId: number) => void;
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
  const service = row.service_name?.trim();
  if (ident && service) return `${ident} — ${service}`;
  return ident || service || "Equipamento";
}

function formatDueDate(iso: string): string {
  return formatFriendlyDatePt(iso) ?? iso.split("T")[0] ?? iso;
}

function formatLastMaintenance(iso: string): string {
  return formatFriendlyDatePt(iso) ?? iso.split("T")[0] ?? iso;
}

function dueTone(dias: number): "overdue" | "warning" | "ok" {
  if (dias < 0) return "overdue";
  if (dias <= 7) return "warning";
  return "ok";
}

export function PreventiveClientsGroupedList({
  clients,
  monthLabel,
  loading = false,
  canEdit = false,
  sendingClientId = null,
  onSendClient,
}: Props) {
  const defaultOpen = useMemo(
    () => new Set(clients.slice(0, 5).map((c) => c.client_id)),
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

  if (loading) {
    return <p className={styles.empty}>Carregando vencimentos de {monthLabel}…</p>;
  }

  if (clients.length === 0) {
    return (
      <p className={styles.empty}>
        Nenhum equipamento com validade preventiva vencendo em {monthLabel}. Use{" "}
        <strong>Nova Preventiva</strong> para cadastrar lembretes de clientes que fizeram serviço antes do
        sistema, ou conclua ordens de serviço para atualizar prazos automaticamente.
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
                  {alertCount} equipamento{alertCount === 1 ? "" : "s"} vencendo em {monthLabel}
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
              {canEdit && onSendClient ? (
                <button
                  type="button"
                  className={styles.waSendBtn}
                  disabled={!group.whatsapp_valido || sendingClientId === group.client_id}
                  title={
                    group.whatsapp_valido
                      ? "Enviar lembrete preventivo por WhatsApp"
                      : "Cliente sem WhatsApp válido"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendClient(group.client_id);
                  }}
                >
                  <MessageCircle size={14} strokeWidth={2} aria-hidden />
                  {sendingClientId === group.client_id ? "Enviando…" : "Enviar WhatsApp"}
                </button>
              ) : null}
              {canEdit ? (
                <Link
                  to={buildPreventiveServiceOrderUrl(group)}
                  className={styles.osLink}
                  title="Gerar ordem de serviço preventiva para este cliente"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ClipboardList size={14} strokeWidth={2} aria-hidden />
                  Gerar OS
                </Link>
              ) : null}
              <Link
                to={`/app/clients/${group.client_id}`}
                className={styles.clientLink}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={14} strokeWidth={2} aria-hidden />
                Abrir cliente
              </Link>
            </button>

            {isOpen ? (
              <div className={styles.cardBody}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Equipamento / serviço</th>
                        <th>Intervalo</th>
                        <th>Última realização</th>
                        <th>Próxima validade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.equipments.map((row) => {
                        const tone = dueTone(row.dias_ate_vencimento);
                        return (
                          <tr key={`${row.equipment_id ?? 0}-${row.service_id}-${row.data_proximo_vencimento}`}>
                            <td>
                              <span className={styles.equipName}>{equipmentDisplayName(row)}</span>
                              {row.dias_ate_vencimento < 0 ? (
                                <span className={styles.equipTagOverdue}>Vencido</span>
                              ) : row.dias_ate_vencimento === 0 ? (
                                <span className={styles.equipTagSoon}>Vence hoje</span>
                              ) : row.dias_ate_vencimento <= 7 ? (
                                <span className={styles.equipTagSoon}>
                                  Em {row.dias_ate_vencimento} dia
                                  {row.dias_ate_vencimento === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </td>
                            <td>{formatConfiguredInterval(row)}</td>
                            <td>{formatLastMaintenance(row.data_ultima_realizacao)}</td>
                            <td
                              className={
                                tone === "overdue"
                                  ? styles.dueOverdue
                                  : tone === "warning"
                                    ? styles.dueWarning
                                    : undefined
                              }
                            >
                              {formatDueDate(row.data_proximo_vencimento)}
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
