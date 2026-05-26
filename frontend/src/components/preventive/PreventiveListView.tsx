import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { PreventiveItem } from "../../api/preventiveMaintenance";
import tableStyles from "../../pages/listTableCommon.module.css";
import { formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { preventiveStatusMeta } from "../../lib/preventiveStatus";
import { Badge } from "../ui/badge";
import styles from "./PreventiveListView.module.css";

type Props = {
  items: PreventiveItem[];
  windowDays: number;
  canEdit: boolean;
  sendingId: number | null;
  selectedHistoricoId: number | null;
  onSend: (row: PreventiveItem) => void;
  onTogglePreview: (row: PreventiveItem) => void;
};

export function equipmentDisplayName(row: PreventiveItem): string {
  const ident = row.equipment_identificacao?.trim();
  const fromService = row.service_name?.replace(/^Preventiva\s*[—-]\s*/i, "").trim();
  if (ident && fromService && ident !== fromService) {
    return `${ident} — ${fromService}`;
  }
  return ident || fromService || "Equipamento";
}

function equipmentLocationHint(row: PreventiveItem): string | null {
  const service = row.service_name?.trim();
  if (!service) return null;
  return service.replace(/^Preventiva\s*[—-]\s*/i, "").trim() || service;
}

function formatMaintenanceDate(iso: string): string {
  return formatFriendlyDatePt(iso) ?? iso.split("T")[0] ?? iso;
}

function rowKey(row: PreventiveItem): string {
  return `${row.client_id}-${row.rule_id ?? 0}-${row.equipment_id ?? row.historico_servico_id}`;
}

type RowActionsProps = {
  row: PreventiveItem;
  canEdit: boolean;
  sendingId: number | null;
  selectedHistoricoId: number | null;
  onSend: (row: PreventiveItem) => void;
  onTogglePreview: (row: PreventiveItem) => void;
};

function RowActionsMenu({
  row,
  canEdit,
  sendingId,
  selectedHistoricoId,
  onSend,
  onTogglePreview,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const canSendWa = row.whatsapp_valido && row.historico_servico_id > 0;
  const historyHref =
    row.equipment_id != null && row.equipment_id > 0
      ? `/app/clients/${row.client_id}?tab=historico`
      : `/app/clients/${row.client_id}?tab=preventiva`;

  return (
    <div className={styles.actionsWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.menuTrigger}
        aria-label="Ações da preventiva"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className={styles.menuPanel} role="menu">
          <Link
            to="/app/service-orders/new"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Gerar OS de Manutenção
          </Link>
          <Link to={historyHref} className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            Visualizar Histórico
          </Link>
          {row.historico_servico_id > 0 ? (
            <>
              <div className={styles.menuDivider} role="separator" />
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  onTogglePreview(row);
                  setOpen(false);
                }}
              >
                {selectedHistoricoId === row.historico_servico_id ? "Fechar prévia WhatsApp" : "Prévia WhatsApp"}
              </button>
            </>
          ) : null}
          {canEdit && row.historico_servico_id > 0 ? (
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              disabled={!canSendWa || sendingId === row.historico_servico_id}
              title={!row.whatsapp_valido ? "WhatsApp do cliente inválido ou ausente." : undefined}
              onClick={() => {
                onSend(row);
                setOpen(false);
              }}
            >
              {sendingId === row.historico_servico_id ? "Enviando WhatsApp…" : "Enviar WhatsApp"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PreventiveListView({
  items,
  windowDays,
  canEdit,
  sendingId,
  selectedHistoricoId,
  onSend,
  onTogglePreview,
}: Props) {
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.dias_ate_vencimento - b.dias_ate_vencimento),
    [items],
  );

  if (sortedItems.length === 0) {
    return (
      <p className={styles.empty}>
        Nenhum registro nesta janela ({windowDays} dias). Ajuste os filtros ou cadastre regras na ficha do cliente
        (aba Preventiva).
      </p>
    );
  }

  return (
    <>
      <div className={styles.tableContainer}>
        <div className={tableStyles.tableWrap}>
          <table className={`${tableStyles.table} ${styles.table}`}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Equipamento / Localização</th>
                <th>Última Manutenção</th>
                <th>Próxima Manutenção</th>
                <th>Status</th>
                <th className={styles.actionsCell}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((row) => {
                const status = preventiveStatusMeta(row.dias_ate_vencimento, row.data_proximo_vencimento);
                const locationHint = equipmentLocationHint(row);

                return (
                  <tr key={rowKey(row)}>
                    <td>
                      <span className={styles.clientName}>{row.client_name}</span>
                      <span className={styles.clientMeta}>#{row.client_id}</span>
                    </td>
                    <td>
                      <span className={styles.equipmentName}>{equipmentDisplayName(row)}</span>
                      {locationHint ? <span className={styles.equipmentMeta}>{locationHint}</span> : null}
                    </td>
                    <td>{formatMaintenanceDate(row.data_ultima_realizacao)}</td>
                    <td>
                      <span
                        className={
                          status.kind === "overdue"
                            ? styles.dateOverdue
                            : status.kind === "due_this_month"
                              ? styles.dateSoon
                              : undefined
                        }
                      >
                        {formatMaintenanceDate(row.data_proximo_vencimento)}
                      </span>
                    </td>
                    <td>
                      <Badge variant={status.badgeVariant}>{status.label}</Badge>
                    </td>
                    <td className={styles.actionsCell}>
                      <RowActionsMenu
                        row={row}
                        canEdit={canEdit}
                        sendingId={sendingId}
                        selectedHistoricoId={selectedHistoricoId}
                        onSend={onSend}
                        onTogglePreview={onTogglePreview}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className={styles.listFoot}>
        {sortedItems.length} registro{sortedItems.length === 1 ? "" : "s"} na janela de {windowDays} dias
      </p>
    </>
  );
}
