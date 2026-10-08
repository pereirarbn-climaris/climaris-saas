import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { listClients, type ClientOut } from "../../api/clients";
import {
  fetchPreventivePreview,
  fetchPreventiveSettings,
  listPreventiveItems,
  listPreventiveLeads,
  patchPreventiveSettings,
  registerPreventiveEntry,
  sendPreventiveReminder,
  sendPreventiveRemindersBulk,
  type PreventiveItem,
  type PreventiveLead,
  type PreventivePreview,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import { listServices, type ServiceOut } from "../../api/services";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./PreventiveMaintenancePage.module.css";

/** Janela da lista / envio em lote (dias corridos; rótulos para a UI). */
const PREVENTIVE_WINDOW_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 15, label: "15 dias" },
  { days: 30, label: "30 dias" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano" },
] as const;

function windowLabel(days: number): string {
  const row = PREVENTIVE_WINDOW_OPTIONS.find((o) => o.days === days);
  return row ? row.label : `${days} dias`;
}

function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Mensagem acionável para erros comuns da Evolution (resposta técnica fica no `title`). */
function evolutionWhatsappFailureHint(detail: string): string | null {
  const d = detail.toLowerCase();
  if (d.includes("sendmessage") || d.includes("cannot read properties")) {
    return "WhatsApp desta instância não está conectado na Evolution. No Evolution Manager, abra a instância do tenant e reconecte (QR).";
  }
  if (d.includes("does not exist") && d.includes("instance")) {
    return "Nome da instância não existe na Evolution. Confira em Integrações → WhatsApp e no Evolution Manager.";
  }
  if (d.includes("not allowed by cors")) {
    return "CORS na Evolution: alinhe a origem permitida com a URL do app (variáveis da API e da Evolution).";
  }
  return null;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PreventiveMaintenancePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [days, setDays] = useState<number>(30);
  const [items, setItems] = useState<PreventiveItem[]>([]);
  const [leads, setLeads] = useState<PreventiveLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [settings, setSettings] = useState<PreventiveSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    preventive_promo_image_url: "",
    preventive_technical_problem_hint: "",
    preventive_button_more_text: "",
    preventive_button_schedule_text: "",
    preventive_message_template: "",
    preventive_auto_remind_days_before: 0,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedHistorico, setSelectedHistorico] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreventivePreview | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientHits, setClientHits] = useState<ClientOut[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientListOpen, setClientListOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOut | null>(null);
  const [clientCreateNew, setClientCreateNew] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientWhatsapp, setNewClientWhatsapp] = useState("");
  const [modalServicesActive, setModalServicesActive] = useState<ServiceOut[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesLoadErr, setServicesLoadErr] = useState("");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [dataRealizacao, setDataRealizacao] = useState(todayIsoDate());
  const [reminderSend, setReminderSend] = useState<"none" | "now" | "scheduled">("none");
  const [reminderLocalDate, setReminderLocalDate] = useState(todayIsoDate());
  const [reminderLocalTime, setReminderLocalTime] = useState("09:00");
  const [createNotes, setCreateNotes] = useState("");

  const refreshList = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const [list, ld, st] = await Promise.all([
        listPreventiveItems(days),
        listPreventiveLeads(80),
        fetchPreventiveSettings(),
      ]);
      setItems(list);
      setLeads(ld);
      setSettings(st);
      setSettingsDraft({
        preventive_promo_image_url: st.preventive_promo_image_url ?? "",
        preventive_technical_problem_hint: st.preventive_technical_problem_hint ?? "",
        preventive_button_more_text: st.preventive_button_more_text,
        preventive_button_schedule_text: st.preventive_button_schedule_text,
        preventive_message_template: st.preventive_message_template ?? "",
        preventive_auto_remind_days_before: st.preventive_auto_remind_days_before ?? 0,
      });
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setItems([]);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (selectedHistorico == null) {
      setPreview(null);
      setPreviewErr("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await fetchPreventivePreview(selectedHistorico);
        if (!cancelled) {
          setPreview(p);
          setPreviewErr("");
        }
      } catch (e) {
        if (!cancelled) {
          setPreview(null);
          setPreviewErr(e instanceof Error ? e.message : "Prévia indisponível.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedHistorico]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setServicesLoading(true);
    setServicesLoadErr("");
    void (async () => {
      try {
        const batches: ServiceOut[] = [];
        let skip = 0;
        const page = 100;
        for (;;) {
          const part = await listServices({ limit: page, skip });
          batches.push(...part);
          if (part.length < page) break;
          skip += page;
          if (skip > 2500) break;
        }
        if (!cancelled) setModalServicesActive(batches.filter((s) => s.is_active));
      } catch (e) {
        if (!cancelled) {
          setModalServicesActive([]);
          setServicesLoadErr(e instanceof Error ? e.message : "Erro ao carregar serviços.");
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen || clientCreateNew || selectedClient != null) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientHits([]);
      setClientSearchLoading(false);
      return;
    }
    let cancelled = false;
    setClientSearchLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await listClients({ q, limit: 40 });
          if (!cancelled) setClientHits(rows);
        } catch {
          if (!cancelled) setClientHits([]);
        } finally {
          if (!cancelled) setClientSearchLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [clientQuery, clientCreateNew, selectedClient, createOpen]);

  function openCreateModal() {
    setCreateErr("");
    setClientQuery("");
    setClientHits([]);
    setClientListOpen(false);
    setSelectedClient(null);
    setClientCreateNew(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientWhatsapp("");
    setServiceId("");
    setDataRealizacao(todayIsoDate());
    setReminderSend("none");
    setReminderLocalDate(todayIsoDate());
    setReminderLocalTime("09:00");
    setCreateNotes("");
    setCreateOpen(true);
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateErr("");
    if (serviceId === "") {
      setCreateErr("Selecione um serviço com periodicidade cadastrada (6 ou 12 meses).");
      return;
    }
    if (!clientCreateNew) {
      if (selectedClient == null) {
        setCreateErr("Busque na lista, escolha um cliente ou use “Criar novo cliente”.");
        return;
      }
    } else {
      if (!newClientName.trim()) {
        setCreateErr("Informe o nome do cliente.");
        return;
      }
      if (!newClientPhone.trim() && !newClientWhatsapp.trim()) {
        setCreateErr("Informe telefone ou WhatsApp do novo cliente.");
        return;
      }
    }
    if (reminderSend === "scheduled" && !reminderLocalDate) {
      setCreateErr("Informe a data do lembrete.");
      return;
    }

    const sid = typeof serviceId === "number" ? serviceId : 0;
    setCreateSubmitting(true);
    try {
      const common = {
        service_id: sid,
        data_realizacao: dataRealizacao,
        notes: createNotes.trim() ? createNotes.trim() : null,
        reminder_send: reminderSend,
        promo_image_url: settings?.preventive_promo_image_url ?? null,
        technical_problem_hint: settings?.preventive_technical_problem_hint ?? null,
        ...(reminderSend === "scheduled"
          ? { reminder_local_date: reminderLocalDate, reminder_local_time: reminderLocalTime || "09:00" }
          : {}),
      } as const;

      const out = !clientCreateNew
        ? await registerPreventiveEntry({
            ...common,
            client_id: selectedClient!.id,
          })
        : await registerPreventiveEntry({
            ...common,
            new_client: {
              name: newClientName.trim(),
              phone: newClientPhone.trim() || null,
              whatsapp: newClientWhatsapp.trim() || null,
            },
          });

      setCreateOpen(false);
      await refreshList();
      if (out.whatsapp_job?.scheduled_for) {
        window.alert(
          `Lembrete agendado para ${new Date(out.whatsapp_job.scheduled_for).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })}.`,
        );
      } else if (reminderSend === "now") {
        window.alert("Lembrete enviado por WhatsApp.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao registrar.";
      setCreateErr(msg);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const next = await patchPreventiveSettings({
        preventive_promo_image_url: settingsDraft.preventive_promo_image_url.trim() || null,
        preventive_technical_problem_hint: settingsDraft.preventive_technical_problem_hint.trim() || null,
        preventive_button_more_text: settingsDraft.preventive_button_more_text.trim() || undefined,
        preventive_button_schedule_text: settingsDraft.preventive_button_schedule_text.trim() || undefined,
        preventive_message_template: settingsDraft.preventive_message_template.trim() || null,
        preventive_auto_remind_days_before: Math.min(
          90,
          Math.max(0, Math.floor(Number(settingsDraft.preventive_auto_remind_days_before) || 0)),
        ),
      });
      setSettings(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSend(row: PreventiveItem) {
    setSendErr("");
    setBulkNotice("");
    setSendingId(row.historico_servico_id);
    try {
      const result = await sendPreventiveReminder({
        historico_servico_id: row.historico_servico_id,
        promo_image_url: settings?.preventive_promo_image_url ?? undefined,
      });
      if (result.processing_in_background) {
        setBulkNotice(
          "Envio por WhatsApp iniciado em segundo plano (evita erro de servidor por tempo limite). Aguarde alguns instantes e clique em Atualizar para conferir.",
        );
      }
      await refreshList();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setSendingId(null);
    }
  }

  async function handleBulkSend() {
    const okWa = items.filter((r) => r.whatsapp_valido).length;
    if (
      !window.confirm(
        `Enviar campanha por WhatsApp para até ${okWa} cliente(s) nesta lista (janela: ${windowLabel(days)})?`,
      )
    ) {
      return;
    }
    setSendErr("");
    setBulkNotice("");
    setBulkSending(true);
    try {
      const result = await sendPreventiveRemindersBulk({
        window_days_if_empty: days,
        promo_image_url: settings?.preventive_promo_image_url ?? undefined,
      });
      if (result.processing_in_background) {
        setBulkNotice(
          `Envio em lote para ${result.attempted} cliente(s) foi iniciado em segundo plano (evita erro de servidor por tempo limite). Aguarde cerca de um minuto e clique em Atualizar para conferir.`,
        );
      } else if (result.failed > 0) {
        setSendErr(
          `Enviados ${result.sent} de ${result.attempted}. Falhas: ${result.failed}. Veja detalhes no primeiro erro: ${result.errors[0]?.detail ?? "—"}`,
        );
      }
      await refreshList();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Falha no envio em lote.");
    } finally {
      setBulkSending(false);
    }
  }

  const servicesWithPeriod = modalServicesActive.filter((s) => s.periodicidade_meses != null);
  const servicesWithoutPeriod = modalServicesActive.filter((s) => s.periodicidade_meses == null);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1>Gestão preventiva</h1>
        <p>
          Clientes com manutenção vencida ou a vencer conforme o histórico de serviços e a periodicidade definida em cada
          tipo de serviço (6 ou 12 meses).
        </p>
      </header>

      <div className={styles.toolbar}>
        <label>
          Janela:
          <span className={styles.filters}>
            {PREVENTIVE_WINDOW_OPTIONS.map(({ days: d, label }) => (
              <button
                key={d}
                type="button"
                className={days === d ? styles.filterActive : ""}
                onClick={() => setDays(d)}
              >
                {label}
              </button>
            ))}
          </span>
        </label>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void refreshList()}>
          Atualizar
        </button>
        {canEdit ? (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => openCreateModal()}>
            Criar registro
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className={styles.btn}
            disabled={
              bulkSending || loading || items.filter((r) => r.whatsapp_valido).length === 0
            }
            onClick={() => void handleBulkSend()}
          >
            {bulkSending ? "Enviando lote…" : "Enviar todos (WhatsApp OK)"}
          </button>
        ) : null}
      </div>

      {loadErr ? <p className={styles.err}>{loadErr}</p> : null}
      {bulkNotice ? <p className={styles.notice}>{bulkNotice}</p> : null}
      {sendErr ? <p className={styles.err}>{sendErr}</p> : null}

      <section className={styles.card}>
        <h2>Manutenções vencidas / a vencer</h2>
        {loading ? (
          <p>Carregando…</p>
        ) : items.length === 0 ? (
          <p>Nenhum cliente nesta janela. Cadastre histórico de realização e periodicidade nos serviços.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Última realização</th>
                  <th>Próximo vencimento</th>
                  <th>Dias</th>
                  <th>WhatsApp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.historico_servico_id} className={row.dias_ate_vencimento < 0 ? styles.rowWarn : undefined}>
                    <td>{row.client_name}</td>
                    <td>{row.service_name}</td>
                    <td>{fmtDate(row.data_ultima_realizacao)}</td>
                    <td>{fmtDate(row.data_proximo_vencimento)}</td>
                    <td>{row.dias_ate_vencimento}</td>
                    <td>
                      <div>{row.whatsapp_valido ? "OK" : "—"}</div>
                      {row.ultimo_whatsapp_status ? (
                        <div className={styles.waMeta}>
                          {row.ultimo_whatsapp_status === "failed" && row.ultimo_whatsapp_erro ? (
                            <span
                              className={evolutionWhatsappFailureHint(row.ultimo_whatsapp_erro) ? styles.waHint : styles.waErr}
                              title={row.ultimo_whatsapp_erro}
                            >
                              {evolutionWhatsappFailureHint(row.ultimo_whatsapp_erro) ??
                                truncateText(row.ultimo_whatsapp_erro, 110)}
                            </span>
                          ) : row.ultimo_whatsapp_status === "failed" ? (
                            <span className={styles.waErr}>Falhou (sem detalhe).</span>
                          ) : row.ultimo_whatsapp_status === "queued" ? (
                            <span className={styles.waPending}>Na fila / enviando…</span>
                          ) : row.ultimo_whatsapp_status === "sent" ||
                            row.ultimo_whatsapp_status === "delivered" ||
                            row.ultimo_whatsapp_status === "read" ? (
                            <span className={styles.waOk}>Último envio OK</span>
                          ) : (
                            <span>{row.ultimo_whatsapp_status}</span>
                          )}
                          {row.ultimo_whatsapp_em ? (
                            <span className={styles.waWhen}> · {fmtDateTime(row.ultimo_whatsapp_em)}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() =>
                          setSelectedHistorico(
                            selectedHistorico === row.historico_servico_id ? null : row.historico_servico_id,
                          )
                        }
                      >
                        Prévia
                      </button>
                      <button
                        type="button"
                        className={styles.btn}
                        style={{ marginLeft: 8 }}
                        disabled={!canEdit || !row.whatsapp_valido || sendingId === row.historico_servico_id}
                        onClick={() => void handleSend(row)}
                      >
                        {sendingId === row.historico_servico_id ? "Enviando…" : "Enviar WhatsApp"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedHistorico != null ? (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Prévia da mensagem</h3>
            {previewErr ? <p className={styles.err}>{previewErr}</p> : null}
            {preview ? (
              <>
                <div className={styles.previewBox}>{preview.message_text}</div>
                <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "0.35rem" }}>
                  Botões: “{preview.button_more_label}” · “{preview.button_schedule_label}”
                </p>
                {preview.image_url ? (
                  <img
                    className={styles.previewImg}
                    src={preview.image_url}
                    alt="Campanha"
                    onError={(ev) => {
                      ev.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    Nenhuma imagem de propaganda configurada (opcional).
                  </p>
                )}
              </>
            ) : (
              !previewErr && <p style={{ fontSize: "0.9rem" }}>Carregando prévia…</p>
            )}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2>Interessados (respostas WhatsApp)</h2>
        <p style={{ fontSize: "0.88rem", color: "#64748b", marginTop: "-0.35rem", marginBottom: "0.65rem" }}>
          Clientes que responderam aos botões da campanha ou enviaram MAIS / AGENDAR em texto (fallback sem botões).
        </p>
        {leads.length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>Nenhuma resposta registrada ainda.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cliente ID</th>
                  <th>Tipo</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.client_id}</td>
                    <td>{l.interest_kind === "more" ? "Quero saber mais" : "Agendar"}</td>
                    <td>{l.whatsapp_digits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit ? (
        <section className={styles.card}>
          <h2>Mensagem e imagem padrão</h2>
          <form onSubmit={(e) => void handleSaveSettings(e)} className={styles.settingsGrid}>
            <label>
              <span>URL da imagem de propaganda (recomendado; não bloqueia a fila como Base64 grande)</span>
              <input
                className={styles.input}
                value={settingsDraft.preventive_promo_image_url}
                onChange={(ev) => setSettingsDraft((s) => ({ ...s, preventive_promo_image_url: ev.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              <span>Problema técnico (trecho da mensagem)</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={settingsDraft.preventive_technical_problem_hint}
                onChange={(ev) =>
                  setSettingsDraft((s) => ({ ...s, preventive_technical_problem_hint: ev.target.value }))
                }
                placeholder="Ex.: perdas de eficiência energética e PMOC"
              />
            </label>
            <label>
              <span>Rótulo botão “saber mais”</span>
              <input
                className={styles.input}
                value={settingsDraft.preventive_button_more_text}
                onChange={(ev) =>
                  setSettingsDraft((s) => ({ ...s, preventive_button_more_text: ev.target.value }))
                }
              />
            </label>
            <label>
              <span>Rótulo botão agendar</span>
              <input
                className={styles.input}
                value={settingsDraft.preventive_button_schedule_text}
                onChange={(ev) =>
                  setSettingsDraft((s) => ({ ...s, preventive_button_schedule_text: ev.target.value }))
                }
              />
            </label>
            <label>
              <span>Lembrete automático antecipado (dias antes do vencimento; 0 = só no dia). Usa o fuso da empresa.</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={90}
                value={settingsDraft.preventive_auto_remind_days_before}
                onChange={(ev) =>
                  setSettingsDraft((s) => ({
                    ...s,
                    preventive_auto_remind_days_before: Number(ev.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>Template (opcional). Variáveis: {"{nome}"}, {"{meses}"}, {"{servico}"}, {"{problema}"}</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={settingsDraft.preventive_message_template}
                onChange={(ev) =>
                  setSettingsDraft((s) => ({ ...s, preventive_message_template: ev.target.value }))
                }
                placeholder="Deixe em branco para o texto padrão Climaris."
              />
            </label>
            <button type="submit" className={styles.btn} disabled={savingSettings}>
              {savingSettings ? "Salvando…" : "Salvar configurações"}
            </button>
          </form>
        </section>
      ) : null}

      {createOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setCreateOpen(false);
          }}
        >
          <div className={styles.modalPanel} role="dialog" aria-labelledby="preventive-create-title">
            <h2 id="preventive-create-title" className={styles.modalTitle}>
              Novo registro preventivo
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#64748b", marginTop: "-0.25rem", marginBottom: "0.75rem" }}>
              Cadastre a última realização e, se quiser, envie ou agende o lembrete por WhatsApp (usa o fuso da empresa).
            </p>
            <form onSubmit={(e) => void handleCreateSubmit(e)} className={styles.modalGrid}>
              <div className={`${styles.modalField} ${styles.modalFieldFull}`}>
                <span className={styles.modalLabel}>Cliente</span>
                {selectedClient ? (
                  <div className={styles.selectedRow}>
                    <span>
                      <strong>{selectedClient.name}</strong>
                      <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                        {" "}
                        · #{selectedClient.id}
                        {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.btnTertiary}
                      onClick={() => {
                        setSelectedClient(null);
                        setClientCreateNew(false);
                        setClientQuery("");
                        setClientListOpen(true);
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                ) : clientCreateNew ? (
                  <>
                    <div className={styles.selectedRow}>
                      <span style={{ fontWeight: 600 }}>Novo cliente</span>
                      <button
                        type="button"
                        className={styles.btnTertiary}
                        onClick={() => {
                          setClientCreateNew(false);
                          setClientListOpen(true);
                        }}
                      >
                        Voltar à busca
                      </button>
                    </div>
                    <input
                      className={styles.input}
                      placeholder="Nome completo"
                      value={newClientName}
                      onChange={(ev) => setNewClientName(ev.target.value)}
                      style={{ marginTop: "0.35rem" }}
                    />
                    <input
                      className={styles.input}
                      placeholder="Telefone"
                      value={newClientPhone}
                      onChange={(ev) => setNewClientPhone(ev.target.value)}
                      style={{ marginTop: "0.35rem" }}
                    />
                    <input
                      className={styles.input}
                      placeholder="WhatsApp (se diferente do telefone)"
                      value={newClientWhatsapp}
                      onChange={(ev) => setNewClientWhatsapp(ev.target.value)}
                      style={{ marginTop: "0.35rem" }}
                    />
                  </>
                ) : (
                  <div className={styles.comboWrap}>
                    <input
                      className={styles.input}
                      placeholder="Digite para buscar nome, telefone ou documento…"
                      value={clientQuery}
                      onChange={(ev) => {
                        setClientQuery(ev.target.value);
                        setClientListOpen(true);
                      }}
                      onFocus={() => setClientListOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setClientListOpen(false), 180);
                      }}
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-expanded={clientListOpen}
                    />
                    {clientListOpen ? (
                      <div className={styles.comboDropdown} role="listbox">
                        {clientQuery.trim().length < 2 ? (
                          <>
                            <div className={styles.comboHint}>Digite pelo menos 2 caracteres para buscar na lista.</div>
                            <button
                              type="button"
                              role="option"
                              className={styles.comboOptionCreate}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                setClientCreateNew(true);
                                setClientListOpen(false);
                                setClientQuery("");
                              }}
                            >
                              + Criar novo cliente
                            </button>
                          </>
                        ) : clientSearchLoading ? (
                          <div className={styles.comboHint}>Buscando…</div>
                        ) : (
                          <>
                            {clientHits.length === 0 ? (
                              <div className={styles.comboHint}>Nenhum cliente encontrado.</div>
                            ) : (
                              clientHits.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  role="option"
                                  className={styles.comboOption}
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => {
                                    setSelectedClient(c);
                                    setClientQuery("");
                                    setClientListOpen(false);
                                  }}
                                >
                                  <span className={styles.comboOptionTitle}>{c.name}</span>
                                  <span className={styles.comboOptionMeta}>
                                    #{c.id}
                                    {c.phone ? ` · ${c.phone}` : ""}
                                    {c.whatsapp ? ` · WA ${c.whatsapp}` : ""}
                                  </span>
                                </button>
                              ))
                            )}
                            <button
                              type="button"
                              role="option"
                              className={styles.comboOptionCreate}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                setClientCreateNew(true);
                                setClientListOpen(false);
                                setClientQuery("");
                              }}
                            >
                              + Criar novo cliente
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                <span className={styles.modalLabel}>Serviço</span>
                <select
                  className={styles.input}
                  value={serviceId === "" ? "" : String(serviceId)}
                  onChange={(ev) => setServiceId(ev.target.value ? Number(ev.target.value) : "")}
                  disabled={servicesLoading}
                >
                  <option value="">
                    {servicesLoading ? "Carregando serviços…" : "Selecione um serviço…"}
                  </option>
                  {servicesWithPeriod.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.periodicidade_meses} meses)
                    </option>
                  ))}
                  {servicesWithoutPeriod.length > 0 ? (
                    <optgroup label="Sem periodicidade no cadastro (configure em Serviços para usar na preventiva)">
                      {servicesWithoutPeriod.map((s) => (
                        <option key={s.id} value={`__no_period__${s.id}`} disabled>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                {servicesLoadErr ? <p className={styles.err}>{servicesLoadErr}</p> : null}
                {!servicesLoading && !servicesLoadErr && servicesWithPeriod.length === 0 && modalServicesActive.length > 0 ? (
                  <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.35rem 0 0" }}>
                    Nenhum serviço ativo tem periodicidade (6 ou 12 meses). Edite o cadastro em Serviços.
                  </p>
                ) : null}
                {!servicesLoading && !servicesLoadErr && modalServicesActive.length === 0 ? (
                  <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.35rem 0 0" }}>
                    Nenhum serviço ativo encontrado.
                  </p>
                ) : null}
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Data da última realização</span>
                <input
                  className={styles.input}
                  type="date"
                  value={dataRealizacao}
                  onChange={(ev) => setDataRealizacao(ev.target.value)}
                  required
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Lembrete WhatsApp</span>
                <select
                  className={styles.input}
                  value={reminderSend}
                  onChange={(ev) => setReminderSend(ev.target.value as "none" | "now" | "scheduled")}
                >
                  <option value="none">Só registrar (sem WhatsApp)</option>
                  <option value="now">Enviar agora</option>
                  <option value="scheduled">Agendar envio</option>
                </select>
              </label>

              {reminderSend === "scheduled" ? (
                <>
                  <label className={styles.modalField}>
                    <span className={styles.modalLabel}>Data do envio (empresa)</span>
                    <input
                      className={styles.input}
                      type="date"
                      value={reminderLocalDate}
                      onChange={(ev) => setReminderLocalDate(ev.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.modalField}>
                    <span className={styles.modalLabel}>Hora (HH:MM)</span>
                    <input
                      className={styles.input}
                      type="time"
                      value={reminderLocalTime}
                      onChange={(ev) => setReminderLocalTime(ev.target.value)}
                    />
                  </label>
                </>
              ) : null}

              <label className={styles.modalFieldFull}>
                <span className={styles.modalLabel}>Observações (opcional)</span>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  value={createNotes}
                  onChange={(ev) => setCreateNotes(ev.target.value)}
                  rows={2}
                />
              </label>

              {createErr ? <p className={styles.err}>{createErr}</p> : null}

              <div className={styles.modalActions}>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btn} disabled={createSubmitting}>
                  {createSubmitting ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
