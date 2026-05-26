import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  deleteTenantLogo,
  getTenantLogoSignedUrl,
  patchTenantAdmin,
  syncTenantNationalHolidays,
  uploadTenantLogo,
  type FiscalTaxIdKind,
  type TenantOut,
} from "../../api/auth";
import { fetchCepLookup } from "../../api/cep";
import { getNfseSettings, patchNfseSettings, type NfseSettingsOut } from "../../api/nfse";
import { fetchPreventiveSettings, patchPreventiveSettings } from "../../api/preventiveMaintenance";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import adminStyles from "./AdminPage.module.css";
import styles from "./ManagementView.module.css";

type Props = {
  tenant: TenantOut;
  refreshWorkspace: () => Promise<void>;
};

type FormState = {
  name: string;
  tax_id_kind: FiscalTaxIdKind;
  tax_document: string;
  active_plan: string;
  status: string;
  phone: string;
  email: string;
  website: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  address_country: string;
  address_ibge_code: string;
  pdf_primary_color: string;
  timezone: string;
  business_days: string;
  workday_start: string;
  workday_end: string;
  block_national_holidays: boolean;
  finance_enabled: boolean;
  finance_mode: "basic" | "intermediate" | "management";
  preventive_auto_remind_days_before: number;
  dps_serie: string;
  prestador_inscricao_municipal: string;
  default_codigo_tributacao_nacional: string;
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Seg" },
  { value: 1, label: "Ter" },
  { value: 2, label: "Qua" },
  { value: 3, label: "Qui" },
  { value: 4, label: "Sex" },
  { value: 5, label: "Sáb" },
  { value: 6, label: "Dom" },
] as const;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function tenantToForm(tenant: TenantOut, nfse: NfseSettingsOut | null, preventiveDays: number): FormState {
  const taxKind: FiscalTaxIdKind =
    tenant.tax_id_kind === "cpf" || tenant.tax_id_kind === "cnpj" ? tenant.tax_id_kind : "cnpj";
  return {
    name: tenant.name ?? "",
    tax_id_kind: taxKind,
    tax_document: tenant.tax_document || tenant.cnpj || "",
    active_plan: tenant.active_plan ?? "",
    status: tenant.status ?? "active",
    phone: tenant.phone ?? "",
    email: tenant.email ?? "",
    website: tenant.website ?? "",
    address_street: tenant.address_street ?? "",
    address_number: tenant.address_number ?? "",
    address_complement: tenant.address_complement ?? "",
    address_district: tenant.address_district ?? "",
    address_city: tenant.address_city ?? "",
    address_state: tenant.address_state ?? "",
    address_postal_code: tenant.address_postal_code ?? "",
    address_country: tenant.address_country ?? "Brasil",
    address_ibge_code: tenant.address_ibge_code ?? "",
    pdf_primary_color: tenant.pdf_primary_color || "#0B7FAF",
    timezone: tenant.timezone ?? "America/Sao_Paulo",
    business_days: tenant.business_days ?? "0,1,2,3,4",
    workday_start: tenant.workday_start ?? "08:00",
    workday_end: tenant.workday_end ?? "18:00",
    block_national_holidays: Boolean(tenant.block_national_holidays),
    finance_enabled: Boolean(tenant.finance_enabled),
    finance_mode: tenant.finance_mode ?? "basic",
    preventive_auto_remind_days_before: preventiveDays,
    dps_serie: nfse?.dps_serie ?? "",
    prestador_inscricao_municipal: nfse?.prestador_inscricao_municipal ?? "",
    default_codigo_tributacao_nacional: nfse?.default_codigo_tributacao_nacional ?? "",
  };
}

function serializeForm(form: FormState): string {
  return JSON.stringify(form);
}

function businessDaysFromCheckboxes(selected: Set<number>): string {
  return [...selected].sort((a, b) => a - b).join(",");
}

function businessDaysToSet(value: string): Set<number> {
  const set = new Set<number>();
  for (const part of value.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n >= 0 && n <= 6) set.add(n);
  }
  return set;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

