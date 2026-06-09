import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteTenantAccount,
  deleteTenantLogo,
  fetchCurrentTenant,
  getTenantLogoSignedUrl,
  logoutRevokeRefresh,
  patchTenantAdmin,
  refreshTenantCnpjCommercial,
  resetTenantOperationalData,
  syncTenantNationalHolidays,
  uploadTenantLogo,
  type FiscalTaxIdKind,
  type TenantOut,
} from "../../api/auth";
import { clearAccessToken } from "../../lib/authStorage";
import { isHiddenAppModule } from "../../lib/hiddenAppModules";
import { formatCepInput, formatPhoneBrInput, formatTaxDocumentInput } from "../../lib/brMask";
import { fetchCepLookup } from "../../api/cep";
import { cnpjCommercialCooldownDaysRemaining, CNPJ_COMMERCIAL_COOLDOWN_DAYS } from "../../api/clients";
import { fetchPreventiveSettings, patchPreventiveSettings } from "../../api/preventiveMaintenance";
import { resolveTenantWeekdayWorkHours, type WeekdayHourSlice } from "../../lib/tenantWorkHours";
import { ToastHost } from "../../components/ToastHost";
import { Button } from "../../components/ui/button";
import { DeleteConfirmModal } from "../../components/ui/delete-confirm-modal";
import { Card, CardContent } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import { toast } from "../../lib/toast";
import styles from "./ManagementView.module.css";

function CompanyHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9h1" />
      <path d="M9 13h1" />
      <path d="M9 17h1" />
    </svg>
  );
}

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
  trade_name: string;
  state_registration: string;
  ie_indicator: "" | "1" | "2" | "9";
  cft_number: string;
  timezone: string;
  weekday_work_hours: Record<string, WeekdayHourSlice>;
  block_national_holidays: boolean;
  preventive_auto_remind_days_before: number;
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

function ieIndicatorLabel(value: string | null | undefined): string {
  if (value === "1") return "Contribuinte ICMS";
  if (value === "2") return "Isento de IE";
  if (value === "9") return "Não contribuinte";
  return "—";
}

function formatFoundedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

function formatCommercialUpdate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function tenantToForm(tenant: TenantOut, preventiveDays: number): FormState {
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
    address_postal_code: tenant.address_postal_code ? formatCepInput(tenant.address_postal_code) : "",
    address_country: tenant.address_country ?? "Brasil",
    address_ibge_code: tenant.address_ibge_code ?? "",
    trade_name: tenant.trade_name ?? "",
    state_registration: tenant.state_registration ?? "",
    ie_indicator:
      tenant.ie_indicator === "1" || tenant.ie_indicator === "2" || tenant.ie_indicator === "9"
        ? tenant.ie_indicator
        : "",
    cft_number: tenant.cft_number ?? "",
    timezone: tenant.timezone ?? "America/Sao_Paulo",
    weekday_work_hours: resolveTenantWeekdayWorkHours(tenant),
    block_national_holidays: Boolean(tenant.block_national_holidays),
    preventive_auto_remind_days_before: preventiveDays,
  };
}

function businessDaysFromSchedule(schedule: Record<string, WeekdayHourSlice>): string {
  return Object.keys(schedule)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b)
    .join(",");
}

