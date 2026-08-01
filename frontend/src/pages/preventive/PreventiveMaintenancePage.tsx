/**
 * PreventiveMaintenancePage — vencimentos por equipamento, filtrados por mês
 * e agrupados por cliente + filial (um card e um WhatsApp por unidade).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  currentPreventiveMonthValue,
  deleteManualPreventiveReminder,
  fetchPreventiveSettings,
  listPreventiveItemsGrouped,
  parsePreventiveMonthValue,
  patchPreventiveSettings,
  sendPreventiveReminder,
  type PreventiveClientGroup,
  type PreventiveItem,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import type { DashboardOutletContext } from "../dashboardContext";
import { PreventiveCreateFormView } from "../../components/preventive";
import { DeleteConfirmModal } from "../../components/ui/delete-confirm-modal";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/input";
import { toast } from "../../lib/toast";
import { humanizeWhatsappSendError } from "../../lib/whatsappErrorMessages";
import { groupHasMessageSent } from "../../lib/preventiveCampaignStatus";
import {
  preventiveModelOptions,
  resolveTemplateKindForClientGroup,
  type PreventiveTemplateKind,
} from "../../lib/preventiveMessageTemplate";
import tableStyles from "../listTableCommon.module.css";
import { PreventiveClientsGroupedList } from "./PreventiveClientsGroupedList";
import styles from "./PreventiveMaintenancePage.module.css";

function formatMonthLabel(monthValue: string): string {
  const parsed = parsePreventiveMonthValue(monthValue);
  if (!parsed) return monthValue;
  const date = new Date(parsed.year, parsed.month - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonthValue(monthValue: string, delta: number): string {
  const parsed = parsePreventiveMonthValue(monthValue);
  if (!parsed) return currentPreventiveMonthValue();
  const date = new Date(parsed.year, parsed.month - 1 + delta, 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function PreventiveMaintenancePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [monthValue, setMonthValue] = useState(currentPreventiveMonthValue);
  const [clients, setClients] = useState<PreventiveClientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [settings, setSettings] = useState<PreventiveSettings | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState<number | null>(null);
  const [sendingGroupKey, setSendingGroupKey] = useState<string | null>(null);
  const [deleteReminderTarget, setDeleteReminderTarget] = useState<PreventiveItem | null>(null);
  const [deletingReminder, setDeletingReminder] = useState(false);
  const [savingAutoSetting, setSavingAutoSetting] = useState(false);
  const [sendConfirmClient, setSendConfirmClient] = useState<{
    clientId: number;
    clientSiteId: number | null;
    groupKey: string;
    clientName: string;
    siteLabel: string | null;
    alreadySent: boolean;
    templateKind: PreventiveTemplateKind;
  } | null>(null);

  const modelOptions = useMemo(() => preventiveModelOptions(settings), [settings]);

  const monthLabel = useMemo(() => formatMonthLabel(monthValue), [monthValue]);
  const parsedMonth = useMemo(() => parsePreventiveMonthValue(monthValue), [monthValue]);

  const autoWhatsappEnabled = settings?.preventive_auto_whatsapp_enabled === true;
  const autoWhatsappDays = settings?.preventive_auto_remind_days_before ?? 0;
  const autoWhatsappMode =
    settings?.preventive_auto_whatsapp_mode === "month_first_business_day"
      ? "month_first_business_day"
      : "days_before";

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const refreshList = useCallback(async () => {
    const parsed = parsePreventiveMonthValue(monthValue);
    if (!parsed) {
      setLoadErr("Selecione um mês válido.");
      setClients([]);
      return;
    }

    setLoading(true);
    setLoadErr("");
    try {
      const [grouped, st] = await Promise.all([
        listPreventiveItemsGrouped(parsed),
        fetchPreventiveSettings(),
      ]);
      setClients(grouped.clients);
      setSettings(st);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [monthValue]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const filteredClients = useMemo(() => {
    if (!searchQ) return clients;
    const q = searchQ.toLowerCase();
    return clients
      .map((group) => {
        const siteMatch =
          (group.client_site_name?.toLowerCase().includes(q) ?? false) ||
          (group.client_site_label?.toLowerCase().includes(q) ?? false);
        const clientMatch = group.client_name.toLowerCase().includes(q) || siteMatch;
        const equipments = clientMatch
          ? group.equipments
          : group.equipments.filter((row) => {
              const ident = row.equipment_identificacao?.toLowerCase() ?? "";
              const service = row.service_name.toLowerCase();
              return ident.includes(q) || service.includes(q);
            });
        if (!clientMatch && equipments.length === 0) return null;
        return { ...group, equipments };
      })
      .filter((group): group is PreventiveClientGroup => group != null);
  }, [clients, searchQ]);

  const metrics = useMemo(() => {
    let equipmentCount = 0;
    let overdue = 0;
    for (const group of filteredClients) {
      equipmentCount += group.equipments.length;
      overdue += group.equipments.filter((row) => row.dias_ate_vencimento < 0).length;
    }
    return {
      clients: filteredClients.length,
      equipmentCount,
      overdue,
    };
  }, [filteredClients]);

  const handleToggleAutoWhatsapp = useCallback(async () => {
    if (!canEdit) return;
    setSavingAutoSetting(true);
    try {
      const enabling = !autoWhatsappEnabled;
      const updated = await patchPreventiveSettings({
        preventive_auto_whatsapp_enabled: enabling,
        ...(enabling &&
        autoWhatsappMode === "days_before" &&
        autoWhatsappDays <= 0
          ? { preventive_auto_remind_days_before: 7 }
          : {}),
      });
      setSettings(updated);
      const mode = updated.preventive_auto_whatsapp_mode ?? "days_before";
      const days = updated.preventive_auto_remind_days_before;
      toast.success(
        enabling
          ? mode === "month_first_business_day"
            ? "Envio automático ativado (primeiro dia útil do mês)."
            : days > 0
              ? `Envio automático ativado (${days} dias antes do vencimento).`
              : "Envio automático ativado (no dia do vencimento)."
          : "Envio automático desativado.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setSavingAutoSetting(false);
    }
  }, [canEdit, autoWhatsappEnabled, autoWhatsappDays, autoWhatsappMode]);

  const handleAutoModeChange = useCallback(
    async (mode: "days_before" | "month_first_business_day") => {
      if (!canEdit || !autoWhatsappEnabled) return;
      setSavingAutoSetting(true);
      try {
        const updated = await patchPreventiveSettings({
          preventive_auto_whatsapp_mode: mode,
          ...(mode === "days_before" && autoWhatsappDays <= 0
            ? { preventive_auto_remind_days_before: 7 }
            : {}),
        });
        setSettings(updated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
      } finally {
        setSavingAutoSetting(false);
      }
    },
    [canEdit, autoWhatsappEnabled, autoWhatsappDays],
  );

  const handleAutoDaysChange = useCallback(
    async (days: number) => {
      if (!canEdit || !autoWhatsappEnabled) return;
      const safeDays = Math.min(90, Math.max(0, Math.floor(days) || 0));
      setSavingAutoSetting(true);
      try {
        const updated = await patchPreventiveSettings({
          preventive_auto_remind_days_before: safeDays,
          preventive_auto_whatsapp_mode: "days_before",
        });
        setSettings(updated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
      } finally {
        setSavingAutoSetting(false);
      }
    },
    [canEdit, autoWhatsappEnabled],
  );

  const executeSendClientReminder = useCallback(
    async (
      clientId: number,
      clientSiteId: number | null,
      groupKey: string,
      templateKind: PreventiveTemplateKind,
    ) => {
      if (!canEdit || !parsedMonth) return;
      setSendingGroupKey(groupKey);
      try {
        const result = await sendPreventiveReminder({
          client_id: clientId,
          client_site_id: clientSiteId ?? undefined,
          year: parsedMonth.year,
          month: parsedMonth.month,
          promo_image_url: settings?.preventive_promo_image_url ?? null,
          technical_problem_hint: settings?.preventive_technical_problem_hint ?? null,
          message_template_kind: templateKind,
        });

        if (result.processing_in_background) {
          const maxAttempts = 15;
          let outcome: "sent" | "failed" | "timeout" = "timeout";
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (attempt > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 2000));
            }
            const grouped = await listPreventiveItemsGrouped(parsedMonth);
            setClients(grouped.clients);
            const group = grouped.clients.find(
              (c) =>
                c.client_id === clientId &&
                (c.client_site_id ?? null) === (clientSiteId ?? null),
            );
            const rows = group?.equipments ?? [];
            const sent = rows.some((row) => row.status_mensagem_enviada);
            if (sent) {
              outcome = "sent";
              toast.success("Lembrete enviado por WhatsApp.");
              break;
            }
            const failedRow = rows.find(
              (row) => row.ultimo_whatsapp_status === "failed" && row.ultimo_whatsapp_erro,
            );
            if (failedRow?.ultimo_whatsapp_erro) {
              outcome = "failed";
              toast.error(humanizeWhatsappSendError(failedRow.ultimo_whatsapp_erro));
              break;
            }
          }
          if (outcome === "timeout") {
            toast.success(
              "Envio ainda em processamento. Atualize a lista em alguns segundos ou verifique as notificações.",
            );
          }
        } else {
          await refreshList();
          toast.success("Lembrete enviado por WhatsApp.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível enviar o lembrete.");
      } finally {
        setSendingGroupKey(null);
      }
    },
    [canEdit, parsedMonth, settings, refreshList],
  );

  const handleRequestSendClientReminder = useCallback(
    (group: PreventiveClientGroup) => {
      if (!canEdit || !parsedMonth) return;
      const siteLabel = group.client_site_label?.trim() || null;
      const displayName = siteLabel ? `${group.client_name} (${siteLabel})` : group.client_name;
      setSendConfirmClient({
        clientId: group.client_id,
        clientSiteId: group.client_site_id ?? null,
        groupKey: `${group.client_id}:${group.client_site_id ?? "main"}`,
        clientName: displayName,
        siteLabel,
        alreadySent: groupHasMessageSent(group.equipments),
        templateKind: resolveTemplateKindForClientGroup(group, settings),
      });
    },
    [canEdit, parsedMonth, settings],
  );

  const handleConfirmSendClientReminder = useCallback(async () => {
    if (!sendConfirmClient) return;
    const { clientId, clientSiteId, groupKey, templateKind } = sendConfirmClient;
    await executeSendClientReminder(clientId, clientSiteId, groupKey, templateKind);
    setSendConfirmClient(null);
  }, [sendConfirmClient, executeSendClientReminder]);

  const handleRequestDeleteManualReminder = useCallback(
    (row: PreventiveItem) => {
      if (!canEdit || !row.preventive_schedule_id) return;
      setDeleteReminderTarget(row);
    },
    [canEdit],
  );

  const handleConfirmDeleteManualReminder = useCallback(async () => {
    if (!deleteReminderTarget?.preventive_schedule_id) return;
    setDeletingReminder(true);
    try {
      await deleteManualPreventiveReminder(deleteReminderTarget.preventive_schedule_id);
      setDeleteReminderTarget(null);
      await refreshList();
      toast.success("Lembrete excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o lembrete.");
    } finally {
      setDeletingReminder(false);
    }
  }, [deleteReminderTarget, refreshList]);

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Gestão Preventiva</h1>
          <p className={styles.pageSubtitle}>
            Vencimentos por equipamento com base na gestão preventiva da ficha de cada aparelho. Use{" "}
            <strong>Nova Preventiva</strong> para lembretes de clientes pré-sistema.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className={tableStyles.listToolbarBtnPrimary}
            onClick={() => {
              setEditScheduleId(null);
              setCreateOpen(true);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: "1.125rem", height: "1.125rem" }}
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Nova Preventiva
          </button>
        ) : null}
      </header>

      {canEdit ? (
        <div className={styles.whatsappBar}>
          <label className={styles.autoToggle}>
            <input
              type="checkbox"
              checked={autoWhatsappEnabled}
              disabled={savingAutoSetting || loading}
              onChange={() => void handleToggleAutoWhatsapp()}
            />
            <span>
              <strong>Envio automático WhatsApp</strong>
              <span className={styles.autoToggleHint}>
                {autoWhatsappEnabled
                  ? autoWhatsappMode === "month_first_business_day"
                    ? "No primeiro dia útil do mês, envia um lembrete por cliente/filial com todos os vencimentos daquele mês (no horário do expediente)."
                    : autoWhatsappDays > 0
                      ? `Um lembrete automático por cliente/filial, ${autoWhatsappDays} dias antes do vencimento (dias úteis, no horário do expediente).`
                      : "Um lembrete automático por cliente/filial, no dia do vencimento (dias úteis, no horário do expediente)."
                  : "Desligado — use o botão em cada cliente para enviar manualmente."}
              </span>
            </span>
          </label>
          {autoWhatsappEnabled ? (
            <div className={styles.autoControls}>
              <div className={styles.autoModeField}>
                <label htmlFor="prev-auto-mode">Quando enviar</label>
                <select
                  id="prev-auto-mode"
                  value={autoWhatsappMode}
                  disabled={savingAutoSetting}
                  onChange={(e) =>
                    void handleAutoModeChange(
                      e.target.value === "month_first_business_day"
                        ? "month_first_business_day"
                        : "days_before",
                    )
                  }
                >
                  <option value="days_before">X dias antes do vencimento</option>
                  <option value="month_first_business_day">Primeiro dia útil do mês</option>
                </select>
              </div>
              {autoWhatsappMode === "days_before" ? (
                <div className={styles.autoDaysField}>
                  <label htmlFor="prev-auto-days" title="0 = no dia do vencimento">
                    Dias antes
                  </label>
                  <input
                    id="prev-auto-days"
                    type="number"
                    min={0}
                    max={90}
                    value={autoWhatsappDays}
                    disabled={savingAutoSetting}
                    onChange={(e) => void handleAutoDaysChange(Number(e.target.value))}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.heroStats}>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Clientes no mês</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.clients}</p>
            </div>
          </div>
          <p className={styles.statHint}>com equipamentos vencendo</p>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Equipamentos</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.equipmentCount}</p>
            </div>
          </div>
          <p className={styles.statHint}>validade em {monthLabel}</p>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Vencidos</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.overdue}</p>
            </div>
          </div>
          <p className={styles.statHint}>antes do fim do mês selecionado</p>
        </article>
      </div>

      <div className={tableStyles.listToolbar}>
        <div className={tableStyles.listToolbarSearchCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="prev-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="prev-search"
              className={tableStyles.listToolbarSearchInput}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar cliente ou equipamento"
              autoComplete="off"
            />
          </div>
        </div>

        <div className={tableStyles.listToolbarActions}>
          <div className={tableStyles.listToolbarFilterBlock}>
            <label className={tableStyles.listToolbarLabel} htmlFor="prev-month">
              Mês
            </label>
            <div className={styles.monthControls}>
              <button
                type="button"
                className={tableStyles.listToolbarBtnGhost}
                aria-label="Mês anterior"
                onClick={() => setMonthValue((prev) => shiftMonthValue(prev, -1))}
              >
                ‹
              </button>
              <input
                id="prev-month"
                type="month"
                className={tableStyles.listToolbarSelect}
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
              />
              <button
                type="button"
                className={tableStyles.listToolbarBtnGhost}
                aria-label="Próximo mês"
                onClick={() => setMonthValue((prev) => shiftMonthValue(prev, 1))}
              >
                ›
              </button>
            </div>
          </div>

          <button
            type="button"
            className={tableStyles.listToolbarBtnGhost}
            onClick={() => setMonthValue(currentPreventiveMonthValue())}
          >
            Mês atual
          </button>

          <button
            type="button"
            className={tableStyles.listToolbarBtnGhost}
            onClick={() => void refreshList()}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {loadErr ? (
        <p className={styles.msgErr} role="alert">
          {loadErr}
        </p>
      ) : null}

      <PreventiveClientsGroupedList
        clients={filteredClients}
        monthLabel={monthLabel}
        loading={loading}
        canEdit={canEdit}
        sendingGroupKey={sendingGroupKey}
        onSendClient={handleRequestSendClientReminder}
        onEditManualReminder={(row) => {
          if (!row.preventive_schedule_id) return;
          setEditScheduleId(row.preventive_schedule_id);
          setCreateOpen(true);
        }}
        onDeleteManualReminder={handleRequestDeleteManualReminder}
      />

      <AlertDialog
        open={sendConfirmClient !== null}
        onOpenChange={(open) => {
          if (!open && sendingGroupKey === null) setSendConfirmClient(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendConfirmClient?.alreadySent ? "Enviar novamente?" : "Enviar lembrete WhatsApp"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sendConfirmClient?.alreadySent
                ? `Já foi enviado um lembrete para ${sendConfirmClient.clientName}. Confirme o modelo e envie novamente se desejar.`
                : `Confirme o modelo da mensagem para ${sendConfirmClient?.clientName ?? "o cliente"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {sendConfirmClient ? (
            <AlertDialogBody>
              <label className={styles.sendDialogLabel} htmlFor="prev-send-template-kind">
                Modelo da mensagem
              </label>
              <Select
                id="prev-send-template-kind"
                value={sendConfirmClient.templateKind}
                onChange={(e) =>
                  setSendConfirmClient((current) =>
                    current
                      ? {
                          ...current,
                          templateKind: e.target.value,
                        }
                      : current,
                  )
                }
              >
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </AlertDialogBody>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={sendingGroupKey === sendConfirmClient?.groupKey}
              onClick={() => setSendConfirmClient(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={sendingGroupKey === sendConfirmClient?.groupKey}
              onClick={() => void handleConfirmSendClientReminder()}
            >
              {sendingGroupKey === sendConfirmClient?.groupKey ? "Enviando…" : "Enviar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmModal
        open={deleteReminderTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingReminder) setDeleteReminderTarget(null);
        }}
        title="Excluir lembrete"
        description={
          deleteReminderTarget
            ? `Excluir o lembrete de "${deleteReminderTarget.equipment_identificacao || deleteReminderTarget.service_name || "este lembrete"}"? O registro sai da listagem mensal. Lembretes de WhatsApp ainda na fila serão cancelados.`
            : ""
        }
        busy={deletingReminder}
        onConfirm={() => void handleConfirmDeleteManualReminder()}
      />

      <PreventiveCreateFormView
        open={createOpen}
        editScheduleId={editScheduleId}
        onClose={() => {
          setCreateOpen(false);
          setEditScheduleId(null);
        }}
        preventiveSettings={settings}
        onUpdated={async () => {
          setCreateOpen(false);
          setEditScheduleId(null);
          await refreshList();
          toast.success("Lembrete atualizado.");
        }}
        onCreated={async (out) => {
          setCreateOpen(false);
          setEditScheduleId(null);
          await refreshList();
          if (out.whatsapp_job?.scheduled_for) {
            toast.success(
              `Lembrete agendado para ${new Date(out.whatsapp_job.scheduled_for).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}.`,
            );
          } else {
            toast.success("Lembrete salvo");
          }
        }}
      />
    </div>
  );
}
