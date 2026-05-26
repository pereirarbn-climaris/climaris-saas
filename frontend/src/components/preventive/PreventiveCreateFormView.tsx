import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { listClientHvacEquipments, listClientsAll, type ClientOut, type EquipmentOut } from "../../api/clients";
import {
  registerPreventiveEntry,
  type PreventiveRegisterEntryOut,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import { listServices, type ServiceOut } from "../../api/services";
import { formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { Button } from "../ui/button";
import { CatalogCombobox } from "../ui/catalog-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ClientCombobox } from "../ui/client-combobox";
import { Input, Select } from "../ui/input";
import styles from "./PreventiveCreateFormView.module.css";

type ReminderSend = "none" | "now" | "scheduled";

type FormSnapshot = {
  clientMode: "existing" | "new";
  clientId: string;
  newClientName: string;
  newClientPhone: string;
  newClientWhatsapp: string;
  equipmentId: string;
  serviceId: string;
  dataRealizacao: string;
  reminderSend: ReminderSend;
  reminderLocalDate: string;
  reminderLocalTime: string;
  notes: string;
};

export type PreventiveCreateFormViewProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: PreventiveRegisterEntryOut) => void | Promise<void>;
  preventiveSettings: PreventiveSettings | null;
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
    clientMode: "existing",
    clientId: "",
    newClientName: "",
    newClientPhone: "",
    newClientWhatsapp: "",
    equipmentId: "",
    serviceId: "",
    dataRealizacao: today,
    reminderSend: "none",
    reminderLocalDate: today,
    reminderLocalTime: "09:00",
    notes: "",
  };
}

function serializeSnapshot(s: FormSnapshot): string {
  return JSON.stringify(s);
}

function clientToComboboxItem(c: ClientOut) {
  const doc = (c.document ?? "").trim();
  return {
    id: String(c.id),
    nome: c.name,
    nomeFantasia: c.trade_name ?? undefined,
    documento: doc || `#${c.id}`,
  };
}

function equipmentLabel(eq: EquipmentOut): string {
  const title = eq.identificacao?.trim() || "Equipamento";
  const brandModel = [eq.fabricante, eq.modelo].filter(Boolean).join(" ");
  const location = eq.local_instalacao?.trim() || eq.ambiente_nome?.trim();
  const parts = [title];
  if (brandModel) parts.push(brandModel);
  if (location && location.toLowerCase() !== title.toLowerCase()) parts.push(location);
  return normalizeEquipmentLabelText(parts.join(" · "));
}

function normalizeEquipmentLabelText(label: string): string {
  const parts = label.split(" · ").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return label;
  if (parts.length >= 2 && parts[0]!.toLowerCase() === parts[parts.length - 1]!.toLowerCase()) {
    parts.pop();
  }
  const deduped: string[] = [];
  for (const part of parts) {
    if (deduped.length > 0 && deduped[deduped.length - 1]!.toLowerCase() === part.toLowerCase()) continue;
    deduped.push(part);
  }
  return deduped.join(" · ");
}

function addMonthsIso(isoDate: string, months: number): string | null {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime()) || months <= 0) return null;
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatFriendlyDatePt(`${y}-${m}-${day}`);
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

