/**
 * PreventiveMaintenancePage — vencimentos por equipamento, filtrados por mês e agrupados por cliente.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  currentPreventiveMonthValue,
  fetchPreventiveSettings,
  listPreventiveItemsGrouped,
  parsePreventiveMonthValue,
  patchPreventiveSettings,
  sendPreventiveReminder,
  type PreventiveClientGroup,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import type { DashboardOutletContext } from "../dashboardContext";
import { PreventiveCreateFormView } from "../../components/preventive";
import { ToastHost } from "../../components/ToastHost";
import { toast } from "../../lib/toast";
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
  const [sendingClientId, setSendingClientId] = useState<number | null>(null);
  const [savingAutoSetting, setSavingAutoSetting] = useState(false);

  const monthLabel = useMemo(() => formatMonthLabel(monthValue), [monthValue]);
  const parsedMonth = useMemo(() => parsePreventiveMonthValue(monthValue), [monthValue]);

  const autoWhatsappEnabled = settings?.preventive_auto_whatsapp_enabled === true;
  const autoWhatsappDays = settings?.preventive_auto_remind_days_before ?? 0;

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
        const clientMatch = group.client_name.toLowerCase().includes(q);
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
        ...(enabling && autoWhatsappDays <= 0 ? { preventive_auto_remind_days_before: 7 } : {}),
      });
      setSettings(updated);
      toast.success(
        enabling
          ? `Envio automático ativado${updated.preventive_auto_remind_days_before > 0 ? ` (${updated.preventive_auto_remind_days_before} dias antes)` : ""}.`
          : "Envio automático desativado.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setSavingAutoSetting(false);
    }
  }, [canEdit, autoWhatsappEnabled, autoWhatsappDays]);

  const handleAutoDaysChange = useCallback(
    async (days: number) => {
      if (!canEdit || !autoWhatsappEnabled) return;
      const safeDays = Math.min(90, Math.max(0, Math.floor(days) || 0));
      setSavingAutoSetting(true);
      try {
        const updated = await patchPreventiveSettings({
          preventive_auto_remind_days_before: safeDays,
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

  const handleSendClientReminder = useCallback(
    async (clientId: number) => {
      if (!canEdit || !parsedMonth) return;
      setSendingClientId(clientId);
      try {
        await sendPreventiveReminder({
          client_id: clientId,
          year: parsedMonth.year,
          month: parsedMonth.month,
          promo_image_url: settings?.preventive_promo_image_url ?? null,
          technical_problem_hint: settings?.preventive_technical_problem_hint ?? null,
        });
        toast.success("Lembrete enviado por WhatsApp (processando em segundo plano).");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível enviar o lembrete.");
      } finally {
        setSendingClientId(null);
      }
    },
    [canEdit, parsedMonth, settings],
  );

  return (
    <div className={styles.wrap}>
      <ToastHost />
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
            onClick={() => setCreateOpen(true)}
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

      <p className={styles.pageSubtitle} style={{ marginBottom: "1rem" }}>
        Campanhas WhatsApp e template:{" "}
        <Link to="/app/integrations/whatsapp">Integrações → WhatsApp → Gestão preventiva</Link>
      </p>

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
                  ? "Lembretes no dia do vencimento e dias antes, para todos os clientes elegíveis."
                  : "Desligado — use o botão em cada cliente para enviar manualmente."}
              </span>
            </span>
          </label>
          {autoWhatsappEnabled ? (
            <div className={styles.autoDaysField}>
              <label htmlFor="prev-auto-days">Dias antes</label>
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
        sendingClientId={sendingClientId}
        onSendClient={(clientId) => void handleSendClientReminder(clientId)}
      />

      <PreventiveCreateFormView
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        preventiveSettings={settings}
        onCreated={async (out) => {
          setCreateOpen(false);
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