function serializeForm(form: FormState): string {
  return JSON.stringify(form);
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
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => tenantToForm(tenant, 0));
  const [baseline, setBaseline] = useState("");
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [logoPreview, setLogoPreview] = useState(tenant.logo_url ?? "");
  const [logoBusy, setLogoBusy] = useState(false);
  const [deleteLogoOpen, setDeleteLogoOpen] = useState(false);
  const [resetSystemOpen, setResetSystemOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [destructivePassword, setDestructivePassword] = useState("");
  const [resetSystemBusy, setResetSystemBusy] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [cnpjRefreshBusy, setCnpjRefreshBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isDirty = baseline.length > 0 && serializeForm(form) !== baseline;
  const fiscalLocked = Boolean(tenant.is_verified_cnpj && tenant.tax_id_kind === "cnpj");
  const formattedTaxDocument = useMemo(() => {
    const d = digitsOnly(form.tax_document);
    if (form.tax_id_kind === "cpf" && d.length === 11) return formatTaxDocumentInput(d, "cpf");
    if (form.tax_id_kind === "cnpj" && d.length === 14) return formatTaxDocumentInput(d, "cnpj");
    return form.tax_document;
  }, [form.tax_document, form.tax_id_kind]);
  const mainActivityLabel = useMemo(() => {
    const parts = [tenant.main_activity_code, tenant.main_activity_description].filter(Boolean);
    return parts.length > 0 ? parts.join(" — ") : null;
  }, [tenant.main_activity_code, tenant.main_activity_description]);
  const cnpjCommercialCooldownDays = useMemo(
    () => cnpjCommercialCooldownDaysRemaining(tenant.last_cnpj_commercial_update),
    [tenant.last_cnpj_commercial_update],
  );
  const cnpjRefreshBlocked = cnpjCommercialCooldownDays != null && cnpjCommercialCooldownDays > 0;

  const applyTenantSnapshot = useCallback((nextTenant: TenantOut, preventiveDays: number) => {
    const next = tenantToForm(nextTenant, preventiveDays);
    setForm(next);
    setBaseline(serializeForm(next));
  }, []);

  useEffect(() => {
    setLogoPreview(tenant.logo_url ?? "");
  }, [tenant.logo_url]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingExtras(true);
      try {
        const preventive = await fetchPreventiveSettings().catch(() => null);
        if (cancelled) return;
        applyTenantSnapshot(tenant, preventive?.preventive_auto_remind_days_before ?? 0);
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
  }

  function toggleWeekday(day: number, enabled: boolean) {
    setForm((prev) => {
      const key = String(day);
      const nextHours = { ...prev.weekday_work_hours };
      if (enabled) {
        nextHours[key] = nextHours[key] ?? { start: "08:00", end: "18:00" };
      } else {
        delete nextHours[key];
      }
      return { ...prev, weekday_work_hours: nextHours };
    });
  }

  function patchWeekdayHours(day: number, patch: Partial<WeekdayHourSlice>) {
    setForm((prev) => {
      const key = String(day);
      const current = prev.weekday_work_hours[key] ?? { start: "08:00", end: "18:00" };
      return {
        ...prev,
        weekday_work_hours: {
          ...prev.weekday_work_hours,
          [key]: { ...current, ...patch },
        },
      };
    });
  }

  function applyDefaultHoursToEnabledDays(start: string, end: string) {
    if (!start || !end || end <= start) {
      toast.error("Informe início e fim válidos para aplicar o horário padrão.");
      return;
    }
    setForm((prev) => {
      const nextHours: Record<string, WeekdayHourSlice> = {};
      for (const key of Object.keys(prev.weekday_work_hours)) {
        nextHours[key] = { start, end };
      }
      return { ...prev, weekday_work_hours: nextHours };
    });
  }

  async function onLookupCep() {
    const cep = digitsOnly(form.address_postal_code);
    if (cep.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepBusy(true);
    try {
      const data = await fetchCepLookup(cep);
      setForm((prev) => ({
        ...prev,
        address_street: data.address_street ?? prev.address_street,
        address_complement: data.address_complement ?? prev.address_complement,
        address_district: data.address_district ?? prev.address_district,
        address_city: data.address_city ?? prev.address_city,
        address_state: data.address_state ?? prev.address_state,
        address_postal_code: data.address_postal_code ? formatCepInput(data.address_postal_code) : formatCepInput(cep),
        address_ibge_code: data.address_ibge_code ?? prev.address_ibge_code,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepBusy(false);
    }
  }

  async function onSyncHolidays() {
    if (!form.block_national_holidays) {
      toast.error("Ative o bloqueio de feriados nacionais para sincronizar.");
      return;
    }
    setHolidayBusy(true);
    try {
      const out = await syncTenantNationalHolidays();
      toast.success(
        out.inserted > 0
          ? `Sincronização concluída. ${out.inserted} feriado(s) novo(s) bloqueado(s) na agenda.`
          : "Sincronização concluída. Não havia novos feriados para incluir.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar feriados.");
    } finally {
      setHolidayBusy(false);
    }
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    try {
      const updated = await uploadTenantLogo(file);
      if (updated.logo_url) {
        setLogoPreview(`${updated.logo_url}${updated.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
      }
      await refreshWorkspace();
      toast.success("Logo enviado com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function onOpenLogo() {
    try {
      const url = await getTenantLogoSignedUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o logo.");
    }
  }

  async function onRefreshCnpjCommercial() {
    if (form.tax_id_kind !== "cnpj") return;
    setCnpjRefreshBusy(true);
    try {
      const updated = await refreshTenantCnpjCommercial();
      await refreshWorkspace();
      const preventive = await fetchPreventiveSettings().catch(() => null);
      applyTenantSnapshot(updated, preventive?.preventive_auto_remind_days_before ?? form.preventive_auto_remind_days_before);
      toast.success("Dados atualizados via CNPJá comercial.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar via CNPJá.");
    } finally {
      setCnpjRefreshBusy(false);
    }
  }

  async function onConfirmDeleteLogo() {
    setLogoBusy(true);
    try {
      await deleteTenantLogo();
      setLogoPreview("");
      setDeleteLogoOpen(false);
      await refreshWorkspace();
      toast.success("Logo removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  function onCancel() {
    if (!baseline) return;
    setForm(JSON.parse(baseline) as FormState);
  }

  function closeDestructiveModal(kind: "reset" | "delete") {
    if (resetSystemBusy || deleteAccountBusy) return;
    setDestructivePassword("");
    if (kind === "reset") setResetSystemOpen(false);
    else setDeleteAccountOpen(false);
  }

  async function onConfirmResetSystem() {
    if (!destructivePassword.trim()) {
      toast.error("Informe sua senha atual para confirmar.");
      return;
    }
    setResetSystemBusy(true);
    try {
      const out = await resetTenantOperationalData({ current_password: destructivePassword });
      const [updatedTenant, preventive] = await Promise.all([
        fetchCurrentTenant(),
        fetchPreventiveSettings().catch(() => null),
      ]);
      await refreshWorkspace();
      applyTenantSnapshot(updatedTenant, preventive?.preventive_auto_remind_days_before ?? 0);
      setDestructivePassword("");
      setResetSystemOpen(false);
      toast.success(out.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível restaurar o sistema.");
    } finally {
      setResetSystemBusy(false);
    }
  }

  async function onConfirmDeleteAccount() {
    if (!destructivePassword.trim()) {
      toast.error("Informe sua senha atual para confirmar.");
      return;
    }
    setDeleteAccountBusy(true);
    try {
      await deleteTenantAccount({ current_password: destructivePassword });
      await logoutRevokeRefresh();
      clearAccessToken();
      navigate("/login", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a conta.");
      setDeleteAccountBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    try {
      const base = JSON.parse(baseline) as FormState;
      const businessDays = businessDaysFromSchedule(form.weekday_work_hours);
      if (!businessDays) {
        toast.error("Selecione ao menos um dia de expediente.");
        return;
      }
      const scheduleRows = Object.values(form.weekday_work_hours);
      for (const row of scheduleRows) {
        if (!row.start || !row.end || row.end <= row.start) {
          toast.error("Cada dia ativo precisa de horário de início e fim válidos.");
          return;
        }
      }
      const firstRow = scheduleRows[0];
      const updatedTenant = await patchTenantAdmin({
        name: form.name.trim(),
        tax_id_kind: form.tax_id_kind,
        tax_document: digitsOnly(form.tax_document),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        trade_name: form.trade_name.trim() || null,
        state_registration: form.state_registration.trim() || null,
        ie_indicator: form.ie_indicator || null,
        address_street: form.address_street.trim() || undefined,
        address_number: form.address_number.trim() || undefined,
        address_complement: form.address_complement.trim() || undefined,
        address_district: form.address_district.trim() || undefined,
        address_city: form.address_city.trim() || undefined,
        address_state: form.address_state.trim().toUpperCase() || undefined,
        address_postal_code: digitsOnly(form.address_postal_code).slice(0, 8) || undefined,
        address_country: form.address_country.trim() || "Brasil",
        address_ibge_code: digitsOnly(form.address_ibge_code).length === 7 ? digitsOnly(form.address_ibge_code) : undefined,
        cft_number: form.cft_number.trim() || null,
        timezone: form.timezone.trim(),
        business_days: businessDays,
        weekday_work_hours: form.weekday_work_hours,
        workday_start: firstRow?.start ?? "08:00",
        workday_end: firstRow?.end ?? "18:00",
        block_national_holidays: form.block_national_holidays,
      });

      if (form.preventive_auto_remind_days_before !== base.preventive_auto_remind_days_before) {
        await patchPreventiveSettings({
          preventive_auto_remind_days_before: Math.max(0, Math.floor(form.preventive_auto_remind_days_before)),
        });
      }

      await refreshWorkspace();
      const preventive = await fetchPreventiveSettings().catch(() => null);
      applyTenantSnapshot(updatedTenant, preventive?.preventive_auto_remind_days_before ?? form.preventive_auto_remind_days_before);
      toast.success("Dados da empresa atualizados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${styles.wrap} ${styles.pageWithActionBar}`} aria-labelledby="management-view-title">
      <ToastHost />
      <DeleteConfirmModal
        open={deleteLogoOpen}
        onOpenChange={(open) => {
          if (!open && !logoBusy) setDeleteLogoOpen(false);
        }}
        title="Remover logo"
        description="Excluir o logo da empresa? Ele deixará de aparecer em PDFs, orçamentos e documentos comerciais."
        confirmLabel="Remover logo"
        busyLabel="Removendo…"
        busy={logoBusy}
        onConfirm={() => void onConfirmDeleteLogo()}
      />
      <DeleteConfirmModal
        open={resetSystemOpen}
        onOpenChange={(open) => {
          if (!open) closeDestructiveModal("reset");
        }}
        title="Restaurar o sistema"
        description={
          isHiddenAppModule("nfse")
            ? "Remove clientes, ordens de serviço, produtos, financeiro, agenda e demais dados operacionais. O cadastro da empresa e os usuários permanecem."
            : "Remove clientes, ordens de serviço, produtos, financeiro, agenda, NFS-e emitidas e demais dados operacionais. O cadastro da empresa e os usuários permanecem."
        }
        hint="Esta ação não pode ser desfeita. Digite sua senha atual para confirmar."
        confirmLabel="Restaurar sistema"
        busyLabel="Restaurando…"
        busy={resetSystemBusy}
        onConfirm={() => void onConfirmResetSystem()}
        detail={
          <Field id="reset-system-password" label="Senha atual">
            <Input
              id="reset-system-password"
              type="password"
              autoComplete="current-password"
              value={destructivePassword}
              onChange={(e) => setDestructivePassword(e.target.value)}
              disabled={resetSystemBusy}
            />
          </Field>
        }
      />
      <DeleteConfirmModal
        open={deleteAccountOpen}
        onOpenChange={(open) => {
          if (!open) closeDestructiveModal("delete");
        }}
        title="Excluir conta"
        description="Remove permanentemente este workspace, todos os dados e todos os usuários. Você será desconectado e não poderá recuperar o acesso."
        hint="Esta ação não pode ser desfeita. Digite sua senha atual para confirmar."
        confirmLabel="Excluir conta"
        busyLabel="Excluindo…"
        busy={deleteAccountBusy}
        onConfirm={() => void onConfirmDeleteAccount()}
        detail={
          <Field id="delete-account-password" label="Senha atual">
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={destructivePassword}
              onChange={(e) => setDestructivePassword(e.target.value)}
              disabled={deleteAccountBusy}
            />
          </Field>
        }
      />
      <header className={styles.pageHeader}>
        <nav className={styles.breadcrumb} aria-label="Navegação">
          <span className={styles.breadcrumbCurrent}>Administração</span>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Gestão da empresa</span>
        </nav>
        <div className={styles.pageHeaderMain}>
          <span className={styles.pageHeaderIcon} aria-hidden>
            <CompanyHeaderIcon />
          </span>
          <div className={styles.pageHeaderText}>
            <h1 id="management-view-title" className={styles.pageTitle}>
              Gestão da empresa
            </h1>
            <p className={styles.pageLead}>
              Informações da empresa, contato, parâmetros fiscais e de operação (agenda, PMOC e documentos).
            </p>
          </div>
        </div>
      </header>

      <form id="management-company-form" className={styles.formStack} onSubmit={(e) => void onSave(e)}>
        <Card>
          <CardContent className={styles.formStack}>
            <div className={styles.sectionHeaderRow}>
              <div>
                <h2 className={styles.sectionTitle}>Identificação da empresa</h2>
                <p className={styles.sectionLead}>
                  Razão social, documento fiscal, plano e identidade visual.
                </p>
              </div>
              {form.tax_id_kind === "cnpj" ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={cnpjRefreshBusy || cnpjRefreshBlocked}
                  title={
                    cnpjRefreshBlocked
                      ? `Consulta comercial liberada após ${CNPJ_COMMERCIAL_COOLDOWN_DAYS} dias da última atualização.`
                      : undefined
                  }
                  onClick={() => void onRefreshCnpjCommercial()}
                >
                  {cnpjRefreshBusy
                    ? "Atualizando…"
                    : cnpjRefreshBlocked
                      ? `CNPJ em ${cnpjCommercialCooldownDays} dia(s)`
                      : "Atualizar CNPJ"}
                </Button>
              ) : null}
            </div>

            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field
                id="company-name"
                label="Razão social"
                hint={fiscalLocked ? "Validada na Receita Federal — alteração bloqueada." : undefined}
              >
                <Input
                  id="company-name"
                  value={form.name}
                  onChange={(e) => patchField("name", e.target.value)}
                  placeholder="Razão social"
                  required
                  readOnly={fiscalLocked}
                  className={fiscalLocked ? styles.inputLocked : undefined}
                />
              </Field>
              <Field id="company-trade-name" label="Nome fantasia">
                <Input
                  id="company-trade-name"
                  value={form.trade_name}
                  onChange={(e) => patchField("trade_name", e.target.value)}
                  placeholder="Nome fantasia (opcional)"
                />
              </Field>
              <Field
                id="company-tax-kind"
                label="Tipo fiscal"
                hint={fiscalLocked ? "Bloqueado após validação do CNPJ." : undefined}
              >
                <Select
                  id="company-tax-kind"
                  value={form.tax_id_kind}
                  onChange={(e) => patchField("tax_id_kind", e.target.value as FiscalTaxIdKind)}
                  disabled={fiscalLocked}
                  className={fiscalLocked ? styles.inputLocked : undefined}
                >
                  <option value="cnpj">CNPJ — Pessoa jurídica</option>
                  <option value="cpf">CPF — Pessoa física</option>
                </Select>
              </Field>
              <Field
                id="company-tax-doc"
                label={form.tax_id_kind === "cpf" ? "CPF" : "CNPJ"}
                hint={fiscalLocked ? "Documento validado na Receita Federal." : undefined}
              >
                <Input
                  id="company-tax-doc"
                  value={fiscalLocked ? formattedTaxDocument : form.tax_document}
                  onChange={(e) => patchField("tax_document", e.target.value)}
                  placeholder={form.tax_id_kind === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  readOnly={fiscalLocked}
                  className={fiscalLocked ? styles.inputLocked : undefined}
                />
              </Field>
            </div>

            <div className={styles.badgeRow}>
              <span className={styles.planBadge}>Plano: {form.active_plan || "—"}</span>
              <span className={styles.statusBadge}>Status: {form.status}</span>
              {tenant.is_verified_cnpj ? (
                <span className={styles.verifiedBadge}>CNPJá verificado</span>
              ) : null}
            </div>

            {form.tax_id_kind === "cnpj" &&
            (mainActivityLabel || tenant.legal_nature || tenant.registration_status || tenant.founded_at) ? (
              <>
              <hr className={styles.sectionDivider} />
              <div className={styles.fiscalSummary}>
                <p className={styles.fiscalSummaryTitle}>Cadastro Receita Federal (CNPJá)</p>
                <dl className={styles.fiscalDl}>
                  {mainActivityLabel ? (
                    <>
                      <dt>Atividade principal (CNAE)</dt>
                      <dd>{mainActivityLabel}</dd>
                    </>
                  ) : null}
                  {tenant.legal_nature ? (
                    <>
                      <dt>Natureza jurídica</dt>
                      <dd>{tenant.legal_nature}</dd>
                    </>
                  ) : null}
                  {tenant.registration_status ? (
                    <>
                      <dt>Situação cadastral</dt>
                      <dd>{tenant.registration_status}</dd>
                    </>
                  ) : null}
                  {tenant.founded_at ? (
                    <>
                      <dt>Data de abertura</dt>
                      <dd>{formatFoundedAt(tenant.founded_at)}</dd>
                    </>
                  ) : null}
                  <dt>Última atualização CNPJá</dt>
                  <dd>
                    {formatCommercialUpdate(tenant.last_cnpj_commercial_update)}
                    {cnpjRefreshBlocked ? (
                      <span className={styles.cooldownNote}>
                        {" "}
                        — próxima consulta comercial em ~{cnpjCommercialCooldownDays} dia(s) (limite de{" "}
                        {CNPJ_COMMERCIAL_COOLDOWN_DAYS} dias).
                      </span>
                    ) : null}
                  </dd>
                </dl>
              </div>
              </>
            ) : null}

            {form.tax_id_kind === "cnpj" ? (
              <>
              <hr className={styles.sectionDivider} />
              <h3 className={styles.subsectionTitle}>Dados fiscais (empresa)</h3>
              <div className={`${styles.grid} ${styles.gridMd2}`}>
                <Field id="company-ie" label="Inscrição estadual (IE)">
                  <Input
                    id="company-ie"
                    value={form.state_registration}
                    onChange={(e) => patchField("state_registration", e.target.value)}
                    placeholder="Número da IE ou ISENTO"
                  />
                </Field>
                <Field id="company-ie-ind" label="Indicador de IE (NFe)">
                  <Select
                    id="company-ie-ind"
                    value={form.ie_indicator}
                    onChange={(e) => patchField("ie_indicator", e.target.value as FormState["ie_indicator"])}
                  >
                    <option value="">Selecione…</option>
                    <option value="1">1 — Contribuinte ICMS</option>
                    <option value="2">2 — Isento de IE</option>
                    <option value="9">9 — Não contribuinte</option>
                  </Select>
                  {form.ie_indicator ? (
                    <p className={styles.hint}>{ieIndicatorLabel(form.ie_indicator)}</p>
                  ) : null}
                </Field>
              </div>
              </>
            ) : null}

            <hr className={styles.sectionDivider} />
            <h3 className={styles.subsectionTitle}>Identidade visual</h3>
            <div className={styles.logoPanel}>
              <div className={styles.logoPreviewWrap}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo da empresa" className={styles.logoPreview} />
                ) : (
                  <span className={styles.logoFallback}>Sem logo</span>
                )}
              </div>
              <div className={styles.logoMeta}>
                <p className={styles.hint}>
                  Logo exibido em PDFs, orçamentos e documentos comerciais. Formatos: PNG, JPG, WebP ou SVG.
                </p>
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
                <div className={styles.logoActions}>
                  <Button type="button" variant="default" size="sm" disabled={logoBusy} onClick={() => fileInputRef.current?.click()}>
                    {logoBusy ? "Enviando…" : "Enviar logo"}
                  </Button>
                  {tenant.logo_s3_key ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => void onOpenLogo()}>
                        Abrir
                      </Button>
                      <Button type="button" variant="destructive" size="sm" disabled={logoBusy} onClick={() => setDeleteLogoOpen(true)}>
                        Remover
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className={styles.formStack}>
            <h2 className={styles.sectionTitle}>Contato e endereço</h2>
            <p className={styles.sectionLead}>Telefone, e-mail corporativo, site e endereço principal.</p>
            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-phone" label="Telefone">
                <Input
                  id="company-phone"
                  value={form.phone}
                  onChange={(e) => patchField("phone", formatPhoneBrInput(e.target.value))}
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
                  onChange={(e) => patchField("address_postal_code", formatCepInput(e.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                  maxLength={9}
                />
              </div>
              <Button type="button" variant="default" size="sm" disabled={cepBusy} onClick={() => void onLookupCep()}>
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
                hint={
                  isHiddenAppModule("nfse")
                    ? "Preenchido automaticamente ao buscar o CEP ou informe manualmente."
                    : "Obrigatório para NFS-e nacional; preenchido ao buscar o CEP ou informe manualmente."
                }
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
          <CardContent className={styles.formStack}>
            <h2 className={styles.sectionTitle}>Operação e agenda</h2>
            <p className={styles.sectionLead}>
              Expediente por dia da semana, fuso horário e lembretes preventivos.
              {!isHiddenAppModule("nfse") ? (
                <>
                  {" "}
                  NFS-e na{" "}
                  <Link className={styles.fiscalLink} to="/app/admin?tab=fiscal">
                    aba Fiscal
                  </Link>
                  ,
                </>
              ) : null}{" "}
              financeiro em{" "}
              <Link className={styles.fiscalLink} to="/app/finance/settings">
                Financeiro
              </Link>
              , cor dos orçamentos em{" "}
              <Link className={styles.fiscalLink} to="/app/admin?tab=orcamentos">
                Orçamentos
              </Link>
              .
            </p>
            {loadingExtras ? <p className={styles.hint}>Carregando parâmetros…</p> : null}

            <div className={`${styles.grid} ${styles.gridMd2} ${styles.gridLg3}`}>
              <Field id="company-cft-number" label="Registro Profissional (CFT/CREA)">
                <Input
                  id="company-cft-number"
                  value={form.cft_number}
                  onChange={(e) => patchField("cft_number", e.target.value)}
                  placeholder="Ex.: CFT 12345-D ou CREA-SP 123456"
                  maxLength={50}
                />
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
            </div>

            <Field
              label="Expediente por dia"
              hint="Marque os dias de atendimento e defina o horário de cada um — ex.: sábado até 12:00."
            >
              <div className={styles.weekdaySchedule}>
                {WEEKDAY_OPTIONS.map((day) => {
                  const key = String(day.value);
                  const enabled = key in form.weekday_work_hours;
                  const hours = form.weekday_work_hours[key] ?? { start: "08:00", end: "18:00" };
                  return (
                    <div key={day.value} className={styles.weekdayScheduleRow}>
                      <label className={styles.weekdayScheduleDay}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => toggleWeekday(day.value, e.target.checked)}
                        />
                        <span>{day.label}</span>
                      </label>
                      <Input
                        type="time"
                        className={styles.weekdayTimeInput}
                        value={hours.start}
                        disabled={!enabled}
                        onChange={(e) => patchWeekdayHours(day.value, { start: e.target.value })}
                        aria-label={`Início ${day.label}`}
                      />
                      <span className={styles.weekdayScheduleSep}>até</span>
                      <Input
                        type="time"
                        className={styles.weekdayTimeInput}
                        value={hours.end}
                        disabled={!enabled}
                        onChange={(e) => patchWeekdayHours(day.value, { end: e.target.value })}
                        aria-label={`Fim ${day.label}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className={styles.weekdayQuickApply}>
                <Input type="time" defaultValue="08:00" id="weekday-default-start" className={styles.weekdayTimeInput} />
                <span className={styles.weekdayScheduleSep}>até</span>
                <Input type="time" defaultValue="18:00" id="weekday-default-end" className={styles.weekdayTimeInput} />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const start = (document.getElementById("weekday-default-start") as HTMLInputElement | null)?.value;
                    const end = (document.getElementById("weekday-default-end") as HTMLInputElement | null)?.value;
                    if (start && end) applyDefaultHoursToEnabledDays(start, end);
                  }}
                >
                  Aplicar aos dias marcados
                </Button>
              </div>
            </Field>

            <div className={styles.holidayRow}>
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

        <Card className={styles.dangerCard}>
          <CardContent className={styles.dangerCardContent}>
            <h3 className={styles.dangerTitle}>Zona de perigo</h3>
            <p className={styles.dangerLead}>
              Ações irreversíveis que afetam todo o workspace. Exigem confirmação com sua senha atual.
            </p>
            <div className={styles.dangerActions}>
              <div className={styles.dangerAction}>
                <div>
                  <p className={styles.dangerActionTitle}>Restaurar o sistema</p>
                  <p className={styles.dangerActionHint}>
                    Apaga clientes, OS, estoque, financeiro, agenda e integrações operacionais. Mantém empresa e usuários.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={resetSystemBusy || deleteAccountBusy}
                  onClick={() => {
                    setDestructivePassword("");
                    setResetSystemOpen(true);
                  }}
                >
                  Restaurar sistema
                </Button>
              </div>
              <div className={styles.dangerAction}>
                <div>
                  <p className={styles.dangerActionTitle}>Excluir conta</p>
                  <p className={styles.dangerActionHint}>
                    Remove o workspace por completo, incluindo usuários e histórico. Você perderá o acesso ao Climaris.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={resetSystemBusy || deleteAccountBusy}
                  onClick={() => {
                    setDestructivePassword("");
                    setDeleteAccountOpen(true);
                  }}
                >
                  Excluir conta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      </form>

      <div className={styles.formActionBar} role="toolbar" aria-label="Ações da configuração">
        <div className={styles.formActionBarInner}>
          {isDirty ? (
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
          <Button
            type="submit"
            form="management-company-form"
            variant="default"
            disabled={saving || loadingExtras || !isDirty}
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </section>
  );
}