export function PreventiveCreateFormView({
  open,
  onClose,
  onCreated,
  preventiveSettings,
}: PreventiveCreateFormViewProps) {
  const [form, setForm] = useState<FormSnapshot>(emptySnapshot);
  const [baseline, setBaseline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [clients, setClients] = useState<ClientOut[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [equipments, setEquipments] = useState<EquipmentOut[]>([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);

  const [services, setServices] = useState<ServiceOut[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesErr, setServicesErr] = useState("");

  const isDirty = baseline.length > 0 && serializeSnapshot(form) !== baseline;

  const clientItems = useMemo(() => clients.map(clientToComboboxItem), [clients]);

  const equipmentItems = useMemo(
    () => equipments.map((eq) => ({ id: String(eq.id), name: equipmentLabel(eq) })),
    [equipments],
  );

  const servicesWithPeriod = useMemo(
    () => services.filter((s) => s.periodicidade_meses != null),
    [services],
  );

  const serviceItems = useMemo(
    () =>
      servicesWithPeriod.map((s) => ({
        id: String(s.id),
        name: `${s.name} (${s.periodicidade_meses} meses)`,
      })),
    [servicesWithPeriod],
  );

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === form.serviceId) ?? null,
    [services, form.serviceId],
  );

  const selectedEquipment = useMemo(
    () => equipments.find((eq) => String(eq.id) === form.equipmentId) ?? null,
    [equipments, form.equipmentId],
  );

  const periodicityLabel = useMemo(() => {
    const months = selectedService?.periodicidade_meses;
    if (!months) return "Selecione um contrato com periodicidade";
    return `A cada ${months} meses`;
  }, [selectedService]);

  const nextMaintenanceLabel = useMemo(() => {
    const months = selectedService?.periodicidade_meses;
    if (!months || !form.dataRealizacao) return "—";
    return addMonthsIso(form.dataRealizacao, months) ?? "—";
  }, [selectedService, form.dataRealizacao]);

  const resetForm = useCallback(() => {
    const next = emptySnapshot();
    setForm(next);
    setBaseline(serializeSnapshot(next));
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

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
    if (!open || form.clientMode !== "existing" || !form.clientId) {
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
  }, [open, form.clientId, form.clientMode]);

  function patchForm<K extends keyof FormSnapshot>(key: K, value: FormSnapshot[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.serviceId) {
      setError("Selecione um contrato (serviço) com periodicidade cadastrada.");
      return;
    }

    if (form.clientMode === "existing") {
      if (!form.clientId) {
        setError("Selecione um cliente.");
        return;
      }
    } else {
      if (!form.newClientName.trim()) {
        setError("Informe o nome do cliente.");
        return;
      }
      if (!form.newClientPhone.trim() && !form.newClientWhatsapp.trim()) {
        setError("Informe telefone ou WhatsApp do novo cliente.");
        return;
      }
    }

    if (form.reminderSend === "scheduled" && !form.reminderLocalDate) {
      setError("Informe a data do lembrete.");
      return;
    }

    const noteParts: string[] = [];
    if (selectedEquipment) noteParts.push(`Equipamento: ${equipmentLabel(selectedEquipment)}`);
    if (form.notes.trim()) noteParts.push(form.notes.trim());

    const common = {
      service_id: Number(form.serviceId),
      data_realizacao: form.dataRealizacao,
      notes: noteParts.length ? noteParts.join("\n") : null,
      reminder_send: form.reminderSend,
      ...(form.equipmentId ? { equipment_id: Number(form.equipmentId) } : {}),
      promo_image_url: preventiveSettings?.preventive_promo_image_url ?? null,
      technical_problem_hint: preventiveSettings?.preventive_technical_problem_hint ?? null,
      ...(form.reminderSend === "scheduled"
        ? {
            reminder_local_date: form.reminderLocalDate,
            reminder_local_time: form.reminderLocalTime || "09:00",
          }
        : {}),
    } as const;

    setSubmitting(true);
    try {
      const out =
        form.clientMode === "existing"
          ? await registerPreventiveEntry({
              ...common,
              client_id: Number(form.clientId),
            })
          : await registerPreventiveEntry({
              ...common,
              new_client: {
                name: form.newClientName.trim(),
                phone: form.newClientPhone.trim() || null,
                whatsapp: form.newClientWhatsapp.trim() || null,
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
            Novo registro preventivo
          </h2>
          <p className={styles.panelLead}>
            Cadastre a última realização do contrato e, se quiser, envie ou agende o lembrete por WhatsApp.
          </p>
        </header>

        <form
          id="preventive-create-form"
          onSubmit={(e) => void handleSubmit(e)}
          className={styles.panelBody}
        >
          <div className={styles.formStack}>
            <Card>
              <CardHeader>
                <CardTitle>Cliente e equipamento</CardTitle>
                <CardDescription>Selecione o cliente e, opcionalmente, o equipamento vinculado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
                  <Field label="Modo de cadastro" className={styles.span2}>
                    <div className={styles.modeRow}>
                      <Button
                        type="button"
                        size="sm"
                        variant={form.clientMode === "existing" ? "default" : "outline"}
                        onClick={() => {
                          patchForm("clientMode", "existing");
                          patchForm("newClientName", "");
                          patchForm("newClientPhone", "");
                          patchForm("newClientWhatsapp", "");
                        }}
                      >
                        Cliente existente
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={form.clientMode === "new" ? "default" : "outline"}
                        onClick={() => {
                          patchForm("clientMode", "new");
                          patchForm("clientId", "");
                          patchForm("equipmentId", "");
                          setEquipments([]);
                        }}
                      >
                        Novo cliente
                      </Button>
                    </div>
                  </Field>

                  {form.clientMode === "existing" ? (
                    <>
                      <Field label="Cliente" className={styles.span2}>
                        <ClientCombobox
                          clientes={clientItems}
                          value={form.clientId}
                          onChange={(id) => {
                            patchForm("clientId", id);
                            patchForm("equipmentId", "");
                          }}
                          disabled={clientsLoading}
                          placeholder={clientsLoading ? "Carregando clientes…" : "Selecione o cliente"}
                          searchPlaceholder="Pesquisar cliente (A-Z)…"
                        />
                      </Field>

                      <Field label="Equipamento / localização">
                        {form.clientId ? (
                          selectedEquipment ? (
                            <div className={styles.selectedRow}>
                              <div className={styles.selectedMain}>
                                <span className={styles.selectedTitle}>{equipmentLabel(selectedEquipment)}</span>
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
                                equipmentsLoading ? "Carregando equipamentos…" : "Selecionar equipamento (opcional)"
                              }
                              searchPlaceholder="Pesquisar equipamento…"
                              emptyMessage={
                                equipments.length === 0
                                  ? "Nenhum equipamento ativo neste cliente."
                                  : "Nenhum equipamento encontrado."
                              }
                            />
                          )
                        ) : (
                          <div className={styles.readOnlyValue}>Selecione um cliente primeiro</div>
                        )}
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Nome completo">
                        <Input
                          value={form.newClientName}
                          onChange={(ev) => patchForm("newClientName", ev.target.value)}
                          placeholder="Nome do cliente"
                        />
                      </Field>
                      <Field label="Telefone">
                        <Input
                          value={form.newClientPhone}
                          onChange={(ev) => patchForm("newClientPhone", ev.target.value)}
                          placeholder="Telefone"
                        />
                      </Field>
                      <Field label="WhatsApp" className={styles.span2}>
                        <Input
                          value={form.newClientWhatsapp}
                          onChange={(ev) => patchForm("newClientWhatsapp", ev.target.value)}
                          placeholder="WhatsApp (se diferente do telefone)"
                        />
                      </Field>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contrato e periodicidade</CardTitle>
                <CardDescription>Serviço preventivo com intervalo cadastrado em Serviços.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
                  <Field label="Contrato (serviço)" className={styles.span2}>
                    {selectedService ? (
                      <div className={styles.selectedRow}>
                        <div className={styles.selectedMain}>
                          <span className={styles.selectedTitle}>{selectedService.name}</span>
                          <span className={styles.selectedMeta}>
                            Periodicidade: {selectedService.periodicidade_meses} meses
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => patchForm("serviceId", "")}
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <CatalogCombobox
                        items={serviceItems}
                        onPick={(id) => patchForm("serviceId", id)}
                        disabled={servicesLoading}
                        placeholder={servicesLoading ? "Carregando contratos…" : "Selecionar contrato"}
                        searchPlaceholder="Pesquisar serviço…"
                        emptyMessage={
                          servicesWithPeriod.length === 0
                            ? "Nenhum serviço ativo com periodicidade (6 ou 12 meses)."
                            : "Nenhum serviço encontrado."
                        }
                      />
                    )}
                    {servicesErr ? <p className={styles.msgErr}>{servicesErr}</p> : null}
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

                  <Field label="Próxima manutenção (estimada)" hint="Calculada a partir da última realização e da periodicidade.">
                    <div className={styles.readOnlyValue}>{nextMaintenanceLabel}</div>
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lembrete e observações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`${styles.grid} ${styles.gridMd2}`}>
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

                  {form.reminderSend === "scheduled" ? (
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
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {error ? <p className={styles.msgErr}>{error}</p> : null}
          </div>

          <footer className={styles.footerBar}>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            {isDirty ? (
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Criar preventiva"}
              </Button>
            ) : null}
          </footer>
        </form>
      </div>
    </div>
  );
}
