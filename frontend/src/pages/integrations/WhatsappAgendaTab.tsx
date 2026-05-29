import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  MessageSquare,
  Play,
  Save,
  Settings2,
  Tags,
  XCircle,
} from "lucide-react";
import {
  dispatchWhatsappDueReminders,
  patchWhatsappMessageSettings,
  patchWhatsappReminderRules,
  type WhatsappAppointmentMessageSettings,
  type WhatsappReminderRules,
} from "../../api/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  AGENDA_REMINDER_VARIABLES,
  AGENDA_REPLY_VARIABLES,
} from "../../lib/agendaTemplateUtils";
import {
  computeDraftActiveOffsets,
  formatReminderOffsetsList,
  validateReminderRulesDraft,
} from "../../lib/agendaReminderRules";
import { toast } from "../../lib/toast";
import { AgendaVariableTextarea } from "./AgendaVariableTextarea";
import { AgendaWhatsAppPreview } from "./AgendaWhatsAppPreview";
import { CampaignEmptyState } from "./CampaignEmptyState";
import {
  buildScheduledAtIso,
  defaultScheduleDate,
  defaultScheduleTime,
  formatScheduleSummary,
  isoToLocalScheduleFields,
  isScheduledInFuture,
  type ScheduleMode,
} from "./campaignDashboardUtils";
import dashStyles from "./CampaignDashboard.module.css";

type PreviewMode = "reminder" | "confirm" | "reschedule" | "cancel";

type Props = {
  canConfigure: boolean;
  loading: boolean;
  automationActive: boolean;
  msgSettings: WhatsappAppointmentMessageSettings | null;
  rules: WhatsappReminderRules | null;
  onSaved: (ms: WhatsappAppointmentMessageSettings, rs: WhatsappReminderRules) => void;
};

function applyDispatchScheduleFromRules(
  dispatchAt: string | null | undefined,
): { mode: ScheduleMode; date: string; time: string } {
  if (!dispatchAt) {
    return { mode: "now", date: defaultScheduleDate(), time: defaultScheduleTime() };
  }
  const d = new Date(dispatchAt);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
    return { mode: "now", date: defaultScheduleDate(), time: defaultScheduleTime() };
  }
  const fields = isoToLocalScheduleFields(dispatchAt);
  if (!fields) {
    return { mode: "now", date: defaultScheduleDate(), time: defaultScheduleTime() };
  }
  return { mode: "later", date: fields.date, time: fields.time };
}

