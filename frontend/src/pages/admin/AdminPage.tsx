import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  createTenantUser,
  listTenantUsers,
  patchTenantAdmin,
  resetTenantUserPassword,
  syncTenantNationalHolidays,
  getTenantLogoSignedUrl,
  deleteTenantLogo,
  uploadTenantLogo,
  updateTenantUser,
  type FiscalTaxIdKind,
  type TenantStatus,
  type UserOut,
  type UserProvisionOut,
  type UserRole,
} from "../../api/auth";
import { digitsOnly, formatTaxDocumentInput, taxDocumentOnKindChange } from "../../lib/brMask";
import { formatCepInput } from "../../lib/brMask";
import { getTenantId } from "../../lib/authStorage";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import { AdminApiKeysTab } from "./AdminApiKeysTab";
import styles from "./AdminPage.module.css";

const WEEKDAYS: { v: number; label: string }[] = [
  { v: 0, label: "Seg" },
  { v: 1, label: "Ter" },
  { v: 2, label: "Qua" },
  { v: 3, label: "Qui" },
  { v: 4, label: "Sex" },
  { v: 5, label: "Sáb" },
  { v: 6, label: "Dom" },
];

type WeekdayHourConfig = {
  enabled: boolean;
  start: string;
  end: string;
};

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Manaus",
  "America/Recife",
  "America/Belem",
  "America/Cuiaba",
  "UTC",
];

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Ativa" },
  { value: "suspended", label: "Suspensa" },
  { value: "cancelled", label: "Cancelada" },
];

const MAX_BROWSER_UPLOAD_BYTES = 900 * 1024;
const BROWSER_LOGO_MAX_DIMENSION = 1200;

