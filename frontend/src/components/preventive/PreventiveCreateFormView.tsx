import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { listClientHvacEquipments, listClientsAll, type ClientOut, type EquipmentOut } from "../../api/clients";
import {
  fetchManualPreventiveReminder,
  registerPreventiveEntry,
  updateManualPreventiveReminder,
  type PreventiveRegisterEntryOut,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import { listServices, type ServiceOut } from "../../api/services";
import { formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { Button } from "../ui/button";
import { CatalogCombobox } from "../ui/catalog-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ClientCombobox } from "../ui/client-combobox";
import comboboxStyles from "../ui/catalog-combobox.module.css";
import { clientOutToComboboxItem } from "../../lib/clientComboboxAdapter";
import { Input, Select } from "../ui/input";
import { toast } from "../../lib/toast";
import {
  preventiveModelOptions,
  tenantDefaultTemplateKind,
  type PreventiveTemplateKind,
} from "../../lib/preventiveMessageTemplate";
import styles from "./PreventiveCreateFormView.module.css";

type ReminderSend = "none" | "now" | "scheduled";
type EntryMode = "temporary" | "existing";

type FormSnapshot = {
  entryMode: EntryMode;
  useExistingClient: boolean;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientWhatsapp: string;
  equipmentId: string;
  equipmentLabel: string;
  serviceId: string;
  dataRealizacao: string;
  reminderSend: ReminderSend;
  reminderLocalDate: string;
  reminderLocalTime: string;
  notes: string;
  messageTemplateKind: PreventiveTemplateKind;
};

export type PreventiveCreateFormViewProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: PreventiveRegisterEntryOut) => void | Promise<void>;
  preventiveSettings: PreventiveSettings | null;
  /** Quando informado, abre o formulário em modo edição de lembrete manual. */
  editScheduleId?: number | null;
  onUpdated?: () => void | Promise<void>;
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptySnapshot(): FormSnapshot {
  const today = todayIsoDate();
  return {
    entryMode: "temporary",
    useExistingClient: false,
    clientId: "",
    clientName: "",
    clientPhone: "",
    clientWhatsapp: "",
    equipmentId: "",
    equipmentLabel: "",
    serviceId: "",
    dataRealizacao: today,
    reminderSend: "none",
    reminderLocalDate: today,
    reminderLocalTime: "09:00",
    notes: "",
    messageTemplateKind: "returning",
  };
}

function serializeSnapshot(s: FormSnapshot): string {
  return JSON.stringify(s);
}

function clientToComboboxItem(c: ClientOut) {
  return clientOutToComboboxItem(c);
}

function equipmentLabel(eq: EquipmentOut): string {
  const title = eq.identificacao?.trim() || "Equipamento";
  const brandModel = [eq.fabricante, eq.modelo].filter(Boolean).join(" ");
  const location = eq.local_instalacao?.trim() || eq.ambiente_nome?.trim();
  const parts = [title];
  if (brandModel) parts.push(brandModel);
  if (location && location.toLowerCase() !== title.toLowerCase()) parts.push(location);
  return parts.join(" · ");
}

function serviceIntervalMonths(service: ServiceOut): number | null {
  if (service.preventive_enabled && service.preventive_interval_type && service.preventive_interval_value) {
    const value = service.preventive_interval_value;
    if (service.preventive_interval_type === "months") return value;
    if (service.preventive_interval_type === "years") return value * 12;
    if (service.preventive_interval_type === "days") return Math.max(1, Math.round(value / 30));
  }
  return service.periodicidade_meses ?? null;
}

function serviceIntervalLabel(service: ServiceOut): string {
  if (service.preventive_enabled && service.preventive_interval_type && service.preventive_interval_value) {
    const unit =
      service.preventive_interval_type === "days"
        ? "dias"
        : service.preventive_interval_type === "years"
          ? "anos"
          : "meses";
    return `${service.preventive_interval_value} ${unit}`;
  }
  if (service.periodicidade_meses != null) return `${service.periodicidade_meses} meses`;
  return "";
}

function addMonthsIso(isoDate: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match || months <= 0) return null;
  const year0 = Number(match[1]);
  const month0 = Number(match[2]);
  const day0 = Number(match[3]);
  if (!Number.isFinite(year0) || !Number.isFinite(month0) || !Number.isFinite(day0)) return null;
  const monthIndex = month0 - 1 + months;
  const year = year0 + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(day0, lastDay);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return formatFriendlyDatePt(iso);
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.field} ${className ?? ""}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