export function ManagementView({ tenant, refreshWorkspace }: Props) {
  const [form, setForm] = useState<FormState>(() => tenantToForm(tenant, null, 0));
  const [baseline, setBaseline] = useState("");
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cepBusy, setCepBusy] = useState(false);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [logoPreview, setLogoPreview] = useState(tenant.logo_url ?? "");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const businessDaySet = useMemo(() => businessDaysToSet(form.business_days), [form.business_days]);
  const isDirty = baseline.length > 0 && serializeForm(form) !== baseline;

  const applyTenantSnapshot = useCallback(
    (nextTenant: TenantOut, nfse: NfseSettingsOut | null, preventiveDays: number) => {
      const next = tenantToForm(nextTenant, nfse, preventiveDays);
      setForm(next);
      setBaseline(serializeForm(next));
    },
    [],
  );

  useEffect(() => {
    setLogoPreview(tenant.logo_url ?? "");
  }, [tenant.logo_url]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingExtras(true);
      try {
        const [nfse, preventive] = await Promise.all([
          getNfseSettings().catch(() => null),
          fetchPreventiveSettings().catch(() => null),
        ]);
        if (cancelled) return;
        applyTenantSnapshot(
          tenant,
          nfse,
          preventive?.preventive_auto_remind_days_before ?? 0,
        );
      } finally {
        if (!cancelled) setLoadingExtras(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant, applyTenantSnapshot]);

  function patchField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMsg(null);
  }

  function toggleBusinessDay(day: number, checked: boolean) {
    const next = new Set(businessDaySet);
    if (checked) next.add(day);
    else next.delete(day);
    patchField("business_days", businessDaysFromCheckboxes(next));
  }

  async function onLookupCep() {
    const cep = digitsOnly(form.address_postal_code);
    if (cep.length !== 8) {
      setMsg({ kind: "err", text: "Informe um CEP com 8 dígitos." });
      return;
    }
    setCepBusy(true);
    setMsg(null);
    try {
      const data = await fetchCepLookup(cep);
      setForm((prev) => ({
        ...prev,
        address_street: data.address_street ?? prev.address_street,
        address_complement: data.address_complement ?? prev.address_complement,
        address_district: data.address_district ?? prev.address_district,
        address_city: data.address_city ?? prev.address_city,
        address_state: data.address_state ?? prev.address_state,
        address_postal_code: data.address_postal_code ?? cep,
        address_ibge_code: data.address_ibge_code ?? prev.address_ibge_code,
      }));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível buscar o CEP." });
    } finally {
      setCepBusy(false);
    }
  }

  async function onSyncHolidays() {
    if (!form.block_national_holidays) {
      setMsg({ kind: "err", text: "Ative o bloqueio de feriados nacionais para sincronizar." });
      return;
    }
    setHolidayBusy(true);
    setMsg(null);
    try {
      const out = await syncTenantNationalHolidays();
      setMsg({
        kind: "ok",
        text:
          out.inserted > 0
            ? `Sincronização concluída. ${out.inserted} feriado(s) novo(s) bloqueado(s) na agenda.`
            : "Sincronização concluída. Não havia novos feriados para incluir.",
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível sincronizar feriados." });
    } finally {
      setHolidayBusy(false);
    }
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      const updated = await uploadTenantLogo(file);
      if (updated.logo_url) {
        setLogoPreview(`${updated.logo_url}${updated.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
      }
      await refreshWorkspace();
      setLogoMsg({ kind: "ok", text: "Logo enviado com sucesso." });
    } catch (e) {
      setLogoMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível enviar o logo." });
    } finally {
      setLogoBusy(false);
    }
  }

  async function onOpenLogo() {
    setLogoMsg(null);
    try {
      const url = await getTenantLogoSignedUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setLogoMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível abrir o logo." });
    }
  }

  async function onDeleteLogo() {
    if (!window.confirm("Excluir logo da empresa?")) return;
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      await deleteTenantLogo();
      setLogoPreview("");
      await refreshWorkspace();
      setLogoMsg({ kind: "ok", text: "Logo removido." });
    } catch (e) {
      setLogoMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível excluir o logo." });
    } finally {
      setLogoBusy(false);
    }
  }

  function onCancel() {
    if (!baseline) return;
    setForm(JSON.parse(baseline) as FormState);
    setMsg(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    setMsg(null);
    try {
      const base = JSON.parse(baseline) as FormState;
      const updatedTenant = await patchTenantAdmin({
        name: form.name.trim(),
        tax_id_kind: form.tax_id_kind,
        tax_document: digitsOnly(form.tax_document),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        address_street: form.address_street.trim() || undefined,
        address_number: form.address_number.trim() || undefined,
        address_complement: form.address_complement.trim() || undefined,
        address_district: form.address_district.trim() || undefined,
        address_city: form.address_city.trim() || undefined,
        address_state: form.address_state.trim().toUpperCase() || undefined,
        address_postal_code: digitsOnly(form.address_postal_code).slice(0, 8) || undefined,
        address_country: form.address_country.trim() || "Brasil",
        address_ibge_code: digitsOnly(form.address_ibge_code).length === 7 ? digitsOnly(form.address_ibge_code) : undefined,
        pdf_primary_color: form.pdf_primary_color.toUpperCase(),
        timezone: form.timezone.trim(),
        business_days: form.business_days,
        workday_start: form.workday_start,
        workday_end: form.workday_end,
        block_national_holidays: form.block_national_holidays,
        finance_enabled: form.finance_enabled,
        finance_mode: form.finance_mode,
      });

      const nfseChanged =
        form.dps_serie !== base.dps_serie ||
        form.prestador_inscricao_municipal !== base.prestador_inscricao_municipal ||
        form.default_codigo_tributacao_nacional !== base.default_codigo_tributacao_nacional;
      if (nfseChanged) {
        await patchNfseSettings({
          dps_serie: form.dps_serie.trim() || null,
          prestador_inscricao_municipal: form.prestador_inscricao_municipal.trim() || null,
          default_codigo_tributacao_nacional: form.default_codigo_tributacao_nacional.trim() || null,
        });
      }

      if (form.preventive_auto_remind_days_before !== base.preventive_auto_remind_days_before) {
        await patchPreventiveSettings({
          preventive_auto_remind_days_before: Math.max(0, Math.floor(form.preventive_auto_remind_days_before)),
        });
      }

      await refreshWorkspace();
      const [nfse, preventive] = await Promise.all([getNfseSettings().catch(() => null), fetchPreventiveSettings()]);
      applyTenantSnapshot(updatedTenant, nfse, preventive?.preventive_auto_remind_days_before ?? form.preventive_auto_remind_days_before);
      setMsg({ kind: "ok", text: "Dados da empresa atualizados." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.wrap} aria-labelledby="management-view-title">
      <header className={styles.pageHeader}>
        <h2 id="management-view-title" className={styles.pageTitle}>
          Gestão da empresa
        </h2>
        <p className={styles.pageLead}>
          Informações da empresa, contato, parâmetros fiscais e de operação (agenda, PMOC e documentos).
        </p>
      </header>

      <form className={styles.formStack} onSubmit={(e) => void onSave(e)}>
        <Card>
          <CardHeader>
            <CardTitle>Dados da Empresa</CardTitle>
            <CardDescription>Razão social, identificação fiscal, plano e identidade visual.</CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-name" label="Razão social">
                <Input
                  id="company-name"
                  value={form.name}
                  onChange={(e) => patchField("name", e.target.value)}
                  placeholder="Razão social"
                  required
                />
              </Field>
              <Field id="company-tax-kind" label="Tipo fiscal">
                <Select
                  id="company-tax-kind"
                  value={form.tax_id_kind}
                  onChange={(e) => patchField("tax_id_kind", e.target.value as FiscalTaxIdKind)}
                >
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                </Select>
              </Field>
              <Field id="company-tax-doc" label={form.tax_id_kind === "cpf" ? "CPF" : "CNPJ"}>
                <Input
                  id="company-tax-doc"
                  value={form.tax_document}
                  onChange={(e) => patchField("tax_document", e.target.value)}
                  placeholder={form.tax_id_kind === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                />
              </Field>
            </div>

            <div className={styles.badgeRow}>
              <span className={styles.planBadge}>Plano: {form.active_plan || "—"}</span>
              <span className={styles.statusBadge}>Status: {form.status}</span>
            </div>

            <div className={adminStyles.logoBox}>
              <div className={adminStyles.logoPreviewWrap}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo da empresa" className={adminStyles.logoPreview} />
                ) : (
                  <span className={adminStyles.logoFallback}>Sem logo</span>
                )}
              </div>
              <div className={adminStyles.logoMeta}>
                <p className={styles.hint}>Logo exibido em PDFs e documentos comerciais.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className={styles.fileInputHidden}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void onPickLogo(file);
                  }}
                />
                <div className={adminStyles.logoActions}>
                  <Button type="button" variant="outline" size="sm" disabled={logoBusy} onClick={() => fileInputRef.current?.click()}>
                    {logoBusy ? "Enviando…" : "Enviar logo"}
                  </Button>
                  {tenant.logo_s3_key ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void onOpenLogo()}>
                        Abrir
                      </Button>
                      <Button type="button" variant="destructive" size="sm" disabled={logoBusy} onClick={() => void onDeleteLogo()}>
                        Remover
                      </Button>
                    </>
                  ) : null}
                </div>
                {logoMsg?.kind === "ok" ? <p className={styles.msgOk}>{logoMsg.text}</p> : null}
                {logoMsg?.kind === "err" ? <p className={styles.msgErr}>{logoMsg.text}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações de Contato</CardTitle>
            <CardDescription>Telefone, e-mail corporativo, site e endereço principal.</CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-phone" label="Telefone">
                <Input
                  id="company-phone"
                  value={form.phone}
                  onChange={(e) => patchField("phone", e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </Field>
              <Field id="company-email" label="E-mail corporativo">
                <Input
                  id="company-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => patchField("email", e.target.value)}
                  placeholder="contato@empresa.com.br"
                />
              </Field>
              <Field id="company-website" label="Site">
                <Input
                  id="company-website"
                  value={form.website}
                  onChange={(e) => patchField("website", e.target.value)}
                  placeholder="https://"
                />
              </Field>
            </div>

            <div className={styles.cepRow}>
              <div className={`${styles.field} ${styles.cepGrow}`}>
                <label className={styles.label} htmlFor="company-cep">
                  CEP
                </label>
                <Input
                  id="company-cep"
                  value={form.address_postal_code}
                  onChange={(e) => patchField("address_postal_code", e.target.value)}
                  placeholder="00000-000"
                />
              </div>
              <Button type="button" variant="outline" disabled={cepBusy} onClick={() => void onLookupCep()}>
                {cepBusy ? "Buscando…" : "Buscar CEP"}
              </Button>
            </div>

            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-street" label="Logradouro">
                <Input id="company-street" value={form.address_street} onChange={(e) => patchField("address_street", e.target.value)} />
              </Field>
              <Field id="company-number" label="Número">
                <Input id="company-number" value={form.address_number} onChange={(e) => patchField("address_number", e.target.value)} />
              </Field>
              <Field id="company-complement" label="Complemento">
                <Input
                  id="company-complement"
                  value={form.address_complement}
                  onChange={(e) => patchField("address_complement", e.target.value)}
                />
              </Field>
              <Field id="company-district" label="Bairro">
                <Input id="company-district" value={form.address_district} onChange={(e) => patchField("address_district", e.target.value)} />
              </Field>
              <Field id="company-city" label="Cidade">
                <Input id="company-city" value={form.address_city} onChange={(e) => patchField("address_city", e.target.value)} />
              </Field>
              <Field id="company-state" label="UF">
                <Input
                  id="company-state"
                  value={form.address_state}
                  onChange={(e) => patchField("address_state", e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </Field>
              <Field
                id="company-ibge"
                label="Código IBGE (município)"
                hint="Obrigatório para NFS-e nacional; preenchido ao buscar o CEP ou informe manualmente."
              >
                <Input
                  id="company-ibge"
                  value={form.address_ibge_code}
                  onChange={(e) => patchField("address_ibge_code", e.target.value)}
                  maxLength={7}
                />
              </Field>
              <Field id="company-country" label="País">
                <Input id="company-country" value={form.address_country} onChange={(e) => patchField("address_country", e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações Fiscais &amp; PMOC</CardTitle>
            <CardDescription>
              Parâmetros de documentos, agenda, financeiro e NFS-e.{" "}
              <Link className={styles.fiscalLink} to="/app/admin?tab=fiscal">
                Abrir configurações NFS-e completas
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            {loadingExtras ? <p className={styles.hint}>Carregando parâmetros fiscais…</p> : null}

            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-pdf-color" label="Cor principal do PDF">
                <div className={styles.colorRow}>
                  <input
                    id="company-pdf-color"
                    type="color"
                    className={styles.colorPicker}
                    value={form.pdf_primary_color}
                    onChange={(e) => patchField("pdf_primary_color", e.target.value.toUpperCase())}
                  />
                  <Input
                    value={form.pdf_primary_color}
                    onChange={(e) => patchField("pdf_primary_color", e.target.value.toUpperCase())}
                    maxLength={7}
                  />
                </div>
              </Field>
              <Field id="company-timezone" label="Fuso horário (IANA)">
                <Input
                  id="company-timezone"
                  value={form.timezone}
                  onChange={(e) => patchField("timezone", e.target.value)}
                  placeholder="America/Sao_Paulo"
                />
              </Field>
              <Field id="company-preventive-days" label="Lembrete preventivo (dias antes)">
                <Input
                  id="company-preventive-days"
                  type="number"
                  min={0}
                  value={String(form.preventive_auto_remind_days_before)}
                  onChange={(e) => patchField("preventive_auto_remind_days_before", Number(e.target.value) || 0)}
                />
              </Field>
              <Field id="company-dps-serie" label="Série da DPS (NFS-e nacional)">
                <Input
                  id="company-dps-serie"
                  value={form.dps_serie}
                  onChange={(e) => patchField("dps_serie", e.target.value)}
                  placeholder="Ex.: 70000"
                  maxLength={20}
                />
              </Field>
              <Field id="company-im" label="Inscrição municipal (NFS-e)">
                <Input
                  id="company-im"
                  value={form.prestador_inscricao_municipal}
                  onChange={(e) => patchField("prestador_inscricao_municipal", e.target.value)}
                  maxLength={15}
                />
              </Field>
              <Field id="company-trib-nac" label="Código tributação nacional (padrão)">
                <Input
                  id="company-trib-nac"
                  value={form.default_codigo_tributacao_nacional}
                  onChange={(e) => patchField("default_codigo_tributacao_nacional", e.target.value)}
                  maxLength={32}
                />
              </Field>
            </div>

            <div className={`${styles.grid} ${styles.gridMd2}`}>
              <Field id="company-work-start" label="Início do expediente">
                <Input
                  id="company-work-start"
                  type="time"
                  value={form.workday_start}
                  onChange={(e) => patchField("workday_start", e.target.value)}
                />
              </Field>
              <Field id="company-work-end" label="Fim do expediente">
                <Input
                  id="company-work-end"
                  type="time"
                  value={form.workday_end}
                  onChange={(e) => patchField("workday_end", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Dias úteis">
              <div className={styles.weekdayGrid}>
                {WEEKDAY_OPTIONS.map((day) => (
                  <label key={day.value} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={businessDaySet.has(day.value)}
                      onChange={(e) => toggleBusinessDay(day.value, e.target.checked)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </Field>

            <div className={`${styles.grid} ${styles.gridMd2}`}>
              <Field id="company-finance-mode" label="Modo financeiro">
                <Select
                  id="company-finance-mode"
                  value={form.finance_mode}
                  onChange={(e) => patchField("finance_mode", e.target.value as FormState["finance_mode"])}
                >
                  <option value="basic">Básico</option>
                  <option value="intermediate">Intermediário</option>
                  <option value="management">Gestão completa</option>
                </Select>
              </Field>
              <Field label="Módulo financeiro">
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={form.finance_enabled}
                    onChange={(e) => patchField("finance_enabled", e.target.checked)}
                  />
                  Financeiro habilitado
                </label>
              </Field>
            </div>

            <div className={adminStyles.actions}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.block_national_holidays}
                  onChange={(e) => patchField("block_national_holidays", e.target.checked)}
                />
                Bloquear feriados nacionais na agenda
              </label>
              <Button type="button" variant="outline" size="sm" disabled={holidayBusy} onClick={() => void onSyncHolidays()}>
                {holidayBusy ? "Sincronizando…" : "Sincronizar feriados"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}

        <div className={styles.footerBar}>
          {isDirty ? (
            <>
              <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || loadingExtras}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </section>
  );
}