async function optimizeLogoForUpload(file: File): Promise<File> {
  if (file.size <= MAX_BROWSER_UPLOAD_BYTES) return file;
  if (!file.type.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível ler a imagem no navegador."));
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, BROWSER_LOGO_MAX_DIMENSION / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const qualities = [0.82, 0.74, 0.66, 0.58];
    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob) continue;
      if (blob.size <= MAX_BROWSER_UPLOAD_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "logo"}.webp`, { type: "image/webp" });
      }
    }
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "technician":
      return "Técnico";
    case "receptionist":
      return "Recepção";
    default:
      return role;
  }
}

function friendlyError(message: string): string {
  const m: Record<string, string> = {
    "User already exists for tenant.": "Já existe um usuário com este e-mail nesta empresa.",
    "Insufficient permissions.": "Sem permissão para esta ação.",
  };
  return m[message] ?? message;
}

function tabFromSearch(tabParam: string | null): "company" | "users" | "fiscal" | "apikeys" {
  if (tabParam === "usuarios" || tabParam === "users") return "users";
  if (tabParam === "fiscal") return "fiscal";
  if (tabParam === "api-keys" || tabParam === "chaves") return "apikeys";
  return "company";
}

export function AdminPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = tabFromSearch(searchParams.get("tab"));

  const [coName, setCoName] = useState("");
  const [coPlan, setCoPlan] = useState("");
  const [coTz, setCoTz] = useState("");
  const [coStatus, setCoStatus] = useState<TenantStatus>("active");
  const [coWeekdayHours, setCoWeekdayHours] = useState<Record<number, WeekdayHourConfig>>(() =>
    Object.fromEntries(WEEKDAYS.map((d) => [d.v, { enabled: false, start: "08:00", end: "18:00" }])) as Record<
      number,
      WeekdayHourConfig
    >,
  );
  const [coBlockNationalHolidays, setCoBlockNationalHolidays] = useState(true);
  const [coTaxKind, setCoTaxKind] = useState<FiscalTaxIdKind>("cnpj");
  const [coTaxDoc, setCoTaxDoc] = useState("");
  const [savingCo, setSavingCo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [syncingHolidays, setSyncingHolidays] = useState(false);
  const [coMsg, setCoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [coAddressStreet, setCoAddressStreet] = useState("");
  const [coAddressNumber, setCoAddressNumber] = useState("");
  const [coAddressComplement, setCoAddressComplement] = useState("");
  const [coAddressDistrict, setCoAddressDistrict] = useState("");
  const [coAddressCity, setCoAddressCity] = useState("");
  const [coAddressState, setCoAddressState] = useState("");
  const [coAddressPostalCode, setCoAddressPostalCode] = useState("");
  const [coAddressCountry, setCoAddressCountry] = useState("Brasil");
  const [coAddressIbgeCode, setCoAddressIbgeCode] = useState("");
  const [coPhone, setCoPhone] = useState("");
  const [coEmail, setCoEmail] = useState("");
  const [coWebsite, setCoWebsite] = useState("");
  const [coPdfPrimaryColor, setCoPdfPrimaryColor] = useState("#0B7FAF");
  const [coLogoUrl, setCoLogoUrl] = useState("");
  const [coLogoMsg, setCoLogoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deletingLogo, setDeletingLogo] = useState(false);

  const [users, setUsers] = useState<UserOut[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersErr, setUsersErr] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("receptionist");
  const [creating, setCreating] = useState(false);
  const [provisioned, setProvisioned] = useState<UserProvisionOut | null>(null);
  const [createErr, setCreateErr] = useState("");

  const [editing, setEditing] = useState<UserOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("receptionist");
  const [editActive, setEditActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [resettingPw, setResettingPw] = useState(false);
  const logoAutoRetryRef = useRef(0);
  const companyTradeName = coName.trim() || "—";

  const refreshLogoPreview = useCallback(async (): Promise<boolean> => {
    if (ctx?.tenant?.logo_url) {
      setCoLogoUrl(`${ctx.tenant.logo_url}${ctx.tenant.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
      return true;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const signedUrl = await getTenantLogoSignedUrl();
        setCoLogoUrl(`${signedUrl}${signedUrl.includes("?") ? "&" : "?"}t=${Date.now()}`);
        return true;
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 320 * (attempt + 1)));
      }
    }
    return false;
  }, [ctx?.tenant?.logo_url]);

  useEffect(() => {
    if (!ctx?.tenant) return;
    const t = ctx.tenant;
    setCoName(t.name);
    setCoPlan(t.active_plan);
    setCoTz(t.timezone);
    setCoStatus(t.status as TenantStatus);
    const fallbackStart = t.workday_start || "08:00";
    const fallbackEnd = t.workday_end || "18:00";
    const legacyDays = new Set(
      t.business_days
        .split(",")
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !Number.isNaN(n) && n >= 0 && n <= 6),
    );
    const nextWeekdayHours = Object.fromEntries(
      WEEKDAYS.map((d) => {
        const custom = t.weekday_work_hours?.[String(d.v)];
        if (custom) {
          return [d.v, { enabled: true, start: custom.start, end: custom.end }];
        }
        if (legacyDays.has(d.v)) {
          return [d.v, { enabled: true, start: fallbackStart, end: fallbackEnd }];
        }
        return [d.v, { enabled: false, start: fallbackStart, end: fallbackEnd }];
      }),
    ) as Record<number, WeekdayHourConfig>;
    setCoWeekdayHours(nextWeekdayHours);
    setCoBlockNationalHolidays(Boolean(t.block_national_holidays));
    setCoAddressStreet(t.address_street ?? "");
    setCoAddressNumber(t.address_number ?? "");
    setCoAddressComplement(t.address_complement ?? "");
    setCoAddressDistrict(t.address_district ?? "");
    setCoAddressCity(t.address_city ?? "");
    setCoAddressState(t.address_state ?? "");
    setCoAddressPostalCode(formatCepInput(t.address_postal_code ?? ""));
    setCoAddressCountry(t.address_country ?? "Brasil");
    setCoAddressIbgeCode(t.address_ibge_code ?? "");
    setCoPhone(t.phone ?? "");
    setCoEmail(t.email ?? "");
    setCoWebsite(t.website ?? "");
    setCoPdfPrimaryColor(t.pdf_primary_color ?? "#0B7FAF");
    setCoLogoUrl(t.logo_url ?? "");
    setCoTaxKind(t.tax_id_kind === "pending" ? "cnpj" : t.tax_id_kind);
    if (t.tax_id_kind === "pending") {
      setCoTaxDoc("");
    } else {
      setCoTaxDoc(
        formatTaxDocumentInput(t.tax_document, t.tax_id_kind === "cpf" ? "cpf" : "cnpj"),
      );
    }
  }, [ctx?.tenant]);

  useEffect(() => {
    if (!ctx?.tenant?.logo_s3_key) return;
    if (ctx.tenant.logo_url) return;
    let cancelled = false;
    void (async () => {
      try {
        const ok = await refreshLogoPreview();
        if (!cancelled && !ok) {
          if (ctx?.tenant?.logo_url) {
            setCoLogoUrl(`${ctx.tenant.logo_url}${ctx.tenant.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
          } else {
            setCoLogoMsg({ kind: "err", text: "Não foi possível carregar o preview do logo agora." });
          }
        }
      } catch {
        if (!cancelled) {
          if (ctx?.tenant?.logo_url) {
            setCoLogoUrl(`${ctx.tenant.logo_url}${ctx.tenant.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
          } else {
            setCoLogoMsg({ kind: "err", text: "Não foi possível carregar o preview do logo agora." });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx?.tenant?.logo_s3_key, ctx?.tenant?.logo_url, refreshLogoPreview]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersErr("");
    try {
      const list = await listTenantUsers({ limit: 200 });
      setUsers(list);
    } catch (e) {
      setUsersErr(friendlyError(e instanceof Error ? e.message : "Erro ao carregar usuários."));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") void loadUsers();
  }, [tab, loadUsers]);

  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  if (!ctx || ctx.user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  const { tenant: workspaceTenant, user: adminUser, refreshWorkspace } = ctx;

  async function onSaveCompany(e: FormEvent) {
    e.preventDefault();
    setCoMsg(null);
    const weekdayWorkHours = Object.fromEntries(
      WEEKDAYS.filter((d) => coWeekdayHours[d.v]?.enabled).map((d) => {
        const row = coWeekdayHours[d.v]!;
        return [String(d.v), { start: row.start, end: row.end }];
      }),
    );
    const enabledDays = WEEKDAYS.filter((d) => coWeekdayHours[d.v]?.enabled).map((d) => d.v);
    if (enabledDays.length === 0) {
      setCoMsg({ kind: "err", text: "Selecione ao menos um dia da semana com horário de trabalho." });
      return;
    }
    for (const d of WEEKDAYS) {
      const row = coWeekdayHours[d.v];
      if (row?.enabled && row.end <= row.start) {
        setCoMsg({ kind: "err", text: `No dia ${d.label}, o fim do expediente deve ser maior que o início.` });
        return;
      }
    }
    const enabledRows = WEEKDAYS.map((d) => coWeekdayHours[d.v]!).filter((r) => r.enabled);
    const defaultStart = enabledRows.map((r) => r.start).sort()[0] ?? "08:00";
    const defaultEnd = enabledRows.map((r) => r.end).sort().slice(-1)[0] ?? "18:00";
    const digits = digitsOnly(coTaxDoc);
    if (workspaceTenant.tax_id_kind === "pending" && digits.length < 11) {
      setCoMsg({
        kind: "err",
        text: "Informe um CPF ou CNPJ válido para concluir o cadastro fiscal da empresa.",
      });
      return;
    }
    setSavingCo(true);
    try {
      await patchTenantAdmin({
        name: coName.trim(),
        active_plan: coPlan.trim(),
        timezone: coTz.trim(),
        business_days: enabledDays.sort((a, b) => a - b).join(","),
        workday_start: defaultStart,
        workday_end: defaultEnd,
        weekday_work_hours: weekdayWorkHours,
        block_national_holidays: coBlockNationalHolidays,
        status: coStatus,
        tax_id_kind: coTaxKind,
        tax_document: digits,
        address_street: coAddressStreet.trim(),
        address_number: coAddressNumber.trim(),
        address_complement: coAddressComplement.trim(),
        address_district: coAddressDistrict.trim(),
        address_city: coAddressCity.trim(),
        address_state: coAddressState.trim().toUpperCase(),
        address_postal_code: digitsOnly(coAddressPostalCode).slice(0, 8),
        address_country: coAddressCountry.trim() || "Brasil",
        address_ibge_code: digitsOnly(coAddressIbgeCode).slice(0, 7),
        phone: coPhone.trim(),
        email: coEmail.trim(),
        website: coWebsite.trim(),
        pdf_primary_color: (coPdfPrimaryColor || "#0B7FAF").toUpperCase(),
      });
      await refreshWorkspace();
      setCoMsg({ kind: "ok", text: "Dados da empresa atualizados." });
    } catch (err) {
      setCoMsg({
        kind: "err",
        text: friendlyError(err instanceof Error ? err.message : "Não foi possível salvar."),
      });
    } finally {
      setSavingCo(false);
    }
  }

  async function onUploadLogo(file: File) {
    setCoLogoMsg(null);
    setCoMsg(null);
    setUploadingLogo(true);
    try {
      const optimized = await optimizeLogoForUpload(file);
      const tenant = await uploadTenantLogo(optimized);
      if (tenant.logo_s3_key) {
        const ok = await refreshLogoPreview();
        if (!ok) {
          if (tenant.logo_url) {
            setCoLogoUrl(`${tenant.logo_url}${tenant.logo_url.includes("?") ? "&" : "?"}t=${Date.now()}`);
          } else {
            setCoLogoMsg({ kind: "err", text: "Logo enviado, mas o preview não carregou. Tente abrir pelo ícone." });
          }
        }
      } else {
        setCoLogoUrl("");
      }
      await refreshWorkspace();
      setCoMsg({ kind: "ok", text: "Logo enviado e otimizado com sucesso." });
      setCoLogoMsg({ kind: "ok", text: "Logo enviado com sucesso." });
    } catch (err) {
      const text = friendlyError(err instanceof Error ? err.message : "Não foi possível enviar o logo.");
      setCoMsg({
        kind: "err",
        text,
      });
      setCoLogoMsg({ kind: "err", text });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onOpenLogo() {
    setCoLogoMsg(null);
    try {
      const signedUrl = await getTenantLogoSignedUrl();
      setCoLogoUrl(signedUrl);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setCoLogoMsg({
        kind: "err",
        text: friendlyError(err instanceof Error ? err.message : "Não foi possível abrir o logo."),
      });
    }
  }

  async function onDeleteLogo() {
    if (!window.confirm("Excluir logo da empresa?")) return;
    setCoLogoMsg(null);
    setDeletingLogo(true);
    try {
      await deleteTenantLogo();
      setCoLogoUrl("");
      await refreshWorkspace();
      setCoLogoMsg({ kind: "ok", text: "Logo removido com sucesso." });
    } catch (err) {
      setCoLogoMsg({
        kind: "err",
        text: friendlyError(err instanceof Error ? err.message : "Não foi possível excluir o logo."),
      });
    } finally {
      setDeletingLogo(false);
    }
  }

  async function onSyncNationalHolidays() {
    setCoMsg(null);
    if (!coBlockNationalHolidays) {
      setCoMsg({
        kind: "err",
        text: "Ative o bloqueio de feriados nacionais para sincronizar automaticamente.",
      });
      return;
    }
    setSyncingHolidays(true);
    try {
      const result = await syncTenantNationalHolidays();
      setCoMsg({
        kind: "ok",
        text:
          result.inserted > 0
            ? `Sincronização concluída. ${result.inserted} feriado(s) novo(s) bloqueado(s) na agenda.`
            : "Sincronização concluída. Não havia novos feriados para incluir.",
      });
    } catch (err) {
      setCoMsg({
        kind: "err",
        text: friendlyError(err instanceof Error ? err.message : "Não foi possível sincronizar feriados."),
      });
    } finally {
      setSyncingHolidays(false);
    }
  }

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateErr("");
    const tid = getTenantId();
    if (tid == null) {
      setCreateErr("Sessão inválida. Entre novamente.");
      return;
    }
    setCreating(true);
    try {
      const row = await createTenantUser({
        tenant_id: tid,
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
      });
      setProvisioned(row);
      setNewName("");
      setNewEmail("");
      setNewRole("receptionist");
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setCreateErr(friendlyError(err instanceof Error ? err.message : "Erro ao criar usuário."));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(u: UserOut) {
    setEditing(u);
    setEditName(u.full_name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditErr("");
  }

  async function onResetPassword() {
    if (!editing || editing.id === adminUser.id) return;
    if (
      !window.confirm(
        `Gerar nova senha temporária para ${editing.full_name}? O usuário precisará usar essa senha no próximo login e será obrigado a trocá-la.`,
      )
    ) {
      return;
    }
    setEditErr("");
    setResettingPw(true);
    try {
      const row = await resetTenantUserPassword(editing.id);
      setProvisioned(row);
      setEditing(null);
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setEditErr(friendlyError(err instanceof Error ? err.message : "Erro ao redefinir senha."));
    } finally {
      setResettingPw(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditErr("");
    setSavingUser(true);
    try {
      const isSelf = editing.id === adminUser.id;
      if (isSelf) {
        await updateTenantUser(editing.id, {
          full_name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
        });
      } else {
        await updateTenantUser(editing.id, {
          full_name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          role: editRole,
          is_active: editActive,
        });
      }
      setEditing(null);
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setEditErr(friendlyError(err instanceof Error ? err.message : "Erro ao salvar."));
    } finally {
      setSavingUser(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {tab === "company" ? (
        <section className={styles.panel} aria-labelledby="admin-co-title">
          <h2 id="admin-co-title" className={styles.panelTitle}>
            Dados da empresa
          </h2>
          <form className={styles.form} onSubmit={onSaveCompany}>
            <div className={styles.sectionCard}>
              <h3 className={styles.subsectionTitle}>Informações da empresa</h3>
              <label className={loginStyles.label} htmlFor="admin-co-name">
                Nome da empresa
              </label>
              <input
                id="admin-co-name"
                className={loginStyles.input}
                value={coName}
                onChange={(e) => setCoName(e.target.value)}
                required
                autoComplete="organization"
              />
              <div className={styles.logoBox}>
                <div className={styles.logoPreviewWrap}>
                  {coLogoUrl ? (
                    <img
                      src={coLogoUrl}
                      alt="Logo da empresa"
                      className={styles.logoPreview}
                      onError={() => {
                        if (logoAutoRetryRef.current >= 1) return;
                        logoAutoRetryRef.current += 1;
                        void refreshLogoPreview();
                      }}
                      onLoad={() => {
                        logoAutoRetryRef.current = 0;
                      }}
                    />
                  ) : (
                    <div className={styles.logoFallback}>Sem logo</div>
                  )}
                </div>
                <div className={styles.logoMeta}>
                  <div className={styles.companyIdentity}>
                    <p className={styles.identityRow}>
                      <span className={styles.identityLabel}>Nome fantasia</span>
                      <strong className={styles.identityValue}>{companyTradeName}</strong>
                    </p>
                    <p className={styles.identityRow}>
                      <span className={styles.identityLabel}>Razão social</span>
                      <strong className={styles.identityValue}>{coName.trim() || "—"}</strong>
                    </p>
                  </div>
                  <div className={styles.fiscalInlineRow}>
                    <div>
                      <label className={loginStyles.label} htmlFor="admin-co-tax-kind">
                        Tipo fiscal
                      </label>
                      <select
                        id="admin-co-tax-kind"
                        className={loginStyles.select}
                        value={coTaxKind}
                        onChange={(e) => {
                          const k = e.target.value as FiscalTaxIdKind;
                          setCoTaxKind(k);
                          setCoTaxDoc((prev) => taxDocumentOnKindChange(prev, k));
                        }}
                      >
                        <option value="cnpj">CNPJ</option>
                        <option value="cpf">CPF</option>
                      </select>
                    </div>
                    <div>
                      <label className={loginStyles.label} htmlFor="admin-co-tax-doc">
                        Documento
                      </label>
                      <input
                        id="admin-co-tax-doc"
                        className={loginStyles.input}
                        value={coTaxDoc}
                        onChange={(e) => setCoTaxDoc(formatTaxDocumentInput(e.target.value, coTaxKind))}
                        inputMode="numeric"
                        maxLength={coTaxKind === "cpf" ? 14 : 18}
                        autoComplete="off"
                        placeholder={
                          workspaceTenant.tax_id_kind === "pending"
                            ? "Conclua o cadastro fiscal"
                            : coTaxKind === "cpf"
                              ? "000.000.000-00"
                              : "00.000.000/0001-00"
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.logoActions}>
                    <label className={styles.iconBtn} htmlFor="admin-co-logo" title={uploadingLogo ? "Enviando logo..." : "Enviar logo"} aria-label={uploadingLogo ? "Enviando logo..." : "Enviar logo"}>
                      <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
                        <path d="M5 20h14a1 1 0 0 0 1-1v-4h-2v3H6v-3H4v4a1 1 0 0 0 1 1Zm7-16 5 5h-3v6h-4V9H7l5-5Z" />
                      </svg>
                    </label>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Abrir logo"
                      aria-label="Abrir logo"
                      onClick={() => void onOpenLogo()}
                      disabled={!coLogoUrl || uploadingLogo || deletingLogo}
                    >
                      <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
                        <path d="M14 4h6v6h-2V7.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V4Zm4 14H6V6h6V4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6h-2v6Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtnDanger}
                      title={deletingLogo ? "Excluindo logo..." : "Excluir logo"}
                      aria-label={deletingLogo ? "Excluindo logo..." : "Excluir logo"}
                      onClick={() => void onDeleteLogo()}
                      disabled={!coLogoUrl || uploadingLogo || deletingLogo}
                    >
                      <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
                        <path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Zm-1 12h12a2 2 0 0 0 2-2V8H4v11a2 2 0 0 0 2 2Z" />
                      </svg>
                    </button>
                  </div>
                  <input
                    id="admin-co-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={styles.hiddenInput}
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUploadLogo(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  {coLogoMsg?.kind === "ok" ? <p className={styles.msgOkInline}>{coLogoMsg.text}</p> : null}
                  {coLogoMsg?.kind === "err" ? <p className={styles.msgErrInline}>{coLogoMsg.text}</p> : null}
                </div>
              </div>
              <div className={styles.row2}>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-pdf-color">
                    Cor principal do PDF
                  </label>
                  <div className={styles.colorRow}>
                    <input
                      id="admin-co-pdf-color"
                      type="color"
                      className={styles.colorInput}
                      value={coPdfPrimaryColor}
                      onChange={(e) => setCoPdfPrimaryColor(e.target.value.toUpperCase())}
                    />
                    <input
                      className={loginStyles.input}
                      value={coPdfPrimaryColor}
                      onChange={(e) => setCoPdfPrimaryColor(e.target.value.toUpperCase())}
                      placeholder="#0B7FAF"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.row2}>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-phone">
                    Telefone da empresa
                  </label>
                  <input
                    id="admin-co-phone"
                    className={loginStyles.input}
                    value={coPhone}
                    onChange={(e) => setCoPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-email">
                    E-mail da empresa
                  </label>
                  <input
                    id="admin-co-email"
                    className={loginStyles.input}
                    value={coEmail}
                    onChange={(e) => setCoEmail(e.target.value)}
                    type="email"
                    placeholder="contato@suaempresa.com"
                  />
                </div>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-website">
                    Site da empresa
                  </label>
                  <input
                    id="admin-co-website"
                    className={loginStyles.input}
                    value={coWebsite}
                    onChange={(e) => setCoWebsite(e.target.value)}
                    placeholder="www.suaempresa.com.br"
                  />
                </div>
              </div>
              <div className={styles.row2}>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-plan">
                    Plano ativo
                  </label>
                  <input
                    id="admin-co-plan"
                    className={loginStyles.input}
                    value={coPlan}
                    onChange={(e) => setCoPlan(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={loginStyles.label} htmlFor="admin-co-status">
                    Situação
                  </label>
                  <select
                    id="admin-co-status"
                    className={loginStyles.select}
                    value={coStatus}
                    onChange={(e) => setCoStatus(e.target.value as TenantStatus)}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={styles.sectionCard}>
            <h3 className={styles.subsectionTitle}>Endereço da empresa</h3>
            <div className={styles.row2}>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-cep">
                  CEP
                </label>
                <input
                  id="admin-co-cep"
                  className={loginStyles.input}
                  value={coAddressPostalCode}
                  onChange={(e) => setCoAddressPostalCode(formatCepInput(e.target.value))}
                  maxLength={9}
                  placeholder="00000-000"
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-street">
                  Logradouro
                </label>
                <input id="admin-co-street" className={loginStyles.input} value={coAddressStreet} onChange={(e) => setCoAddressStreet(e.target.value)} />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-number">
                  Número
                </label>
                <input id="admin-co-number" className={loginStyles.input} value={coAddressNumber} onChange={(e) => setCoAddressNumber(e.target.value)} />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-complement">
                  Complemento
                </label>
                <input
                  id="admin-co-complement"
                  className={loginStyles.input}
                  value={coAddressComplement}
                  onChange={(e) => setCoAddressComplement(e.target.value)}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-district">
                  Bairro
                </label>
                <input id="admin-co-district" className={loginStyles.input} value={coAddressDistrict} onChange={(e) => setCoAddressDistrict(e.target.value)} />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-city">
                  Cidade
                </label>
                <input id="admin-co-city" className={loginStyles.input} value={coAddressCity} onChange={(e) => setCoAddressCity(e.target.value)} />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-state">
                  UF
                </label>
                <input
                  id="admin-co-state"
                  className={loginStyles.input}
                  value={coAddressState}
                  onChange={(e) => setCoAddressState(e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-country">
                  País
                </label>
                <input
                  id="admin-co-country"
                  className={loginStyles.input}
                  value={coAddressCountry}
                  onChange={(e) => setCoAddressCountry(e.target.value)}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="admin-co-ibge">
                  Código IBGE
                </label>
                <input
                  id="admin-co-ibge"
                  className={loginStyles.input}
                  value={coAddressIbgeCode}
                  onChange={(e) => setCoAddressIbgeCode(e.target.value)}
                  maxLength={7}
                />
              </div>
            </div>
            </div>

            <div className={styles.sectionCard}>
            <h3 className={styles.subsectionTitle}>Horário de trabalho</h3>
            <span className={loginStyles.label}>Horário específico por dia (opcional)</span>
            <div className={styles.weekdayHoursGrid}>
              {WEEKDAYS.map((d) => {
                const row = coWeekdayHours[d.v]!;
                return (
                  <div key={d.v} className={styles.weekdayHoursRow}>
                    <label className={styles.weekday}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          setCoWeekdayHours((prev) => ({
                            ...prev,
                            [d.v]: { ...prev[d.v]!, enabled: e.target.checked },
                          }))
                        }
                      />
                      {d.label}
                    </label>
                    <input
                      className={loginStyles.input}
                      type="time"
                      value={row.start}
                      onChange={(e) =>
                        setCoWeekdayHours((prev) => ({
                          ...prev,
                          [d.v]: { ...prev[d.v]!, start: e.target.value },
                        }))
                      }
                      disabled={!row.enabled}
                    />
                    <input
                      className={loginStyles.input}
                      type="time"
                      value={row.end}
                      onChange={(e) =>
                        setCoWeekdayHours((prev) => ({
                          ...prev,
                          [d.v]: { ...prev[d.v]!, end: e.target.value },
                        }))
                      }
                      disabled={!row.enabled}
                    />
                  </div>
                );
              })}
            </div>

            <label className={loginStyles.label} htmlFor="admin-co-tz">
              Fuso horário (IANA)
            </label>
            <input
              id="admin-co-tz"
              className={loginStyles.input}
              value={coTz}
              onChange={(e) => setCoTz(e.target.value)}
              list="tz-presets"
              required
            />
            <datalist id="tz-presets">
              {TIMEZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>

            <label className={styles.weekday}>
              <input
                type="checkbox"
                checked={coBlockNationalHolidays}
                onChange={(e) => setCoBlockNationalHolidays(e.target.checked)}
              />
              Bloquear feriados nacionais automaticamente na agenda (BrasilAPI)
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={syncingHolidays || !coBlockNationalHolidays}
                onClick={() => void onSyncNationalHolidays()}
              >
                {syncingHolidays ? "Sincronizando feriados..." : "Sincronizar feriados nacionais agora"}
              </button>
            </div>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={savingCo}>
                {savingCo ? "Salvando…" : "Salvar empresa"}
              </button>
            </div>
            {coMsg?.kind === "ok" ? <p className={styles.msgOk}>{coMsg.text}</p> : null}
            {coMsg?.kind === "err" ? <p className={styles.msgErr}>{coMsg.text}</p> : null}
          </form>
        </section>
      ) : tab === "users" ? (
        <section className={styles.panel} aria-labelledby="admin-users-title">
          <h2 id="admin-users-title" className={styles.panelTitle}>
            Usuários do workspace
          </h2>
          <p className={styles.panelLead}>
            Novos usuários recebem senha temporária e devem alterá-la no primeiro acesso. Perfis: administrador, técnico
            e recepção.
          </p>

          {provisioned ? (
            <div className={styles.provision}>
              <p className={styles.provisionTitle}>Senha temporária</p>
              <p className={styles.muted}>
                Envie este acesso com segurança para <strong>{provisioned.email}</strong> (novo usuário ou redefinição).
              </p>
              <div className={styles.provisionRow}>
                <span>Senha temporária:</span>
                <code className={styles.code}>{provisioned.temporary_password}</code>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    void navigator.clipboard.writeText(provisioned.temporary_password);
                  }}
                >
                  Copiar
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setProvisioned(null)}>
                  Ocultar
                </button>
              </div>
            </div>
          ) : null}

          <form className={styles.toolbar} onSubmit={onCreateUser}>
            <div className={styles.toolbarFields}>
              <div>
                <label className={loginStyles.label} htmlFor="nu-name">
                  Nome completo
                </label>
                <input
                  id="nu-name"
                  className={loginStyles.input}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="nu-email">
                  E-mail
                </label>
                <input
                  id="nu-email"
                  className={loginStyles.input}
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="nu-role">
                  Perfil
                </label>
                <select
                  id="nu-role"
                  className={loginStyles.select}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="receptionist">Recepção</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <button type="submit" className={styles.btnPrimary} disabled={creating}>
              {creating ? "Criando…" : "Novo usuário"}
            </button>
          </form>
          {createErr ? <p className={styles.msgErr}>{createErr}</p> : null}

          {loadingUsers ? <p className={styles.empty}>Carregando usuários…</p> : null}
          {usersErr ? <p className={styles.msgErr}>{usersErr}</p> : null}
          {!loadingUsers && !usersErr && users.length === 0 ? (
            <p className={styles.empty}>Nenhum usuário listado.</p>
          ) : null}

          {!loadingUsers && users.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>
                        {u.is_active ? <span className={styles.badgeOn}>Ativo</span> : <span className={styles.badgeOff}>Inativo</span>}
                        {u.must_change_password ? (
                          <span className={styles.muted} title="Deve alterar a senha no próximo login">
                            {" "}
                            · senha provisória
                          </span>
                        ) : null}
                      </td>
                      <td className={styles.userActionsCell}>
                        {u.role === "technician" ? (
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => navigate(`/app/agenda?technician_id=${u.id}&mode=config`)}
                          >
                            Agenda
                          </button>
                        ) : null}
                        <button type="button" className={styles.btnGhost} onClick={() => openEdit(u)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : tab === "apikeys" ? (
        <AdminApiKeysTab />
      ) : (
        <section className={styles.panel} aria-labelledby="admin-fiscal-title">
          <h2 id="admin-fiscal-title" className={styles.panelTitle}>
            Configurações fiscais
          </h2>
          <p className={styles.panelLead}>
            Este espaço centraliza regras fiscais e integrações de emissão. A configuração detalhada estará disponível
            em breve.
          </p>
          <p className={styles.empty}>Módulo fiscal em breve.</p>
        </section>
      )}

      {editing ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setEditing(null)}
          />
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
          >
            <h3 id="edit-user-title" className={styles.modalTitle}>
              Editar usuário
            </h3>
            <form className={styles.form} onSubmit={onSaveEdit}>
              <label className={loginStyles.label} htmlFor="eu-name">
                Nome completo
              </label>
              <input
                id="eu-name"
                className={loginStyles.input}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              <label className={loginStyles.label} htmlFor="eu-email">
                E-mail
              </label>
              <input
                id="eu-email"
                className={loginStyles.input}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
              <label className={loginStyles.label} htmlFor="eu-role">
                Perfil
              </label>
              <select
                id="eu-role"
                className={loginStyles.select}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                disabled={editing.id === adminUser.id}
              >
                <option value="receptionist">Recepção</option>
                <option value="technician">Técnico</option>
                <option value="admin">Administrador</option>
              </select>
              {editing.id === adminUser.id ? (
                <p className={styles.muted}>Você não pode alterar o próprio perfil aqui.</p>
              ) : null}
              <label className={styles.weekday}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={editing.id === adminUser.id}
                />
                Conta ativa
              </label>
              {editing.id === adminUser.id ? (
                <p className={styles.muted}>Não é possível desativar a própria conta.</p>
              ) : null}
              {editing.id !== adminUser.id ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={resettingPw || savingUser}
                    onClick={() => void onResetPassword()}
                  >
                    {resettingPw ? "Gerando…" : "Nova senha temporária"}
                  </button>
                </div>
              ) : null}
              {editErr ? <p className={styles.msgErr}>{editErr}</p> : null}
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary} disabled={savingUser}>
                  {savingUser ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