function isoDateOnly(value: string | null | undefined): string {
  if (!value) return todayIsoDate();
  return value.includes("T") ? value.split("T")[0]! : value.slice(0, 10);
}

export function PreventiveCreateFormView({
  open,
  onClose,
  onCreated,
  preventiveSettings,
  editScheduleId = null,
  onUpdated,
}: PreventiveCreateFormViewProps) {
  const templateKindOptions = useMemo(
    () => preventiveModelOptions(preventiveSettings),
    [preventiveSettings],
  );
  const isEditMode = editScheduleId != null && editScheduleId > 0;
  const [form, setForm] = useState<FormSnapshot>(emptySnapshot);
  const [, setBaseline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editTemporaryEquipment, setEditTemporaryEquipment] = useState(false);
  const [error, setError] = useState("");

  const [clients, setClients] = useState<ClientOut[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [equipments, setEquipments] = useState<EquipmentOut[]>([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);

  const [services, setServices] = useState<ServiceOut[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesErr, setServicesErr] = useState("");

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (servicesErr) toast.error(servicesErr);
  }, [servicesErr]);

  const clientItems = useMemo(() => clients.map(clientToComboboxItem), [clients]);

  const equipmentItems = useMemo(
    () => equipments.map((eq) => ({ id: String(eq.id), name: equipmentLabel(eq) })),
    [equipments],
  );

  const servicesWithPeriod = useMemo(
    () => services.filter((s) => s.preventive_enabled || s.periodicidade_meses != null),
    [services],
  );

  const serviceItems = useMemo(
    () =>
      servicesWithPeriod.map((s) => ({
        id: String(s.id),
        name: `${s.name} (${serviceIntervalLabel(s)})`,
      })),
    [servicesWithPeriod],
  );

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === form.serviceId) ?? null,
    [services, form.serviceId],
  );

  const periodicityLabel = useMemo(() => {
    if (!selectedService) return "Selecione um serviço preventivo";
    const label = serviceIntervalLabel(selectedService);
    return label ? `A cada ${label}` : "Sem intervalo configurado";
  }, [selectedService]);

  const nextMaintenanceLabel = useMemo(() => {
    const months = selectedService ? serviceIntervalMonths(selectedService) : null;
    if (!months || !form.dataRealizacao) return "—";
    return addMonthsIso(form.dataRealizacao, months) ?? "—";
  }, [selectedService, form.dataRealizacao]);

  const resetForm = useCallback(() => {
    const next = {
      ...emptySnapshot(),
      messageTemplateKind: tenantDefaultTemplateKind(preventiveSettings),
    };
    setForm(next);
    setBaseline(serializeSnapshot(next));
    setError("");
  }, [preventiveSettings]);

  useEffect(() => {
    if (!open) return;
    if (!isEditMode) resetForm();
  }, [open, isEditMode, resetForm]);

  useEffect(() => {
    if (!open || !isEditMode || !editScheduleId) return;
    let cancelled = false;
    setLoadingEdit(true);
    setError("");
    void (async () => {
      try {
        const detail = await fetchManualPreventiveReminder(editScheduleId);
        if (cancelled) return;
        setEditClientName(detail.client_name);
        setEditTemporaryEquipment(detail.is_temporary_equipment);
        const next: FormSnapshot = {
          entryMode: detail.is_temporary_equipment ? "temporary" : "existing",
          useExistingClient: true,
          clientId: String(detail.client_id),
          clientName: "",
          clientPhone: "",
          clientWhatsapp: "",
          equipmentId: String(detail.equipment_id),
          equipmentLabel: detail.equipment_label,
          serviceId: String(detail.service_id),
          dataRealizacao: isoDateOnly(detail.data_realizacao),
          reminderSend: "none",
          reminderLocalDate: isoDateOnly(detail.data_realizacao),
          reminderLocalTime: "09:00",
          notes: detail.notes ?? "",
          messageTemplateKind:
            detail.message_template_kind === "first" || detail.message_template_kind === "returning"
              ? detail.message_template_kind
              : tenantDefaultTemplateKind(preventiveSettings),
        };
        setForm(next);
        setBaseline(serializeSnapshot(next));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar o lembrete.");
        }
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isEditMode, editScheduleId, preventiveSettings]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClientsLoading(true);
    void (async () => {
      try {
        const rows = await listClientsAll();
        if (!cancelled) setClients(rows.filter((c) => c.is_active));
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setServicesLoading(true);
    setServicesErr("");
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
        if (!cancelled) setServices(batches.filter((s) => s.is_active));
      } catch (e) {
        if (!cancelled) {
          setServices([]);
          setServicesErr(e instanceof Error ? e.message : "Erro ao carregar serviços.");
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const needsCatalog =
      form.entryMode === "existing" || (form.entryMode === "temporary" && form.useExistingClient);
    if (!open || !needsCatalog || !form.clientId) {
      setEquipments([]);
      return;
    }
    const clientId = Number(form.clientId);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      setEquipments([]);
      return;
    }
    let cancelled = false;
    setEquipmentsLoading(true);
    void (async () => {
      try {
        const rows = await listClientHvacEquipments(clientId, { only_active: true });
        if (!cancelled) setEquipments(rows);
      } catch {
        if (!cancelled) setEquipments([]);
      } finally {
        if (!cancelled) setEquipmentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, form.clientId, form.entryMode, form.useExistingClient]);

  function patchForm<K extends keyof FormSnapshot>(key: K, value: FormSnapshot[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.serviceId) {
      setError("Selecione o tipo de serviço preventivo.");
      return;
    }

    if (isEditMode && editScheduleId) {
      const equipmentLabel = form.equipmentLabel.trim();
      if (editTemporaryEquipment && !equipmentLabel) {
        setError("Informe o apelido do aparelho.");
        return;
      }
      setSubmitting(true);
      try {
        await updateManualPreventiveReminder(editScheduleId, {
          service_id: Number(form.serviceId),
          data_realizacao: form.dataRealizacao,
          equipment_label: editTemporaryEquipment ? equipmentLabel : undefined,
          notes: form.notes.trim() || null,
          message_template_kind: form.messageTemplateKind,
        });
        await onUpdated?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao atualizar.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const isTemporary = form.entryMode === "temporary";
    const usesExistingClient = !isTemporary || form.useExistingClient;

    if (usesExistingClient) {
      if (!form.clientId) {
        setError("Selecione um cliente.");
        return;
      }
    } else {
      if (!form.clientName.trim()) {
        setError("Informe o nome do cliente.");
        return;
      }
      if (!form.clientPhone.trim() && !form.clientWhatsapp.trim()) {
        setError("Informe telefone ou WhatsApp.");
        return;
      }
    }

    const equipmentLabel = form.equipmentLabel.trim();
    if (!form.equipmentId && !equipmentLabel) {
      setError("Informe o apelido do aparelho (ex.: Split sala, Mercado).");
      return;
    }

    if (form.reminderSend === "scheduled" && !form.reminderLocalDate) {
      setError("Informe a data do lembrete.");
      return;
    }

    const noteParts: string[] = [];
    if (isTemporary && equipmentLabel) {
      noteParts.push(`Cadastro temporário — aparelho: ${equipmentLabel}`);
    }
    if (form.notes.trim()) noteParts.push(form.notes.trim());

    const common = {
      entry_mode: form.entryMode,
      service_id: Number(form.serviceId),
      data_realizacao: form.dataRealizacao,
      notes: noteParts.length ? noteParts.join("\n") : null,
      reminder_send: form.reminderSend,
      ...(form.equipmentId ? { equipment_id: Number(form.equipmentId) } : {}),
      ...(!form.equipmentId && equipmentLabel ? { equipment_label: equipmentLabel } : {}),
      promo_image_url: preventiveSettings?.preventive_promo_image_url ?? null,
      technical_problem_hint: preventiveSettings?.preventive_technical_problem_hint ?? null,
      message_template_kind: form.messageTemplateKind,
      ...(form.reminderSend === "scheduled"
        ? {
            reminder_local_date: form.reminderLocalDate,
            reminder_local_time: form.reminderLocalTime || "09:00",
          }
        : {}),
    } as const;

    setSubmitting(true);
    try {
      const out = usesExistingClient
        ? await registerPreventiveEntry({
            ...common,
            client_id: Number(form.clientId),
          })
        : await registerPreventiveEntry({
            ...common,
            new_client: {
              name: form.clientName.trim(),
              phone: form.clientPhone.trim() || null,
              whatsapp: form.clientWhatsapp.trim() || null,
            },
          });

      await onCreated(out);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const isTemporary = form.entryMode === "temporary";
  const formBusy = submitting || loadingEdit;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preventive-create-title"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <header className={styles.panelHeader}>
          <h2 id="preventive-create-title" className={styles.panelTitle}>
            {isEditMode
              ? "Editar lembrete preventivo"
              : isTemporary
                ? "Lembrete preventivo temporário"
                : "Registrar preventiva"}
          </h2>
          <p className={styles.panelLead}>
            {isEditMode
              ? "Altere serviço, data da última realização ou observações. O envio automático de WhatsApp segue a configuração da Gestão Preventiva."
              : isTemporary
                ? "Para clientes que já fizeram serviço antes do Climaris. Cria um cadastro mínimo e calcula o próximo vencimento na listagem mensal."
                : "Registre a última realização em um cliente e equipamento já cadastrados."}
          </p>
        </header>

        <form
          id="preventive-create-form"
          onSubmit={(e) => void handleSubmit(e)}
          className={styles.panelBody}
        >
          <div className={styles.formStack}>
            {loadingEdit ? <p className={styles.hint}>Carregando lembrete…</p> : null}
            {isEditMode ? (
              <Card>
                <CardHeader>
                  <CardTitle>Cliente e aparelho</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`${styles.grid} ${styles.gridMd2}`}>
                    <Field label="Cliente" className={styles.span2}>
                      <div className={styles.readOnlyValue}>{editClientName || "—"}</div>
                    </Field>
                    {editTemporaryEquipment ? (
                      <Field label="Apelido do aparelho" className={styles.span2}>
                        <Input
                          value={form.equipmentLabel}
                          onChange={(ev) => patchForm("equipmentLabel", ev.target.value)}
                          required
                        />
                      </Field>
                    ) : (
                      <Field label="Equipamento" className={styles.span2}>
                        <div className={styles.readOnlyValue}>{form.equipmentLabel || "—"}</div>
                      </Field>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {!isEditMode ? (
            <>
            <Card>
              <CardHeader>
                <CardTitle>Tipo de cadastro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.modeRow}>
                  <Button
                    type="button"
                    size="sm"
                    variant={isTemporary ? "default" : "outline"}
                    onClick={() => {
                      patchForm("entryMode", "temporary");
                      patchForm("equipmentId", "");
                    }}
                  >
                    Lembrete temporário
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!isTemporary ? "default" : "outline"}
                    onClick={() => {
                      patchForm("entryMode", "existing");
                      patchForm("useExistingClient", true);
                      patchForm("clientName", "");
                      patchForm("clientPhone", "");
                      patchForm("clientWhatsapp", "");
                    }}
                  >
                    Cliente já cadastrado
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cliente e aparelho</CardTitle>
                <CardDescription>
                  {isTemporary
                    ? "Nome e contato bastam; o aparelho pode ser só um apelido (ex.: Loja centro)."
                    : "Selecione cliente e equipamento do cadastro."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
                  {isTemporary && !form.useExistingClient ? (
                    <>
                      <Field label="Nome do cliente" className={styles.span2}>
                        <Input
                          value={form.clientName}
                          onChange={(ev) => patchForm("clientName", ev.target.value)}
                          placeholder="Ex.: Zingarelli"
                        />
                      </Field>
                      <Field label="Telefone">
                        <Input
                          value={form.clientPhone}
                          onChange={(ev) => patchForm("clientPhone", ev.target.value)}
                          placeholder="Telefone"
                        />
                      </Field>
                      <Field label="WhatsApp">
                        <Input
                          value={form.clientWhatsapp}
                          onChange={(ev) => patchForm("clientWhatsapp", ev.target.value)}
                          placeholder="WhatsApp"
                        />
                      </Field>
                      <Field label="Apelido do aparelho" className={styles.span2}>
                        <Input
                          value={form.equipmentLabel}
                          onChange={(ev) => patchForm("equipmentLabel", ev.target.value)}
                          placeholder="Ex.: Split sala, Mercado, Escritório"
                        />
                      </Field>
                      <Field label=" " className={styles.span2}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => {
                            patchForm("useExistingClient", true);
                            patchForm("clientName", "");
                            patchForm("clientPhone", "");
                            patchForm("clientWhatsapp", "");
                          }}
                        >
                          Usar cliente já cadastrado no sistema
                        </button>
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Cliente" className={styles.span2}>
                        <ClientCombobox
                          className={comboboxStyles.cardField}
                          clientes={clientItems}
                          value={form.clientId}
                          onChange={(id) => {
                            patchForm("clientId", id);
                            patchForm("equipmentId", "");
                          }}
                          disabled={clientsLoading}
                          placeholder={clientsLoading ? "Carregando clientes…" : "Selecione o cliente"}
                          searchPlaceholder="Pesquisar cliente…"
                        />
                      </Field>

                      {!isTemporary ? (
                        <Field label="Equipamento">
                          {form.clientId ? (
                            form.equipmentId ? (
                              <div className={styles.selectedRow}>
                                <div className={styles.selectedMain}>
                                  <span className={styles.selectedTitle}>
                                    {equipmentItems.find((e) => e.id === form.equipmentId)?.name ?? "Equipamento"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  onClick={() => patchForm("equipmentId", "")}
                                >
                                  Trocar
                                </button>
                              </div>
                            ) : (
                              <CatalogCombobox
                                items={equipmentItems}
                                onPick={(id) => patchForm("equipmentId", id)}
                                disabled={equipmentsLoading}
                                placeholder={
                                  equipmentsLoading ? "Carregando…" : "Selecionar equipamento (opcional)"
                                }
                                searchPlaceholder="Pesquisar equipamento…"
                                emptyMessage={
                                  equipments.length === 0
                                    ? "Nenhum equipamento ativo — informe apelido abaixo."
                                    : "Nenhum equipamento encontrado."
                                }
                              />
                            )
                          ) : (
                            <div className={styles.readOnlyValue}>Selecione um cliente primeiro</div>
                          )}
                        </Field>
                      ) : null}

                      <Field label={isTemporary ? "Apelido do aparelho" : "Apelido (se não houver equipamento)"} className={isTemporary ? styles.span2 : undefined}>
                        <Input
                          value={form.equipmentLabel}
                          onChange={(ev) => patchForm("equipmentLabel", ev.target.value)}
                          placeholder="Ex.: Split sala, Mercado"
                          disabled={Boolean(form.equipmentId)}
                        />
                      </Field>

                      {isTemporary ? (
                        <Field label=" " className={styles.span2}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => {
                              patchForm("useExistingClient", false);
                              patchForm("clientId", "");
                              patchForm("equipmentId", "");
                            }}
                          >
                            Cadastrar cliente novo (pré-sistema)
                          </button>
                        </Field>
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            </>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Serviço e prazos</CardTitle>
                <CardDescription>Serviço com gestão preventiva ativa em Serviços.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
                  <Field label="Serviço preventivo" className={styles.span2}>
                    {selectedService ? (
                      <div className={styles.selectedRow}>
                        <div className={styles.selectedMain}>
                          <span className={styles.selectedTitle}>{selectedService.name}</span>
                          <span className={styles.selectedMeta}>Periodicidade: {serviceIntervalLabel(selectedService)}</span>
                        </div>
                        <button type="button" className={styles.linkBtn} onClick={() => patchForm("serviceId", "")}>
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <CatalogCombobox
                        items={serviceItems}
                        onPick={(id) => patchForm("serviceId", id)}
                        disabled={servicesLoading}
                        placeholder={servicesLoading ? "Carregando serviços…" : "Selecionar serviço"}
                        searchPlaceholder="Pesquisar serviço…"
                        emptyMessage="Nenhum serviço com gestão preventiva ativa."
                      />
                    )}

                  </Field>

                  <Field label="Periodicidade">
                    <div className={styles.readOnlyValue}>{periodicityLabel}</div>
                  </Field>

                  <Field label="Data da última realização">
                    <Input
                      type="date"
                      value={form.dataRealizacao}
                      onChange={(ev) => patchForm("dataRealizacao", ev.target.value)}
                      required
                    />
                  </Field>

                  <Field label="Próximo vencimento (estimado)" hint="Aparecerá na Gestão Preventiva no mês correspondente.">
                    <div className={styles.readOnlyValue}>{nextMaintenanceLabel}</div>
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isEditMode ? "Observações" : "Observações e WhatsApp"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
                  <Field
                    label="Modelo da mensagem"
                    hint="Usado ao enviar o lembrete por WhatsApp. O padrão vem das configurações da empresa."
                    className={styles.span2}
                  >
                    <Select
                      value={form.messageTemplateKind}
                      onChange={(ev) =>
                        patchForm("messageTemplateKind", ev.target.value as PreventiveTemplateKind)
                      }
                    >
                      {templateKindOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {!isEditMode ? (
                  <Field label="Lembrete WhatsApp">
                    <Select
                      value={form.reminderSend}
                      onChange={(ev) => patchForm("reminderSend", ev.target.value as ReminderSend)}
                    >
                      <option value="none">Só registrar (sem WhatsApp)</option>
                      <option value="now">Enviar agora</option>
                      <option value="scheduled">Agendar envio</option>
                    </Select>
                  </Field>
                  ) : null}

                  {!isEditMode && form.reminderSend === "scheduled" ? (
                    <>
                      <Field label="Data do envio">
                        <Input
                          type="date"
                          value={form.reminderLocalDate}
                          onChange={(ev) => patchForm("reminderLocalDate", ev.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Hora (HH:MM)">
                        <Input
                          type="time"
                          value={form.reminderLocalTime}
                          onChange={(ev) => patchForm("reminderLocalTime", ev.target.value)}
                        />
                      </Field>
                    </>
                  ) : null}

                  <Field label="Observações (opcional)" className={styles.span2}>
                    <textarea
                      className={styles.textarea}
                      value={form.notes}
                      onChange={(ev) => patchForm("notes", ev.target.value)}
                      rows={3}
                      placeholder="Ex.: fez limpeza em mar/2025, antes de entrar no Climaris"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

          </div>

          <footer className={styles.footerBar}>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={formBusy || loadingEdit}>
              {submitting
                ? "Salvando…"
                : isEditMode
                  ? "Salvar alterações"
                  : isTemporary
                    ? "Salvar lembrete"
                    : "Registrar preventiva"}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