export function WhatsappAgendaTab({
  canConfigure,
  loading,
  automationActive,
  msgSettings,
  rules,
  onSaved,
}: Props) {
  const [tplBody, setTplBody] = useState("");
  const [kwConfirm, setKwConfirm] = useState("");
  const [kwReschedule, setKwReschedule] = useState("");
  const [replyConfirm, setReplyConfirm] = useState("");
  const [replyReschedule, setReplyReschedule] = useState("");
  const [replyCancel, setReplyCancel] = useState("");
  const [r15, setR15] = useState(false);
  const [r30, setR30] = useState(false);
  const [r1h, setR1h] = useState(false);
  const [r1d, setR1d] = useState(false);
  const [rCustomOn, setRCustomOn] = useState(false);
  const [rCustomMin, setRCustomMin] = useState<number | "">("");
  const [showMoreOffsets, setShowMoreOffsets] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduleDate, setScheduleDate] = useState(defaultScheduleDate);
  const [scheduleTime, setScheduleTime] = useState(defaultScheduleTime);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("reminder");
  const [saving, setSaving] = useState(false);
  const [testingDispatch, setTestingDispatch] = useState(false);

  const rulesDraft = useMemo(
    () => ({
      offset_15m: r15,
      offset_30m: r30,
      offset_1h: r1h,
      offset_1d: r1d,
      custom_enabled: rCustomOn,
      custom_minutes: rCustomMin,
    }),
    [r15, r30, r1h, r1d, rCustomOn, rCustomMin],
  );

  const draftActiveOffsets = useMemo(() => computeDraftActiveOffsets(rulesDraft), [rulesDraft]);
  const minDate = defaultScheduleDate();
  const scheduleSummary = useMemo(
    () => formatScheduleSummary(scheduleMode, scheduleDate, scheduleTime),
    [scheduleMode, scheduleDate, scheduleTime],
  );

  useEffect(() => {
    if (!msgSettings || !rules) return;
    setTplBody(msgSettings.template_body);
    setKwConfirm(msgSettings.confirm_keyword);
    setKwReschedule(msgSettings.reschedule_keyword);
    setReplyConfirm(msgSettings.confirm_reply);
    setReplyReschedule(msgSettings.reschedule_reply);
    setReplyCancel(msgSettings.cancel_reply);
    setR15(rules.offset_15m);
    setR30(rules.offset_30m);
    setR1h(rules.offset_1h);
    setR1d(rules.offset_1d);
    setRCustomOn(rules.custom_enabled);
    setRCustomMin(rules.custom_minutes ?? "");
    setShowMoreOffsets(rules.offset_30m || rules.custom_enabled);
    const sched = applyDispatchScheduleFromRules(rules.dispatch_scheduled_at);
    setScheduleMode(sched.mode);
    setScheduleDate(sched.date);
    setScheduleTime(sched.time);
  }, [msgSettings, rules]);

  const previewText = useMemo(() => {
    switch (previewMode) {
      case "confirm":
        return replyConfirm;
      case "reschedule":
        return replyReschedule;
      case "cancel":
        return replyCancel;
      default:
        return tplBody;
    }
  }, [previewMode, tplBody, replyConfirm, replyReschedule, replyCancel]);

  const handleSave = useCallback(async () => {
    if (!canConfigure) return;
    const validation = validateReminderRulesDraft(rulesDraft);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (scheduleMode === "later") {
      if (!scheduleDate || !scheduleTime) {
        toast.error("Informe data e hora para agendar o disparo.");
        return;
      }
      if (!isScheduledInFuture(scheduleMode, scheduleDate, scheduleTime)) {
        toast.error("A data de agendamento deve ser posterior ao momento atual.");
        return;
      }
    }
    const dispatchScheduledAt = buildScheduledAtIso(scheduleMode, scheduleDate, scheduleTime);
    setSaving(true);
    try {
      const minutes =
        rCustomOn && rCustomMin !== "" && typeof rCustomMin === "number" && rCustomMin > 0 ? rCustomMin : null;
      const [ms, rs] = await Promise.all([
        patchWhatsappMessageSettings({
          template_body: tplBody.trim(),
          confirm_keyword: kwConfirm.trim(),
          reschedule_keyword: kwReschedule.trim(),
          confirm_reply: replyConfirm.trim(),
          reschedule_reply: replyReschedule.trim(),
          cancel_reply: replyCancel.trim(),
        }),
        patchWhatsappReminderRules({
          offset_15m: r15,
          offset_30m: r30,
          offset_1h: r1h,
          offset_1d: r1d,
          custom_enabled: rCustomOn,
          custom_minutes: minutes,
          dispatch_scheduled_at: scheduleMode === "now" ? null : dispatchScheduledAt,
        }),
      ]);
      onSaved(ms, rs);
      toast.success("Configurações da agenda salvas com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar configurações da agenda.");
    } finally {
      setSaving(false);
    }
  }, [
    canConfigure,
    tplBody,
    kwConfirm,
    kwReschedule,
    replyConfirm,
    replyReschedule,
    replyCancel,
    r15,
    r30,
    r1h,
    r1d,
    rCustomOn,
    rCustomMin,
    rulesDraft,
    scheduleMode,
    scheduleDate,
    scheduleTime,
    onSaved,
  ]);

  const handleTestDispatch = useCallback(async () => {
    if (!canConfigure) return;
    if (!automationActive) {
      toast.error("Ative a automação WhatsApp em Conexão antes de testar o disparo.");
      return;
    }
    if (scheduleMode === "later" && rules?.dispatch_scheduled_at) {
      const gate = new Date(rules.dispatch_scheduled_at);
      if (!Number.isNaN(gate.getTime()) && gate.getTime() > Date.now()) {
        toast.error("O disparo automático está agendado para o futuro. Salve como “Disparar agora” ou aguarde o horário.");
        return;
      }
    }
    setTestingDispatch(true);
    try {
      const result = await dispatchWhatsappDueReminders();
      if (result.sent > 0) {
        toast.success(
          `Disparo executado: ${result.sent} lembrete(s) enviado(s) (${result.checked} agenda(s) verificada(s)).`,
        );
      } else if (result.checked > 0) {
        toast.success(
          `Ciclo executado: ${result.checked} agenda(s) na janela, nenhum lembrete no horário agora (±1 min).`,
        );
      } else {
        toast.success(
          "Ciclo executado. Nenhuma agenda na janela de lembretes — confira se há visitas futuras com WhatsApp cadastrado.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao testar disparo.");
    } finally {
      setTestingDispatch(false);
    }
  }, [canConfigure, automationActive, scheduleMode, rules?.dispatch_scheduled_at]);

  if (!msgSettings || !rules) {
    return (
      <CampaignEmptyState
        icon={<CalendarClock size={28} strokeWidth={1.75} />}
        title="Configurações da agenda indisponíveis"
        description="Não foi possível carregar lembretes e templates. Atualize a página ou verifique o módulo WhatsApp."
      />
    );
  }

  const disabled = !canConfigure || loading || saving || testingDispatch;
  const savedOffsetsLabel = formatReminderOffsetsList(rules.active_offsets_minutes);
  const draftOffsetsLabel = formatReminderOffsetsList(draftActiveOffsets);
  const draftDiffersFromSaved =
    draftActiveOffsets.join(",") !== [...rules.active_offsets_minutes].sort((a, b) => a - b).join(",");
  const savedDispatchFields = rules.dispatch_scheduled_at
    ? isoToLocalScheduleFields(rules.dispatch_scheduled_at)
    : null;
  const savedDispatchLabel = savedDispatchFields
    ? formatScheduleSummary("later", savedDispatchFields.date, savedDispatchFields.time)
    : "Disparo imediato (lembretes conforme gatilhos)";

  const primaryTriggers = [
    { checked: r15, onChange: setR15, label: "15 minutos antes", badge: dashStyles.badgeInfo },
    { checked: r1h, onChange: setR1h, label: "1 hora antes", badge: dashStyles.badgeWarning },
    { checked: r1d, onChange: setR1d, label: "24 horas antes", badge: dashStyles.badgeWarning },
  ] as const;

  return (
    <div className={dashStyles.shell}>
      <header className={dashStyles.header}>
        <div className={dashStyles.headerText}>
          <h1>Agenda</h1>
          <p>Lembretes automáticos, agendamento de disparo, template e respostas para confirmação de visitas.</p>
        </div>
      </header>

      {!automationActive ? (
        <div className={dashStyles.panelCard} style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <p className={dashStyles.hint} style={{ margin: 0, color: "#92400e" }}>
            Automação WhatsApp desativada — lembretes e respostas automáticas não serão processados até ativar em
            Conexão → Automação WhatsApp.
          </p>
        </div>
      ) : null}

      <div className={dashStyles.agendaLayout}>
        <div className={dashStyles.agendaStack}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 size={18} className="text-teal-700" aria-hidden />
                Configuração de disparo
              </CardTitle>
              <CardDescription>
                Antecedências em que o sistema envia o lembrete antes da visita (janela ±1 min, ciclo ~60 s).
                <br />
                <strong>Ativos no servidor:</strong> {savedOffsetsLabel}.
                {draftDiffersFromSaved ? (
                  <>
                    <br />
                    <strong>Rascunho:</strong> {draftOffsetsLabel}.
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={dashStyles.triggerGrid}>
                {primaryTriggers.map((row) => (
                  <label key={row.label} className={dashStyles.triggerRow}>
                    <input
                      type="checkbox"
                      checked={row.checked}
                      disabled={disabled}
                      onChange={(e) => row.onChange(e.target.checked)}
                    />
                    <span>{row.label}</span>
                    {row.checked ? (
                      <span className={`${dashStyles.badge} ${row.badge}`}>Ativo</span>
                    ) : (
                      <span className={`${dashStyles.badge} ${dashStyles.badgeNeutral}`}>Inativo</span>
                    )}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className={dashStyles.btnGhost}
                style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}
                disabled={disabled}
                onClick={() => setShowMoreOffsets((v) => !v)}
              >
                <ChevronDown
                  size={14}
                  style={{ transform: showMoreOffsets ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
                />
                Mais opções (30 min, personalizado)
              </button>
              {showMoreOffsets ? (
                <div className={dashStyles.triggerGrid} style={{ marginTop: "0.75rem" }}>
                  <label className={dashStyles.triggerRow}>
                    <input
                      type="checkbox"
                      checked={r30}
                      disabled={disabled}
                      onChange={(e) => setR30(e.target.checked)}
                    />
                    <span>30 minutos antes</span>
                    {r30 ? (
                      <span className={`${dashStyles.badge} ${dashStyles.badgeInfo}`}>Ativo</span>
                    ) : (
                      <span className={`${dashStyles.badge} ${dashStyles.badgeNeutral}`}>Inativo</span>
                    )}
                  </label>
                  <label className={dashStyles.triggerRow}>
                    <input
                      type="checkbox"
                      checked={rCustomOn}
                      disabled={disabled}
                      onChange={(e) => setRCustomOn(e.target.checked)}
                    />
                    <span>Personalizado (minutos antes)</span>
                    {rCustomOn ? (
                      <span className={`${dashStyles.badge} ${dashStyles.badgeSuccess}`}>Ativo</span>
                    ) : (
                      <span className={`${dashStyles.badge} ${dashStyles.badgeNeutral}`}>Inativo</span>
                    )}
                  </label>
                </div>
              ) : null}
              {showMoreOffsets && rCustomOn ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <label className={dashStyles.fieldLabel} htmlFor="wa-custom-min">
                    Minutos personalizados
                  </label>
                  <input
                    id="wa-custom-min"
                    type="number"
                    min={1}
                    className={dashStyles.textInput}
                    style={{ marginBottom: 0 }}
                    value={rCustomMin}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRCustomMin(v === "" ? "" : Number(v));
                    }}
                    disabled={disabled}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock size={18} className="text-teal-700" aria-hidden />
                Agendamento de disparo
              </CardTitle>
              <CardDescription>
                Controle quando o motor de lembretes automáticos passa a processar envios para este workspace.
                {rules.dispatch_scheduled_at ? (
                  <>
                    <br />
                    <strong>Programado no servidor:</strong> {savedDispatchLabel}.
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={dashStyles.scheduleCardWrap}>
                <div className={dashStyles.radioGroup}>
                  <label className={dashStyles.radioRow}>
                    <input
                      type="radio"
                      name="agenda-schedule-mode"
                      checked={scheduleMode === "now"}
                      disabled={disabled}
                      onChange={() => setScheduleMode("now")}
                    />
                    <span>
                      <strong>Disparar agora</strong>
                      <small>Lembretes seguem os gatilhos de tempo assim que houver visitas na janela</small>
                    </span>
                  </label>
                  <label className={dashStyles.radioRow}>
                    <input
                      type="radio"
                      name="agenda-schedule-mode"
                      checked={scheduleMode === "later"}
                      disabled={disabled}
                      onChange={() => setScheduleMode("later")}
                    />
                    <span>
                      <strong>Agendar data/hora</strong>
                      <small>O processamento automático só inicia após o horário escolhido</small>
                    </span>
                  </label>
                </div>

                {scheduleMode === "later" ? (
                  <div className={dashStyles.scheduleFields}>
                    <div>
                      <label className={dashStyles.fieldLabel}>
                        <CalendarClock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Data
                      </label>
                      <input
                        type="date"
                        className={dashStyles.textInput}
                        min={minDate}
                        value={scheduleDate}
                        disabled={disabled}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={dashStyles.fieldLabel}>
                        <Clock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Hora
                      </label>
                      <input
                        type="time"
                        className={dashStyles.textInput}
                        value={scheduleTime}
                        disabled={disabled}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className={dashStyles.scheduleSummaryBox}>
                  <strong>Resumo</strong>
                  <p>{scheduleSummary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare size={18} className="text-teal-700" aria-hidden />
                Editor de mensagem
              </CardTitle>
              <CardDescription>
                Corpo do lembrete enviado antes da visita. Clique nos badges para inserir variáveis no cursor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgendaVariableTextarea
                id="wa-tpl"
                label="Corpo do lembrete"
                value={tplBody}
                onChange={(v) => {
                  setTplBody(v);
                  setPreviewMode("reminder");
                }}
                variables={AGENDA_REMINDER_VARIABLES}
                disabled={disabled}
                rows={10}
                hint="Use *texto* para negrito. Variáveis no formato {nome_cliente} conforme o motor da API."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tags size={18} className="text-teal-700" aria-hidden />
                Gestão de respostas
              </CardTitle>
              <CardDescription>
                Palavras-chave do cliente e mensagens automáticas após confirmar, remarcar ou cancelar.
              </CardDescription>
            </CardHeader>
            <CardContent className={dashStyles.agendaStack} style={{ paddingTop: 0 }}>
              <div>
                <p className={dashStyles.fieldLabel} style={{ marginBottom: "0.5rem" }}>
                  Palavras-chave
                </p>
                <div className={dashStyles.keywordGrid}>
                  <div>
                    <label className={dashStyles.fieldLabel} htmlFor="wa-kw1">
                      <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      Confirmar
                    </label>
                    <input
                      id="wa-kw1"
                      className={dashStyles.textInput}
                      style={{ marginBottom: "0.5rem" }}
                      value={kwConfirm}
                      onChange={(e) => setKwConfirm(e.target.value)}
                      disabled={disabled}
                    />
                    <span className={`${dashStyles.badge} ${dashStyles.badgeSuccess}`}>{kwConfirm || "—"}</span>
                  </div>
                  <div>
                    <label className={dashStyles.fieldLabel} htmlFor="wa-kw2">
                      <CalendarClock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      Reagendar
                    </label>
                    <input
                      id="wa-kw2"
                      className={dashStyles.textInput}
                      style={{ marginBottom: "0.5rem" }}
                      value={kwReschedule}
                      onChange={(e) => setKwReschedule(e.target.value)}
                      disabled={disabled}
                    />
                    <span className={`${dashStyles.badge} ${dashStyles.badgeWarning}`}>{kwReschedule || "—"}</span>
                  </div>
                  <div>
                    <span className={dashStyles.fieldLabel}>
                      <XCircle size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      Cancelar
                    </span>
                    <p className={dashStyles.hint} style={{ marginTop: 0 }}>
                      Reconhecido automaticamente (ex.: CANCELAR).
                    </p>
                    <span className={`${dashStyles.badge} ${dashStyles.badgeDanger}`}>CANCELAR</span>
                  </div>
                </div>
              </div>

              <div>
                <p className={dashStyles.fieldLabel} style={{ marginBottom: "0.5rem" }}>
                  Mensagens automáticas
                </p>
                <AgendaVariableTextarea
                  id="wa-reply-confirm"
                  label="Após confirmar"
                  value={replyConfirm}
                  onChange={(v) => {
                    setReplyConfirm(v);
                    setPreviewMode("confirm");
                  }}
                  variables={[]}
                  disabled={disabled}
                  rows={3}
                  minHeight="4.5rem"
                />
                <AgendaVariableTextarea
                  id="wa-reply-reschedule"
                  label="Após reagendar"
                  value={replyReschedule}
                  onChange={(v) => {
                    setReplyReschedule(v);
                    setPreviewMode("reschedule");
                  }}
                  variables={AGENDA_REPLY_VARIABLES}
                  disabled={disabled}
                  rows={3}
                  minHeight="4.5rem"
                />
                <AgendaVariableTextarea
                  id="wa-reply-cancel"
                  label="Após cancelar"
                  value={replyCancel}
                  onChange={(v) => {
                    setReplyCancel(v);
                    setPreviewMode("cancel");
                  }}
                  variables={[]}
                  disabled={disabled}
                  rows={3}
                  minHeight="4.5rem"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className={dashStyles.previewSticky} aria-label="Prévia WhatsApp">
          <p className={dashStyles.fieldLabel}>Prévia em tempo real</p>
          <div className={dashStyles.previewModeTabs}>
            {(
              [
                ["reminder", "Lembrete"],
                ["confirm", "Confirmar"],
                ["reschedule", "Reagendar"],
                ["cancel", "Cancelar"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`${dashStyles.sectionNavBtn} ${previewMode === mode ? dashStyles.sectionNavBtnActive : ""}`}
                style={{ flex: "none", minWidth: "auto", padding: "0.4rem 0.55rem", fontSize: "0.72rem" }}
                onClick={() => setPreviewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 flex justify-center mt-2">
            <AgendaWhatsAppPreview message={previewText} />
          </div>
        </aside>
      </div>

      {canConfigure ? (
        <div className={dashStyles.stickyFooter}>
          <p>
            Salve gatilhos, agendamento, template e respostas de uma vez. &quot;Testar disparo&quot; executa o ciclo
            imediato (respeita agendamento salvo no servidor).
          </p>
          <div className={dashStyles.row}>
            <button
              type="button"
              className={dashStyles.btnGhost}
              disabled={disabled}
              title="Executa dispatch_due_appointment_reminders agora"
              onClick={() => void handleTestDispatch()}
            >
              <Play size={16} />
              {testingDispatch ? "Testando…" : "Testar disparo agora"}
            </button>
            <button
              type="button"
              className={dashStyles.btnPrimary}
              disabled={disabled}
              onClick={() => void handleSave()}
            >
              <Save size={16} />
              {saving ? "Salvando…" : "Salvar Configurações da Agenda"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
