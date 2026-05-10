import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { digitsOnlyPhoneForApi, formatPhoneBrDisplay, formatPhoneBrInput } from "../../lib/brMask";
import {
  createClientEquipment,
  listClientEquipments,
  listClients,
  type ClientOut,
  type EquipmentOut,
} from "../../api/clients";
import { listProducts, type ProductOut } from "../../api/products";
import {
  approveServiceOrder,
  createServiceOrder,
  getServiceOrder,
  getRescheduleOptions,
  getTechnicianNextSlots,
  getTechniciansAvailability,
  listSchedules,
  patchServiceOrderDiscount,
  patchServiceOrderStatus,
  rescheduleSchedule,
  splitServiceOrderServiceItem,
  updateServiceOrderItemEquipment,
  type ServiceOrderOut,
  type RescheduleOptionOut,
  type ScheduleOut,
  type SuggestedSlotOut,
  type TechnicianAvailabilityOut,
} from "../../api/serviceOrders";
import {
  listTenantHolidays,
  listUnavailability,
  listWorkWindows,
  type Unavailability,
} from "../../api/technicianCalendar";
import { listServices, type ServiceOut } from "../../api/services";
import {
  createFinanceEntry,
  getFinanceSettings,
  listFinanceAccounts,
  listFinanceCategories,
  listFinanceEntries,
  listFinancePaymentFees,
  type FinanceEntryOut,
  type FinancePaymentFeeOut,
  type FinanceSettingsOut,
  type FinanceEntryStatus,
} from "../../api/finance";
import { sendWhatsappAppointmentReminder } from "../../api/whatsapp";
import { registerPreventiveFromServiceOrder } from "../../api/preventiveMaintenance";
import { sortByNameAsc } from "../../lib/localeSort";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./ServiceOrderFormPage.module.css";

type SelectedService = {
  /** Identifica linhas na UI (várias linhas podem ter o mesmo service_id). */
  lineId: string;
  service_item_id?: number;
  service_id: number;
  quantity: number;
  equipment_id?: number;
};

function newLineId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ln-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SelectedProduct = {
  product_id: number;
  quantity: number;
};

type SplitOption = {
  days: number;
  minutesPerDay: number;
};

type OsTab = "combined" | "planning" | "closing" | "technical" | "finance";
type NavigationApp = "google" | "waze" | "apple";
type NavigationPreference = NavigationApp | "ask";

const NAVIGATION_PREF_KEY = "service_order_navigation_app_pref";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatMinutes(value: number): string {
  if (value <= 0) return "0 min";
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDateInput(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Seg=0 … Dom=6 (igual TechnicianSchedulePage / API de jornada). */
function jsDateToServiceWeekday(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

function dayKeyOverlapsUnavailability(dayYmd: string, startsAt: string, endsAt: string): boolean {
  const dayStart = new Date(`${dayYmd}T00:00:00`);
  const dayEnd = new Date(`${dayYmd}T23:59:59.999`);
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return s <= dayEnd && e >= dayStart;
}

function statusLabel(status: string | undefined): string {
  if (!status) return "Em rascunho";
  const map: Record<string, string> = {
    open: "Rascunho",
    approved: "Aprovada",
    scheduled: "Agendada",
    in_progress: "Em andamento",
    done: "Concluída",
    cancelled: "Cancelada",
  };
  return map[status] ?? status;
}

function appendObservationLine(existing: string, source: "App" | "WhatsApp", message: string): string {
  const ts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const line = `[${ts} — ${source}] ${message}`;
  const base = existing.trim();
  return base ? `${base}\n${line}` : line;
}

function clientPreferredContact(client: ClientOut | undefined): string {
  if (!client) return "—";
  const wa = (client.whatsapp ?? "").trim();
  if (wa) return formatPhoneBrDisplay(wa);
  const ph = (client.phone ?? "").trim();
  if (ph) return formatPhoneBrDisplay(ph);
  const em = (client.email ?? "").trim();
  return em || "—";
}

function formatClientAddress(client: ClientOut | undefined): string {
  if (!client) return "Cliente não selecionado.";
  const parts = [
    client.address_street,
    client.address_number,
    client.address_complement,
    client.address_district,
    client.address_city,
    client.address_state,
    client.address_postal_code,
  ]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(" - ") : "Endereço não informado no cadastro.";
}

function hasClientAddress(client: ClientOut | undefined): boolean {
  if (!client) return false;
  const parts = [
    client.address_street,
    client.address_number,
    client.address_complement,
    client.address_district,
    client.address_city,
    client.address_state,
    client.address_postal_code,
  ]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.length > 0;
}

function getNavigationPreference(): NavigationPreference {
  const raw = localStorage.getItem(NAVIGATION_PREF_KEY);
  if (raw === "google" || raw === "waze" || raw === "apple" || raw === "ask") return raw;
  return "ask";
}

function setNavigationPreference(value: NavigationPreference): void {
  localStorage.setItem(NAVIGATION_PREF_KEY, value);
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function navigationLabel(app: NavigationApp): string {
  if (app === "google") return "Google Maps";
  if (app === "waze") return "Waze";
  return "Apple Maps";
}

function buildNavigationUrl(app: NavigationApp, address: string): string {
  const q = encodeURIComponent(address);
  if (app === "google") return `https://www.google.com/maps/search/?api=1&query=${q}`;
  if (app === "waze") return `https://waze.com/ul?q=${q}&navigate=yes`;
  return `https://maps.apple.com/?q=${q}`;
}

function renderHighlightedText(text: string, term: string): ReactNode {
  const q = term.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const index = lower.indexOf(q.toLowerCase());
  if (index < 0) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);
  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  );
}

function IconSearchField({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTabFile({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconTabCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconTabCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWrench({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFinanceTab({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPackageSection({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 9.4l-9-3.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUserSection({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ServiceOrderFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = useMatch({ path: "/app/service-orders/new", end: true }) != null;
  const { orderId } = useParams<{ orderId: string }>();
  const idNum = orderId ? Number(orderId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const isTechnician = ctx?.user.role === "technician";
  /** Escritório (admin ou recepção): mesma aba técnica do técnico para acompanhamento em campo. */
  const canSeeTechnicalTab = isTechnician || canEdit;
  const canUpdateStatus = canEdit || isTechnician;
  const readOnly = !canEdit;
  const tenantName = ctx?.tenant.name ?? "Sua empresa";

  const [clients, setClients] = useState<ClientOut[]>([]);
  const [services, setServices] = useState<ServiceOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [clientEquipments, setClientEquipments] = useState<EquipmentOut[]>([]);
  const [order, setOrder] = useState<ServiceOrderOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [preventiveOsDate, setPreventiveOsDate] = useState(() => formatDateInput(new Date()));
  const [preventiveOsLoading, setPreventiveOsLoading] = useState(false);
  const [preventiveOsMsg, setPreventiveOsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [clientId, setClientId] = useState("");
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [activeTab, setActiveTab] = useState<OsTab>("combined");
  const [generalNotes, setGeneralNotes] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [activeClientIndex, setActiveClientIndex] = useState(0);
  const [activeServiceIndex, setActiveServiceIndex] = useState(0);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [planningDay, setPlanningDay] = useState(() => formatDateInput(new Date()));
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianAvailabilityOut[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [slotSuggestions, setSlotSuggestions] = useState<SuggestedSlotOut[]>([]);
  const [allowOvertime, setAllowOvertime] = useState(false);
  const [technicianManuallySelected, setTechnicianManuallySelected] = useState(false);
  const [splitPlanHint, setSplitPlanHint] = useState("");
  const [splitOptions, setSplitOptions] = useState<SplitOption[]>([]);
  const [selectedSplitDays, setSelectedSplitDays] = useState<number | undefined>(undefined);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleOptions, setRescheduleOptions] = useState<RescheduleOptionOut[]>([]);
  const [selectedRescheduleOption, setSelectedRescheduleOption] = useState<RescheduleOptionOut | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showQuickEquipmentCreate, setShowQuickEquipmentCreate] = useState(false);
  const [quickEquipmentName, setQuickEquipmentName] = useState("");
  const [quickEquipmentLocation, setQuickEquipmentLocation] = useState("");
  const [creatingQuickEquipment, setCreatingQuickEquipment] = useState(false);
  const [sendingWhatsappReminder, setSendingWhatsappReminder] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [calendarMonthYM, setCalendarMonthYM] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [scheduleCountsByDay, setScheduleCountsByDay] = useState<Record<string, number>>({});
  const [planningHolidayKeys, setPlanningHolidayKeys] = useState<Set<string>>(() => new Set());
  const [planningWorkWeekdays, setPlanningWorkWeekdays] = useState<Set<number>>(() => new Set());
  const [planningUnavailability, setPlanningUnavailability] = useState<Unavailability[]>([]);
  const [navigationPreference, setNavigationPreferenceState] = useState<NavigationPreference>(() => getNavigationPreference());
  const [navigationChooserAddress, setNavigationChooserAddress] = useState<string | null>(null);
  const [rememberNavigationChoice, setRememberNavigationChoice] = useState(true);

  const [osFinLoading, setOsFinLoading] = useState(false);
  const [osFinSettings, setOsFinSettings] = useState<FinanceSettingsOut | null>(null);
  const [osFinExisting, setOsFinExisting] = useState<FinanceEntryOut[]>([]);
  const [osFinAccounts, setOsFinAccounts] = useState<Awaited<ReturnType<typeof listFinanceAccounts>>>([]);
  const [osFinFees, setOsFinFees] = useState<FinancePaymentFeeOut[]>([]);
  const [osFinCategories, setOsFinCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [osFinPaymentMethod, setOsFinPaymentMethod] = useState("pix");
  const [osFinPaymentProvider, setOsFinPaymentProvider] = useState("");
  const [osFinAmount, setOsFinAmount] = useState("");
  const [osFinDueDate, setOsFinDueDate] = useState(() => formatDateInput(new Date()));
  const [osFinCompetenceDate, setOsFinCompetenceDate] = useState(() => formatDateInput(new Date()));
  const [osFinSettlementPlan, setOsFinSettlementPlan] = useState<"same_as_due" | "next_business_day">("same_as_due");
  const [osFinInstallments, setOsFinInstallments] = useState("1");
  const [osFinInstallmentInterval, setOsFinInstallmentInterval] = useState("1");
  const [osFinAccountId, setOsFinAccountId] = useState("");
  const [osFinCategoryId, setOsFinCategoryId] = useState("");
  const [osFinEntryStatus, setOsFinEntryStatus] = useState<FinanceEntryStatus>("paid");
  const [osFinRecipientWhatsapp, setOsFinRecipientWhatsapp] = useState("");
  const [osFinSubmitting, setOsFinSubmitting] = useState(false);
  const [osFinFeePercent, setOsFinFeePercent] = useState("0");
  const [osFinFeeFixed, setOsFinFeeFixed] = useState("0");

  const osFinShowMachineField =
    osFinPaymentMethod === "credit_card" || osFinPaymentMethod === "debit_card";
  const osFinShowBankAccountField =
    osFinPaymentMethod === "pix" || osFinPaymentMethod === "boleto" || osFinPaymentMethod === "cash";
  const osFinShowInstallmentsField = osFinPaymentMethod === "credit_card" || osFinPaymentMethod === "boleto";

  const osFinProviderSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of osFinFees) {
      const name = f.provider_name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [osFinFees]);

  const servicesMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const productsMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const estimatedMinutes = useMemo(
    () =>
      selectedServices.reduce((sum, item) => {
        const service = servicesMap.get(item.service_id);
        return sum + Math.max(item.quantity, 1) * Math.max(service?.duration_minutes ?? 0, 0);
      }, 0),
    [selectedServices, servicesMap],
  );

  const estimatedServiceValue = useMemo(
    () =>
      selectedServices.reduce((sum, item) => {
        const service = servicesMap.get(item.service_id);
        return sum + Math.max(item.quantity, 1) * Number(service?.price ?? 0);
      }, 0),
    [selectedServices, servicesMap],
  );

  const estimatedProductValue = useMemo(
    () =>
      selectedProducts.reduce((sum, item) => {
        const product = productsMap.get(item.product_id);
        return sum + Math.max(item.quantity, 1) * Number(product?.unit_price ?? 0);
      }, 0),
    [selectedProducts, productsMap],
  );
  const grandTotal = estimatedServiceValue + estimatedProductValue;
  const grandTotalPayable = useMemo(
    () => Math.max(0, grandTotal - Math.max(0, discountAmount)),
    [grandTotal, discountAmount],
  );
  const hasActiveSchedule = Boolean(order?.schedule && order.schedule.status !== "cancelled");
  const showConclusaoTab = useMemo(() => {
    if (isNew || !order) return false;
    if (order.status === "cancelled") return false;
    if (order.status === "done") return true;
    if (!hasActiveSchedule) return false;
    return (
      order.status === "scheduled" ||
      order.status === "in_progress" ||
      (order.status === "approved" && hasActiveSchedule)
    );
  }, [isNew, order, hasActiveSchedule]);

  useEffect(() => {
    setPreventiveOsDate(formatDateInput(new Date()));
    setPreventiveOsMsg(null);
  }, [order?.id]);

  const showFinanceiroTab = Boolean(canEdit && !isNew && order?.status === "done");
  /** Primeiro agendamento: sugestões, calendário e aprovar na agenda. */
  const showPlanningPreSchedule = useMemo(() => {
    if (isNew || !order) return false;
    if (order.status === "done" || order.status === "cancelled") return false;
    return !hasActiveSchedule;
  }, [isNew, order, hasActiveSchedule]);
  /** Já existe agendamento ativo: nesta aba fica só remarcação (recepção/admin). */
  const showPlanningReschedule = useMemo(() => {
    if (isNew || !order) return false;
    if (order.status === "done" || order.status === "cancelled") return false;
    return hasActiveSchedule;
  }, [isNew, order, hasActiveSchedule]);
  const planningCalendar = useMemo(() => {
    const [ys, ms] = calendarMonthYM.split("-");
    const calendarYear = Number(ys);
    const calendarMonth = Number(ms);
    if (!Number.isFinite(calendarYear) || !Number.isFinite(calendarMonth)) {
      const d = new Date();
      return {
        calendarYear: d.getFullYear(),
        calendarMonth: d.getMonth() + 1,
        cells: [] as (number | null)[],
        monthTitle: "",
      };
    }
    const first = new Date(calendarYear, calendarMonth - 1, 1);
    const mondayIndex = (first.getDay() + 6) % 7;
    const dim = new Date(calendarYear, calendarMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < mondayIndex; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(first);
    return { calendarYear, calendarMonth, cells, monthTitle };
  }, [calendarMonthYM]);
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(clientId)),
    [clients, clientId],
  );
  const selectedClientAddress = useMemo(() => formatClientAddress(selectedClient), [selectedClient]);
  const canOpenNavigation = useMemo(() => hasClientAddress(selectedClient), [selectedClient]);
  const navigationApps = useMemo<NavigationApp[]>(
    () => (isIosDevice() ? ["google", "waze", "apple"] : ["google", "waze"]),
    [],
  );
  const linkedEquipmentCount = useMemo(
    () => selectedServices.filter((row) => row.equipment_id && row.equipment_id > 0).length,
    [selectedServices],
  );
  const hasMultiUnitLine = useMemo(
    () => selectedServices.some((s) => (s.quantity ?? 1) > 1),
    [selectedServices],
  );
  const everyUnitLinkedToEquipment = useMemo(
    () =>
      selectedServices.length > 0 &&
      selectedServices.every((s) => (s.quantity ?? 1) <= 1 && s.equipment_id && s.equipment_id > 0),
    [selectedServices],
  );
  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    const rows = !term
      ? clients
      : clients.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            String(c.id).includes(term) ||
            (c.document ?? "").toLowerCase().includes(term),
        );
    return sortByNameAsc(rows);
  }, [clients, clientSearch]);
  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLowerCase();
    const rows = services.filter((s) => !selectedServices.some((sel) => sel.service_id === s.id));
    const filtered = !term
      ? rows
      : rows.filter(
          (s) =>
            s.name.toLowerCase().includes(term) ||
            (s.description ?? "").toLowerCase().includes(term),
        );
    return sortByNameAsc(filtered);
  }, [services, serviceSearch, selectedServices]);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const rows = products.filter((p) => !selectedProducts.some((sel) => sel.product_id === p.id));
    const filtered = !term
      ? rows
      : rows.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
    return sortByNameAsc(filtered);
  }, [products, productSearch, selectedProducts]);
  const visibleClients = useMemo(
    () => (clientDropdownOpen ? filteredClients.slice(0, 8) : []),
    [filteredClients, clientDropdownOpen],
  );
  const visibleServices = useMemo(
    () => (serviceDropdownOpen ? filteredServices.slice(0, 8) : []),
    [filteredServices, serviceDropdownOpen],
  );
  const visibleProducts = useMemo(
    () => (productDropdownOpen ? filteredProducts.slice(0, 8) : []),
    [filteredProducts, productDropdownOpen],
  );

  useEffect(() => {
    setActiveClientIndex(0);
  }, [clientSearch]);
  useEffect(() => {
    setActiveServiceIndex(0);
  }, [serviceSearch]);
  useEffect(() => {
    setActiveProductIndex(0);
  }, [productSearch]);

  useEffect(() => {
    if (!order || (activeTab !== "planning" && activeTab !== "closing" && activeTab !== "technical")) return;
    let cancelled = false;
    void (async () => {
      setLoadingTechnicians(true);
      try {
        const dayForAvailability = startsAtLocal ? startsAtLocal.slice(0, 10) : planningDay;
        const availability = await getTechniciansAvailability(dayForAvailability);
        if (cancelled) return;
        setTechnicianOptions(availability.technicians);
        if (availability.technicians.length > 0 && !selectedTechnicianId && !order.schedule) {
          setSelectedTechnicianId(String(availability.technicians[0]!.technician_id));
        }
      } catch (e) {
        if (cancelled) return;
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar tecnicos." });
      } finally {
        if (!cancelled) setLoadingTechnicians(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, order, planningDay, selectedTechnicianId, startsAtLocal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const [nextClients, nextServices, nextProducts] = await Promise.all([
          listClients({ limit: 100 }),
          listServices({ limit: 100 }),
          listProducts({ limit: 100 }),
        ]);
        if (cancelled) return;
        setClients(nextClients);
        setServices(nextServices.filter((s) => s.is_active || !isNew));
        setProducts(nextProducts.filter((p) => p.is_active || !isNew));

        if (isNew) {
          if (!cancelled) setOrder(null);
        } else if (Number.isFinite(idNum) && idNum > 0) {
          try {
            let loaded = await getServiceOrder(idNum, { bustCache: true });
            if (cancelled) return;
            try {
              if (isTechnician) {
                while (
                  loaded.status !== "done" &&
                  loaded.status !== "cancelled" &&
                  loaded.service_items.some((i) => (i.quantity ?? 1) > 1)
                ) {
                  const fat = loaded.service_items.find((i) => (i.quantity ?? 1) > 1);
                  if (!fat) break;
                  loaded = await splitServiceOrderServiceItem(loaded.id, fat.id);
                  if (cancelled) break;
                }
              }
            } catch (normErr) {
              if (!cancelled) {
                setMsg({
                  kind: "err",
                  text:
                    normErr instanceof Error
                      ? normErr.message
                      : "Não foi possível separar automaticamente as unidades (confira se a API foi publicada).",
                });
              }
            }
            if (cancelled) return;
            setOrder(loaded);
          } catch {
            if (cancelled) return;
            setLoadErr("OS não encontrada.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idNum, isNew, isTechnician]);

  useEffect(() => {
    if (!isNew) return;
    const q = searchParams.get("client_id");
    if (!q) return;
    const cid = Number(q);
    if (!Number.isFinite(cid) || cid < 1) return;
    setClientId(String(cid));
  }, [isNew, searchParams]);

  useEffect(() => {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid < 1) {
      setClientEquipments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClientEquipments(cid, { only_active: true });
        if (!cancelled) setClientEquipments(rows.filter((row) => row.ativo));
      } catch {
        if (!cancelled) setClientEquipments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function refreshCurrentOrder(orderIdOverride?: number) {
    const oid = orderIdOverride ?? idNum;
    if (!Number.isFinite(oid) || oid < 1) return;
    let o = await getServiceOrder(oid, { bustCache: true });
    try {
      if (isTechnician) {
        while (
          o.status !== "done" &&
          o.status !== "cancelled" &&
          o.service_items.some((i) => (i.quantity ?? 1) > 1)
        ) {
          const fat = o.service_items.find((i) => (i.quantity ?? 1) > 1);
          if (!fat) break;
          o = await splitServiceOrderServiceItem(o.id, fat.id);
        }
      }
    } catch {
      /* mantém último estado obtido */
    }
    setOrder(o);
  }

  async function handleManualSplitLines() {
    if (!order || isTerminal) return;
    setMsg(null);
    try {
      let cur = order;
      while (cur.service_items.some((i) => (i.quantity ?? 1) > 1)) {
        const fat = cur.service_items.find((i) => (i.quantity ?? 1) > 1);
        if (!fat) break;
        cur = await splitServiceOrderServiceItem(cur.id, fat.id);
      }
      setOrder(cur);
      setMsg({
        kind: "ok",
        text: "Linhas separadas (uma por unidade). Escolha um equipamento em cada linha.",
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Não foi possível separar as linhas.",
      });
    }
  }

  useEffect(() => {
    if (!order) return;
    setTechnicianManuallySelected(false);
    setClientId(String(order.client_id));
    setGeneralNotes(order.description ?? "");
    setSelectedServices(
      order.service_items.map((item) => ({
        lineId: `si-${item.id}`,
        service_item_id: item.id,
        service_id: item.service_id,
        quantity: item.quantity,
        equipment_id: item.equipment_id ?? undefined,
      })),
    );
    setSelectedProducts(order.product_items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })));
    if (order.schedule?.starts_at) {
      const d = new Date(order.schedule.starts_at);
      if (!Number.isNaN(d.getTime())) {
        const pad = (v: number) => String(v).padStart(2, "0");
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setStartsAtLocal(local);
      }
    }
    setApproveNotes(order.schedule?.notes ?? "");
  }, [order]);

  useEffect(() => {
    const techFromUrl = searchParams.get("technician_id");
    if (techFromUrl) {
      setSelectedTechnicianId(techFromUrl);
      return;
    }
    if (!order || technicianManuallySelected) return;
    const fromOrder = order.technician_ids?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
    if (fromOrder.length > 0) {
      setSelectedTechnicianId(String(fromOrder[0]));
    }
  }, [order, searchParams, technicianManuallySelected]);

  useEffect(() => {
    const startsFromQuery = searchParams.get("starts_at");
    if (startsFromQuery && (!order || !order.schedule)) {
      const d = new Date(startsFromQuery);
      if (!Number.isNaN(d.getTime())) {
        const pad = (v: number) => String(v).padStart(2, "0");
        setStartsAtLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
    if (searchParams.get("from") === "agenda") {
      setActiveTab("combined");
      setMsg({
        kind: "ok",
        text: "Horário vindo da agenda visual. Complete a OS e use Planejamento para sugerir horários e confirmar o agendamento.",
      });
    }
  }, [searchParams, order]);

  useEffect(() => {
    if (activeTab === "closing" && !showConclusaoTab) setActiveTab("combined");
  }, [activeTab, showConclusaoTab]);

  useEffect(() => {
    if (activeTab === "finance" && !showFinanceiroTab) setActiveTab("combined");
  }, [activeTab, showFinanceiroTab]);

  useEffect(() => {
    if (isTechnician && !isNew && Number.isFinite(idNum) && idNum > 0) {
      setActiveTab("technical");
    }
  }, [isTechnician, isNew, idNum]);

  useEffect(() => {
    if (isTechnician) return;
    if (isNew || searchParams.get("tab") !== "planning") return;
    setActiveTab("planning");
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete("tab");
      return n;
    }, { replace: true });
  }, [isTechnician, isNew, searchParams, setSearchParams]);

  useEffect(() => {
    if (!order || isNew) return;
    setDiscountAmount(Number(order.discount_amount ?? 0));
  }, [order?.id, order?.discount_amount, isNew]);

  useEffect(() => {
    if (activeTab !== "finance" || !order || !showFinanceiroTab) return;
    setOsFinAmount(String(grandTotalPayable));
    setOsFinDueDate(formatDateInput(new Date()));
    setOsFinCompetenceDate(formatDateInput(new Date()));
    const waRaw = (selectedClient?.whatsapp ?? selectedClient?.phone ?? "").trim();
    setOsFinRecipientWhatsapp(waRaw ? formatPhoneBrInput(waRaw) : "");
  }, [activeTab, order?.id, showFinanceiroTab, grandTotalPayable, selectedClient?.whatsapp, selectedClient?.phone]);

  useEffect(() => {
    if (activeTab !== "finance" || !order || !canEdit || !showFinanceiroTab) return;
    let cancelled = false;
    void (async () => {
      setOsFinLoading(true);
      try {
        const cfg = await getFinanceSettings();
        if (cancelled) return;
        setOsFinSettings(cfg);
        if (!cfg.finance_enabled) {
          setOsFinExisting([]);
          return;
        }
        const [entries, accs, fees, cats] = await Promise.all([
          listFinanceEntries({
            start_date: "2020-01-01",
            end_date: "2035-12-31",
            entry_type: "income",
            service_order_id: order.id,
          }),
          listFinanceAccounts(),
          listFinancePaymentFees(),
          listFinanceCategories(),
        ]);
        if (cancelled) return;
        setOsFinExisting(entries);
        setOsFinAccounts(accs);
        setOsFinFees(fees);
        setOsFinCategories(cats.map((c) => ({ id: c.id, name: c.name })));
      } catch {
        if (!cancelled) {
          setOsFinSettings(null);
          setMsg({ kind: "err", text: "Não foi possível carregar dados do financeiro." });
        }
      } finally {
        if (!cancelled) setOsFinLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, order?.id, canEdit, showFinanceiroTab]);

  useEffect(() => {
    if (osFinPaymentMethod === "cash") {
      setOsFinPaymentProvider("caixa");
    } else if (!osFinShowMachineField) {
      setOsFinPaymentProvider("");
    }
    if (!osFinShowMachineField) {
      setOsFinFeePercent("0");
      setOsFinFeeFixed("0");
    }
    if (!osFinShowBankAccountField) {
      setOsFinAccountId("");
    }
    if (!osFinShowInstallmentsField) {
      setOsFinInstallments("1");
      setOsFinInstallmentInterval("1");
    }
  }, [osFinPaymentMethod, osFinShowMachineField, osFinShowBankAccountField, osFinShowInstallmentsField]);

  useEffect(() => {
    const provider = osFinPaymentProvider.trim().toLowerCase();
    if (!provider || !osFinShowMachineField) return;
    const installmentsNum = Math.max(1, Number.parseInt(osFinInstallments || "1", 10) || 1);
    const fee = osFinFees.find(
      (x) =>
        x.is_active &&
        x.provider_name.trim().toLowerCase() === provider &&
        x.payment_method === osFinPaymentMethod &&
        x.installments === installmentsNum,
    );
    if (!fee) return;
    setOsFinFeePercent(String(fee.fee_percent));
    setOsFinFeeFixed(String(fee.fee_fixed_amount));
  }, [osFinPaymentProvider, osFinPaymentMethod, osFinInstallments, osFinFees, osFinShowMachineField]);

  useEffect(() => {
    const tid = Number(selectedTechnicianId);
    if (!Number.isFinite(tid) || tid < 1 || isNew || activeTab !== "planning" || isTechnician) {
      setScheduleCountsByDay({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listSchedules({ technician_id: tid, limit: 100 });
        if (cancelled) return;
        const [yStr, mStr] = calendarMonthYM.split("-");
        const y = Number(yStr);
        const m = Number(mStr);
        if (!Number.isFinite(y) || !Number.isFinite(m)) return;
        const counts: Record<string, number> = {};
        for (const s of rows as ScheduleOut[]) {
          const d = new Date(s.starts_at);
          if (d.getFullYear() !== y || d.getMonth() + 1 !== m) continue;
          const key = `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
        setScheduleCountsByDay(counts);
      } catch {
        if (!cancelled) setScheduleCountsByDay({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTechnicianId, calendarMonthYM, isNew, activeTab, isTechnician]);

  useEffect(() => {
    if (activeTab !== "planning" || isTechnician || isNew) {
      setPlanningHolidayKeys(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const holidays = await listTenantHolidays({ limit: 100 });
        if (cancelled) return;
        const next = new Set<string>();
        for (const h of holidays) {
          const raw = (h.holiday_date ?? "").trim().slice(0, 10);
          if (raw) next.add(raw);
        }
        setPlanningHolidayKeys(next);
      } catch {
        if (!cancelled) setPlanningHolidayKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isTechnician, isNew]);

  useEffect(() => {
    if (activeTab !== "planning" || isTechnician || isNew) {
      setPlanningWorkWeekdays(new Set());
      setPlanningUnavailability([]);
      return;
    }
    const tid = Number(selectedTechnicianId);
    if (!Number.isFinite(tid) || tid < 1) {
      setPlanningWorkWeekdays(new Set());
      setPlanningUnavailability([]);
      return;
    }
    const [yStr, mStr] = calendarMonthYM.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return;
    const lastDay = new Date(y, m, 0).getDate();
    const fromIso = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
    const toIso = new Date(y, m - 1, lastDay, 23, 59, 59, 999).toISOString();
    let cancelled = false;
    void (async () => {
      try {
        const [ww, ua] = await Promise.all([
          listWorkWindows(tid),
          listUnavailability(tid, { from_at: fromIso, to_at: toIso, limit: 100 }),
        ]);
        if (cancelled) return;
        setPlanningWorkWeekdays(new Set(ww.map((w) => w.weekday)));
        setPlanningUnavailability(ua);
      } catch {
        if (!cancelled) {
          setPlanningWorkWeekdays(new Set());
          setPlanningUnavailability([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isTechnician, isNew, selectedTechnicianId, calendarMonthYM]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (isNew && !canEdit) return <Navigate to="/app/service-orders" replace />;
  if (!isNew && (!orderId || !Number.isFinite(idNum) || idNum < 1)) return <Navigate to="/app/service-orders" replace />;

  function addService(service_id: number) {
    if (!service_id) return;
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.service_id === service_id);
      if (existing) {
        return prev.map((s) => (s.service_id === service_id ? { ...s, quantity: s.quantity + 1 } : s));
      }
      return [...prev, { lineId: newLineId(), service_id, quantity: 1 }];
    });
  }

  function addProduct(product_id: number) {
    if (!product_id) return;
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.product_id === product_id);
      if (existing) {
        return prev.map((p) => (p.product_id === product_id ? { ...p, quantity: p.quantity + 1 } : p));
      }
      return [...prev, { product_id, quantity: 1 }];
    });
  }

  async function onCreateOrder(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!isNew) return;
    if (readOnly) return;

    if (!clientId) {
      setMsg({ kind: "err", text: "Selecione um cliente." });
      return;
    }
    if (selectedServices.length === 0) {
      setMsg({ kind: "err", text: "Adicione pelo menos um serviço." });
      return;
    }

    setSaving(true);
    try {
      const selectedClient = clients.find((c) => c.id === Number(clientId));
      const generatedTitle = `OS - ${selectedClient?.name ?? `Cliente ${clientId}`}`;
      const created = await createServiceOrder({
        client_id: Number(clientId),
        title: generatedTitle,
        description: generalNotes.trim() || null,
        discount_amount: Math.max(0, discountAmount),
        services: selectedServices.map((item) => ({
          service_id: item.service_id,
          quantity: Math.max(item.quantity, 1),
          equipment_id: item.equipment_id,
        })),
        products: selectedProducts.map((item) => ({ product_id: item.product_id, quantity: Math.max(item.quantity, 1) })),
      });
      const qp = new URLSearchParams();
      qp.set("tab", "planning");
      if (startsAtLocal) qp.set("starts_at", new Date(startsAtLocal).toISOString());
      if (selectedTechnicianId) qp.set("technician_id", selectedTechnicianId);
      if (searchParams.get("from") === "agenda") qp.set("from", "agenda");
      navigate(`/app/service-orders/${created.id}?${qp.toString()}`, { replace: true });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao criar OS." });
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitOsFinance() {
    if (!order || !showFinanceiroTab || !osFinSettings?.finance_enabled) return;
    const amountNum = Number(osFinAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setMsg({ kind: "err", text: "Informe um valor válido." });
      return;
    }
    const installmentsNum = osFinShowInstallmentsField
      ? Math.max(1, Number.parseInt(osFinInstallments || "1", 10) || 1)
      : 1;
    const feeMatched = osFinFees.find(
      (x) =>
        x.is_active &&
        x.provider_name.trim().toLowerCase() === osFinPaymentProvider.trim().toLowerCase() &&
        x.payment_method === osFinPaymentMethod &&
        x.installments === installmentsNum,
    );
    const feePercentNum = feeMatched ? Number(feeMatched.fee_percent || 0) : Number(osFinFeePercent || "0");
    const feeFixedNum = feeMatched ? Number(feeMatched.fee_fixed_amount || 0) : Number(osFinFeeFixed || "0");
    const feeCalculated = amountNum * (feePercentNum / 100) + feeFixedNum;
    const wa = digitsOnlyPhoneForApi(osFinRecipientWhatsapp);
    const desc = `Receita OS #${order.id} — ${selectedClient?.name ?? "Cliente"}`.slice(0, 180);

    setOsFinSubmitting(true);
    setMsg(null);
    try {
      await createFinanceEntry({
        description: desc,
        entry_type: "income",
        amount: amountNum,
        payment_method: osFinPaymentMethod || null,
        payment_provider: osFinPaymentProvider.trim() || null,
        fee_percent: feePercentNum,
        fee_fixed_amount: feeFixedNum,
        fee_amount: feeCalculated,
        recipient_whatsapp: wa.length >= 10 ? wa : null,
        installments: installmentsNum,
        installment_interval_months: installmentsNum > 1 ? Number(osFinInstallmentInterval || "1") : 1,
        finance_account_id: osFinAccountId ? Number(osFinAccountId) : null,
        due_date: osFinDueDate,
        competence_date: osFinCompetenceDate,
        ...(osFinShowMachineField ? { settlement_plan: osFinSettlementPlan } : {}),
        category_id: osFinCategoryId ? Number(osFinCategoryId) : null,
        status: osFinEntryStatus,
        service_order_id: order.id,
      });
      const entries = await listFinanceEntries({
        start_date: "2020-01-01",
        end_date: "2035-12-31",
        entry_type: "income",
        service_order_id: order.id,
      });
      setOsFinExisting(entries);
      setMsg({ kind: "ok", text: "Lançamento registrado no financeiro." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao registrar no financeiro." });
    } finally {
      setOsFinSubmitting(false);
    }
  }

  async function persistDiscount(next: number) {
    if (!order || !canEdit || isNew) return;
    const v = Math.max(0, Number(next) || 0);
    setMsg(null);
    try {
      const refreshed = await patchServiceOrderDiscount(order.id, v);
      setOrder(refreshed);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar desconto." });
    }
  }

  async function onCreateEquipmentFromOs() {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid < 1) {
      setMsg({ kind: "err", text: "Selecione um cliente antes de criar equipamento." });
      return;
    }
    if (!quickEquipmentName.trim()) {
      setMsg({ kind: "err", text: "Informe a identificação do equipamento." });
      return;
    }
    setCreatingQuickEquipment(true);
    setMsg(null);
    try {
      await createClientEquipment(cid, {
        tipo: "AR_CONDICIONADO",
        identificacao: quickEquipmentName.trim(),
        local_instalacao: quickEquipmentLocation.trim() || undefined,
      });
      const rows = await listClientEquipments(cid, { only_active: true });
      setClientEquipments(rows.filter((row) => row.ativo));
      setQuickEquipmentName("");
      setQuickEquipmentLocation("");
      setShowQuickEquipmentCreate(false);
      setMsg({ kind: "ok", text: "Equipamento criado. Agora você já pode vincular nos serviços da OS." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao criar equipamento pela OS." });
    } finally {
      setCreatingQuickEquipment(false);
    }
  }

  async function onApproveOrder() {
    if (!order || readOnly) return;
    setMsg(null);
    if (!startsAtLocal) {
      setMsg({ kind: "err", text: "Informe data/hora para agendamento." });
      return;
    }
    const startsDate = new Date(startsAtLocal);
    if (Number.isNaN(startsDate.getTime())) {
      setMsg({ kind: "err", text: "Data/hora invalida." });
      return;
    }

    setApproving(true);
    try {
      const logLine = `Agendamento confirmado para ${formatDateTime(startsDate.toISOString())}.`;
      const notesPayload = appendObservationLine(approveNotes, "App", logLine);
      await approveServiceOrder(order.id, {
        starts_at: startsDate.toISOString(),
        notes: notesPayload,
        technician_ids: selectedTechnicianId ? [Number(selectedTechnicianId)] : undefined,
        allow_overtime: allowOvertime,
        split_days: selectedSplitDays,
      });
      await refreshCurrentOrder(order.id);
      setApproveNotes(notesPayload);
      setMsg({ kind: "ok", text: "OS agendada com sucesso." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao aprovar OS." });
    } finally {
      setApproving(false);
    }
  }

  function shiftPlanningMonth(delta: number) {
    const [ys, ms] = calendarMonthYM.split("-");
    let y = Number(ys);
    let m = Number(ms) + delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setCalendarMonthYM(`${y}-${String(m).padStart(2, "0")}`);
  }

  async function suggestNextSlots(fromDayOverride?: string) {
    if (!order) return;
    setMsg(null);
    const day = fromDayOverride ?? planningDay;
    const fromIso = new Date(`${day}T08:00`).toISOString();
    setLoadingSuggestions(true);
    try {
      const rows = await getTechnicianNextSlots({
        service_order_id: order.id,
        from_at: fromIso,
        technician_id: selectedTechnicianId ? Number(selectedTechnicianId) : undefined,
        limit: 4,
        allow_overtime: allowOvertime,
        split_days: selectedSplitDays,
      });
      setSlotSuggestions(rows);
      if (rows.length === 0) {
        setMsg({
          kind: "err",
          text: "Não encontramos horários disponíveis para o dia/filtro selecionado. Tente outro dia ou técnico.",
        });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao buscar sugestoes de agenda." });
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function suggestSplitPlan() {
    if (estimatedMinutes <= 0) {
      setSplitOptions([]);
      setSplitPlanHint("Adicione serviços para calcular a divisão.");
      return;
    }
    const options: SplitOption[] = [];
    const maxOptionsDays = Math.min(5, Math.max(2, Math.ceil(estimatedMinutes / 240)));
    for (let days = 2; days <= maxOptionsDays; days += 1) {
      options.push({ days, minutesPerDay: Math.ceil(estimatedMinutes / days) });
    }
    setSplitOptions(options);
    setSelectedSplitDays(undefined);
    setSplitPlanHint("Selecione uma opcao de divisao para usar no planejamento.");
  }

  function applySplitOption(option: SplitOption) {
    setAllowOvertime(false);
    setSelectedSplitDays(option.days);
    setSplitPlanHint(
      `Divisao selecionada: ${option.days} dia(s), aproximadamente ${formatMinutes(option.minutesPerDay)} por dia.`,
    );
  }

  async function onRescheduleOrder() {
    if (!order?.schedule || readOnly) return;
    setMsg(null);
    if (!startsAtLocal) {
      setMsg({ kind: "err", text: "Informe nova data/hora para remarcação." });
      return;
    }
    const startsDate = new Date(startsAtLocal);
    if (Number.isNaN(startsDate.getTime())) {
      setMsg({ kind: "err", text: "Data/hora inválida para remarcação." });
      return;
    }
    setRescheduling(true);
    try {
      const notesPayload = appendObservationLine(
        approveNotes,
        "App",
        `Remarcado para ${formatDateTime(startsDate.toISOString())}.`,
      );
      await rescheduleSchedule(order.schedule.id, {
        starts_at: startsDate.toISOString(),
        notes: notesPayload,
        technician_ids:
          technicianManuallySelected && selectedTechnicianId ? [Number(selectedTechnicianId)] : undefined,
      });
      await refreshCurrentOrder(order.id);
      setApproveNotes(notesPayload);
      if (
        selectedRescheduleOption?.status === "fracionado" &&
        selectedRescheduleOption.continuation_starts_at
      ) {
        setMsg({
          kind: "ok",
          text: `Agendamento remarcado. Continuação automática criada para ${formatDateTime(
            selectedRescheduleOption.continuation_starts_at,
          )}.`,
        });
      } else {
        setMsg({ kind: "ok", text: "Agendamento remarcado com sucesso." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao remarcar." });
    } finally {
      setRescheduling(false);
    }
  }

  async function onSuggestRescheduleOptions(fromDayOverride?: string) {
    if (!order?.schedule || readOnly) return;
    setMsg(null);
    setRescheduling(true);
    try {
      const fromDay = fromDayOverride ?? (startsAtLocal ? startsAtLocal.slice(0, 10) : planningDay);
      const options = await getRescheduleOptions(order.schedule.id, { from_day: fromDay });
      setRescheduleOptions(options);
      if (options.length === 0) {
        setMsg({ kind: "err", text: "Nenhuma opção encontrada para os próximos dias úteis." });
      } else {
        setMsg({ kind: "ok", text: "Opções de remarcação carregadas. Escolha uma opção abaixo." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao buscar opções de remarcação." });
    } finally {
      setRescheduling(false);
    }
  }

  async function onSetInProgress() {
    if (!order || !canUpdateStatus) return;
    setMsg(null);
    setStatusUpdating(true);
    try {
      const notesPayload = appendObservationLine(approveNotes, "App", "Serviço iniciado (em andamento).");
      await patchServiceOrderStatus(order.id, "in_progress", { schedule_notes: notesPayload });
      await refreshCurrentOrder(order.id);
      setApproveNotes(notesPayload);
      setMsg({ kind: "ok", text: "OS marcada como em andamento." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao atualizar status." });
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onCompleteOrder() {
    if (!order || !canUpdateStatus) return;
    setMsg(null);
    setStatusUpdating(true);
    try {
      const notesPayload = appendObservationLine(approveNotes, "App", "OS concluída (baixa no estoque).");
      await patchServiceOrderStatus(order.id, "done", { schedule_notes: notesPayload });
      await refreshCurrentOrder(order.id);
      setApproveNotes(notesPayload);
      setMsg({ kind: "ok", text: "OS concluída. Estoque atualizado conforme itens e insumos dos serviços." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao concluir OS." });
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onRegisterPreventiveFromOs() {
    if (!order || !canEdit) return;
    setPreventiveOsMsg(null);
    setPreventiveOsLoading(true);
    try {
      const rows = await registerPreventiveFromServiceOrder(order.id, {
        data_realizacao: preventiveOsDate || undefined,
      });
      setPreventiveOsMsg({
        kind: "ok",
        text:
          rows.length === 1
            ? "Registrado 1 tipo de serviço na gestão preventiva."
            : `Registrados ${rows.length} tipos de serviço na gestão preventiva.`,
      });
    } catch (e) {
      setPreventiveOsMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Falha ao registrar.",
      });
    } finally {
      setPreventiveOsLoading(false);
    }
  }

  async function onCancelOpenOrderWithoutSchedule() {
    if (!order || !canEdit || hasActiveSchedule) return;
    if (!["open", "approved"].includes(order.status)) return;
    if (!window.confirm("Cancelar esta ordem de serviço em aberto?")) return;
    setMsg(null);
    setStatusUpdating(true);
    try {
      await patchServiceOrderStatus(order.id, "cancelled");
      await refreshCurrentOrder(order.id);
      setMsg({ kind: "ok", text: "OS cancelada." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao cancelar OS." });
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onCancelScheduleAndOrder() {
    if (!order || !canEdit) return;
    if (
      !window.confirm(
        "Cancelar o agendamento e a ordem de serviço? Esta ação encerra a OS e libera a agenda vinculada.",
      )
    ) {
      return;
    }
    setMsg(null);
    setStatusUpdating(true);
    try {
      const notesPayload = appendObservationLine(approveNotes, "App", "Agendamento e OS cancelados.");
      await patchServiceOrderStatus(order.id, "cancelled", { schedule_notes: notesPayload });
      await refreshCurrentOrder(order.id);
      setApproveNotes(notesPayload);
      setMsg({ kind: "ok", text: "Agendamento e OS cancelados." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao cancelar OS." });
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onSendWhatsappReminder() {
    if (!order?.schedule || !selectedClient) return;
    const recipient = (selectedClient.whatsapp || selectedClient.phone || "").trim();
    if (!recipient) {
      setMsg({ kind: "err", text: "Cliente sem WhatsApp/telefone cadastrado para envio do lembrete." });
      return;
    }

    setMsg(null);
    setSendingWhatsappReminder(true);
    try {
      await sendWhatsappAppointmentReminder({
        recipient_whatsapp: recipient,
        nome_cliente: selectedClient.name || "Cliente",
        data_hora: formatDateTime(order.schedule.starts_at),
        empresa: tenantName,
        reference_id: order.id,
      });
      setMsg({ kind: "ok", text: "Lembrete enviado no WhatsApp do cliente." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao enviar lembrete por WhatsApp." });
    } finally {
      setSendingWhatsappReminder(false);
    }
  }

  function applyNavigationPreference(value: NavigationPreference): void {
    setNavigationPreference(value);
    setNavigationPreferenceState(value);
  }

  function openAddressInApp(app: NavigationApp, address: string): void {
    const url = buildNavigationUrl(app, address);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function onAddressClick(): void {
    if (!canOpenNavigation) return;
    if (navigationPreference === "ask") {
      setRememberNavigationChoice(true);
      setNavigationChooserAddress(selectedClientAddress);
      return;
    }
    openAddressInApp(navigationPreference, selectedClientAddress);
  }

  function onChooseNavigationApp(app: NavigationApp): void {
    if (!navigationChooserAddress) return;
    if (rememberNavigationChoice) {
      applyNavigationPreference(app);
    }
    openAddressInApp(app, navigationChooserAddress);
    setNavigationChooserAddress(null);
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando OS...</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.back} to="/app/service-orders">
          ← Voltar a lista
        </Link>
        <p className={styles.msgErr}>{loadErr}</p>
      </div>
    );
  }

  const isTerminal = order?.status === "done" || order?.status === "cancelled";

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to="/app/service-orders">
        ← Voltar a lista
      </Link>

      <div className={styles.pageIntro}>
        <h1 className={styles.title}>{isNew ? "Nova Ordem de Serviço" : `OS #${order?.id ?? ""}`}</h1>
        {isNew ? (
          <p className={styles.lead}>
            Preencha os dados do cliente, inclua serviços e produtos e avance para o planejamento. O tempo total dos
            serviços define a duração na agenda.
          </p>
        ) : (
          <p className={styles.lead}>Acompanhe status, itens, planejamento e conclusão da ordem.</p>
        )}
      </div>

      <section className={styles.heroPanel} aria-label="Resumo principal da OS">
        <div className={styles.heroPanelSegment}>
          <p className={styles.heroLabel}>Numero da OS</p>
          <p className={styles.heroValue}>{isNew ? "Nova" : `#${order?.id ?? "--"}`}</p>
        </div>
        <div className={styles.heroPanelSegment}>
          <p className={styles.heroLabel}>Status atual</p>
          <p className={`${styles.heroValue} ${styles.statusBadge}`}>{statusLabel(order?.status)}</p>
        </div>
        <div className={styles.heroPanelSegment}>
          <p className={styles.heroLabel}>Agendada para</p>
          <p className={styles.heroValue}>
            {isNew && !order?.schedule?.starts_at ? "A definir" : formatDateTime(order?.schedule?.starts_at)}
          </p>
        </div>
        <div className={styles.heroPanelSegment}>
          <p className={styles.heroLabel}>Total estimado</p>
          <p className={styles.heroValue}>{formatCurrency(grandTotalPayable)}</p>
        </div>
      </section>

      <nav className={styles.tabNav} aria-label="Etapas da ordem de serviço">
        {!isTechnician ? (
          <>
            <button
              type="button"
              className={`${styles.tabNavBtn} ${activeTab === "combined" ? styles.tabNavBtnActive : ""}`}
              onClick={() => setActiveTab("combined")}
            >
              <IconTabFile className={styles.tabNavIcon} />
              Dados e serviços
            </button>
            <button
              type="button"
              className={`${styles.tabNavBtn} ${activeTab === "planning" ? styles.tabNavBtnActive : ""}`}
              onClick={() => setActiveTab("planning")}
            >
              <IconTabCalendar className={styles.tabNavIcon} />
              Planejamento
            </button>
            {!isNew && canEdit ? (
              <button
                type="button"
                className={`${styles.tabNavBtn} ${activeTab === "technical" ? styles.tabNavBtnActive : ""}`}
                onClick={() => setActiveTab("technical")}
              >
                <IconWrench className={styles.tabNavIcon} />
                Técnica
              </button>
            ) : null}
            {showConclusaoTab ? (
              <button
                type="button"
                className={`${styles.tabNavBtn} ${activeTab === "closing" ? styles.tabNavBtnActive : ""}`}
                onClick={() => setActiveTab("closing")}
              >
                <IconTabCheck className={styles.tabNavIcon} />
                Conclusão
              </button>
            ) : null}
            {showFinanceiroTab ? (
              <button
                type="button"
                className={`${styles.tabNavBtn} ${activeTab === "finance" ? styles.tabNavBtnActive : ""}`}
                onClick={() => setActiveTab("finance")}
              >
                <IconFinanceTab className={styles.tabNavIcon} />
                Financeiro
              </button>
            ) : null}
          </>
        ) : !isNew ? (
          <button
            type="button"
            className={`${styles.tabNavBtn} ${activeTab === "technical" ? styles.tabNavBtnActive : ""}`}
            onClick={() => setActiveTab("technical")}
          >
            <IconWrench className={styles.tabNavIcon} />
            Técnica
          </button>
        ) : null}
      </nav>

      <form className={styles.form} onSubmit={onCreateOrder}>
        {activeTab === "combined" && !isTechnician ? (
          <div className={styles.tabPanel}>
            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>
                <IconUserSection className={styles.sectionHeadingIcon} aria-hidden />
                Dados principais
              </h2>
              <div className={styles.clientRowPrimary}>
                <div>
                  <label className={loginStyles.label} htmlFor="os-client">
                    Cliente
                  </label>
                  {isNew ? (
                    <>
                      {selectedClient ? (
                        <div className={styles.selectedPillWrap}>
                          <div className={styles.selectedPill}>
                            <span className={styles.selectedPillLabel}>Cliente selecionado</span>
                            <strong className={styles.selectedPillValue}>{selectedClient.name}</strong>
                            <small className={styles.selectedPillMeta}>{selectedClient.document}</small>
                          </div>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              setClientId("");
                              setClientSearch("");
                              setClientDropdownOpen(true);
                            }}
                          >
                            Trocar cliente
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.searchFieldWrap}>
                            <span className={styles.searchFieldIcon}>
                              <IconSearchField />
                            </span>
                            <input
                              id="os-client"
                              className={loginStyles.input}
                              placeholder="Buscar cliente por nome ou documento…"
                              value={clientSearch}
                              onChange={(e) => setClientSearch(e.target.value)}
                              onFocus={() => setClientDropdownOpen(true)}
                              onClick={() => setClientDropdownOpen(true)}
                              onBlur={() => {
                                window.setTimeout(() => setClientDropdownOpen(false), 120);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setActiveClientIndex((idx) => Math.min(idx + 1, Math.max(visibleClients.length - 1, 0)));
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setActiveClientIndex((idx) => Math.max(idx - 1, 0));
                                } else if (e.key === "Enter") {
                                  if (visibleClients.length > 0) {
                                    e.preventDefault();
                                    const c = visibleClients[Math.min(activeClientIndex, visibleClients.length - 1)];
                                    if (!c) return;
                                    setClientId(String(c.id));
                                    setClientSearch("");
                                    setClientDropdownOpen(false);
                                  }
                                }
                              }}
                              autoComplete="off"
                            />
                          </div>
                          {visibleClients.length > 0 ? (
                            <div className={styles.searchResultList}>
                              {visibleClients.map((c, idx) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`${styles.searchResultBtn} ${idx === activeClientIndex ? styles.searchResultBtnActive : ""}`}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setClientId(String(c.id));
                                    setClientSearch("");
                                    setClientDropdownOpen(false);
                                  }}
                                >
                                  <span>{renderHighlightedText(c.name, clientSearch)}</span>
                                  <small>{renderHighlightedText(c.document ?? "", clientSearch)}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {clientDropdownOpen && visibleClients.length === 0 ? (
                            <p className={styles.emptySearch}>Nenhum cliente encontrado.</p>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <div>
                      <p className={styles.metaValue}>{selectedClient?.name ?? `Cliente #${clientId}`}</p>
                      {selectedClient?.document ? <p className={styles.metaDocument}>{selectedClient.document}</p> : null}
                    </div>
                  )}
                </div>
                <div>
                  <p className={styles.metaLabel}>Contato</p>
                  <p className={styles.clientInfoValue}>{clientPreferredContact(selectedClient)}</p>
                </div>
              </div>

              <div className={styles.clientAddressBlock}>
                <div className={styles.addressHeaderRow}>
                  <p className={styles.metaLabel}>Endereço</p>
                  <button
                    type="button"
                    className={styles.addressPrefBtn}
                    onClick={() => applyNavigationPreference("ask")}
                    title="Voltar a perguntar qual app de navegação usar"
                  >
                    Alterar app
                  </button>
                </div>
                {canOpenNavigation ? (
                  <button type="button" className={styles.addressLinkBtn} onClick={onAddressClick}>
                    {selectedClientAddress}
                  </button>
                ) : (
                  <p className={styles.clientInfoValue}>{selectedClientAddress}</p>
                )}
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>Observações</h2>
              <label className={loginStyles.label} htmlFor="os-general-notes">
                Texto livre para a equipe
              </label>
              <textarea
                id="os-general-notes"
                className={loginStyles.input}
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                rows={4}
                disabled={!isNew}
                placeholder="Informações importantes para a equipe e para o atendimento."
              />
              <div className={styles.infoStrip}>
                <p>Serviços, produtos, desconto e resumo ficam no card abaixo.</p>
              </div>
            </div>

            <div className={styles.osItemsCard}>
            <div className={styles.tabStack}>
              <div className={styles.section}>
                <div className={styles.sectionHeadRow}>
                  <h2 className={styles.sectionHeading}>
                    <IconWrench className={styles.sectionHeadingIcon} aria-hidden />
                    Serviços da OS
                  </h2>
                </div>
                {isNew ? (
                  <p className={styles.summaryLineMuted} style={{ margin: "0 0 0.75rem" }}>
                    Use <strong>quantidade</strong> para várias unidades do mesmo serviço. O vínculo de cada aparelho é
                    feito pelo <strong>técnico na execução</strong> (ou separação manual após salvar a OS).
                  </p>
                ) : null}
                {isNew ? (
                  <>
                    <div className={styles.searchFieldWrap}>
                      <span className={styles.searchFieldIcon}>
                        <IconSearchField />
                      </span>
                      <input
                        className={loginStyles.input}
                        placeholder="Buscar serviço pelo nome…"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        onFocus={() => setServiceDropdownOpen(true)}
                        onClick={() => setServiceDropdownOpen(true)}
                        onBlur={() => {
                          window.setTimeout(() => setServiceDropdownOpen(false), 120);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setActiveServiceIndex((idx) => Math.min(idx + 1, Math.max(visibleServices.length - 1, 0)));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setActiveServiceIndex((idx) => Math.max(idx - 1, 0));
                          } else if (e.key === "Enter") {
                            if (visibleServices.length > 0) {
                              e.preventDefault();
                              const s = visibleServices[Math.min(activeServiceIndex, visibleServices.length - 1)];
                              if (!s) return;
                              addService(s.id);
                              setServiceSearch("");
                              setServiceDropdownOpen(false);
                            }
                          } else if (e.key === "+") {
                            if (visibleServices.length > 0) {
                              e.preventDefault();
                              addService(visibleServices[0]!.id);
                              setServiceSearch("");
                              setServiceDropdownOpen(false);
                            }
                          }
                        }}
                        autoComplete="off"
                      />
                    </div>
                  {visibleServices.length > 0 ? (
                    <div className={styles.searchResultList}>
                      {visibleServices.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`${styles.searchResultBtn} ${idx === activeServiceIndex ? styles.searchResultBtnActive : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addService(s.id);
                            setServiceSearch("");
                            setServiceDropdownOpen(false);
                          }}
                        >
                          <span>
                            {renderHighlightedText(s.name, serviceSearch)} ({s.duration_minutes} min)
                          </span>
                          <small>{formatCurrency(Number(s.price || 0))}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {serviceDropdownOpen && visibleServices.length === 0 ? (
                    <p className={styles.emptySearch}>Nenhum serviço disponível para adicionar.</p>
                  ) : null}
                </>
              ) : null}

              {selectedServices.length === 0 && isNew ? (
                <div className={styles.emptyStateDashed}>
                  <IconWrench className={styles.emptyStateIcon} aria-hidden />
                  <p>Nenhum serviço adicionado.</p>
                  <p>Use a busca acima para incluir itens na OS.</p>
                </div>
              ) : null}
              {selectedServices.length === 0 && !isNew ? (
                <p className={styles.emptyText}>Nenhum serviço adicionado.</p>
              ) : null}
              {selectedServices.length > 0 ? (
                <>
                  <p className={styles.summaryLine}>
                    Equipamentos vinculados: {linkedEquipmentCount} de {selectedServices.length} linha(s)
                  </p>
                  {!isNew && hasMultiUnitLine ? (
                    <p className={styles.msgWarn}>
                      Esta OS ainda tem serviço com quantidade maior que 1. Use &quot;Separar em linhas&quot; ou abra como
                      técnico para gerar uma linha por aparelho.
                    </p>
                  ) : null}
                  {everyUnitLinkedToEquipment ? (
                    <p className={styles.msgOk}>
                      Todos os serviços desta OS estão com equipamento — não há pendência de vínculo nesta ordem.
                    </p>
                  ) : null}
                  {!isNew && hasMultiUnitLine && (canEdit || isTechnician) && !isTerminal ? (
                    <div className={styles.actions} style={{ marginTop: "0.35rem" }}>
                      <button type="button" className={styles.btnGhost} onClick={() => void handleManualSplitLines()}>
                        Separar em linhas (um aparelho por unidade)
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {clientEquipments.length === 0 ? (
                <div className={styles.subPanel}>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setShowQuickEquipmentCreate((prev) => !prev)}
                      disabled={!clientId}
                    >
                      {showQuickEquipmentCreate ? "Cancelar novo equipamento" : "Criar equipamento pela OS"}
                    </button>
                    {!clientId ? <p className={styles.summaryLine}>Selecione um cliente acima.</p> : null}
                  </div>
                </div>
              ) : null}
              {showQuickEquipmentCreate ? (
                <div className={styles.subPanel}>
                  <div className={styles.gridCompact}>
                    <div>
                      <label className={loginStyles.label}>Identificação</label>
                      <input
                        className={loginStyles.input}
                        value={quickEquipmentName}
                        onChange={(e) => setQuickEquipmentName(e.target.value)}
                        placeholder="Ex.: Split Sala"
                        disabled={creatingQuickEquipment}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Local</label>
                      <input
                        className={loginStyles.input}
                        value={quickEquipmentLocation}
                        onChange={(e) => setQuickEquipmentLocation(e.target.value)}
                        placeholder="Ex.: Sala"
                        disabled={creatingQuickEquipment}
                      />
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={() => void onCreateEquipmentFromOs()}
                        disabled={creatingQuickEquipment}
                      >
                        {creatingQuickEquipment ? "Criando..." : "Salvar equipamento"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {selectedServices.map((item) => {
                const service = servicesMap.get(item.service_id);
                const unitMin = service?.duration_minutes ?? 0;
                const unitPrice = Number(service?.price ?? 0);
                const qty = Math.max(item.quantity, 1);
                return (
                  <div key={item.lineId} className={`${styles.itemRowCard} ${styles.itemRowCardService}`}>
                    <div>
                      <p className={styles.itemRowTitle}>{service?.name ?? `Serviço #${item.service_id}`}</p>
                      <p className={styles.itemRowMeta}>
                        {formatMinutes(unitMin * qty)} no total · {formatCurrency(unitPrice * qty)}
                      </p>
                    </div>
                    <input
                      className={styles.qtyInput}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const raw = Math.max(Math.floor(Number(e.target.value)), 1);
                        setSelectedServices((prev) =>
                          prev.map((s) => (s.lineId === item.lineId ? { ...s, quantity: raw } : s)),
                        );
                      }}
                      disabled={!isNew}
                    />
                    {isNew ? (
                      <span className={styles.summaryLineMuted} title="Vínculo na execução (técnico)">
                        (equip. na execução)
                      </span>
                    ) : (
                      <select
                        className={loginStyles.select}
                        value={item.equipment_id ?? ""}
                        onChange={(e) => {
                          const nextEquipmentId = e.target.value ? Number(e.target.value) : undefined;
                          setSelectedServices((prev) =>
                            prev.map((s) =>
                              s.lineId === item.lineId
                                ? {
                                    ...s,
                                    equipment_id: nextEquipmentId,
                                  }
                                : s,
                            ),
                          );
                          if (!isNew && order && item.service_item_id && (canEdit || isTechnician)) {
                            void (async () => {
                              try {
                                const refreshed = await updateServiceOrderItemEquipment(
                                  order.id,
                                  item.service_item_id!,
                                  nextEquipmentId ?? null,
                                );
                                setOrder(refreshed);
                                setMsg({ kind: "ok", text: "Equipamento do serviço atualizado." });
                              } catch (err) {
                                setMsg({
                                  kind: "err",
                                  text: err instanceof Error ? err.message : "Erro ao atualizar equipamento do serviço.",
                                });
                              }
                            })();
                          }
                        }}
                        disabled={
                          clientEquipments.length === 0 || (isNew ? false : !(canEdit || isTechnician) || isTerminal)
                        }
                      >
                        <option value="">Sem equipamento</option>
                        {clientEquipments.map((equipment) => (
                          <option key={equipment.id} value={equipment.id}>
                            {equipment.identificacao}
                          </option>
                        ))}
                      </select>
                    )}
                    {isNew ? (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => setSelectedServices((prev) => prev.filter((s) => s.lineId !== item.lineId))}
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeadRow}>
                <h2 className={styles.sectionHeading}>
                  <IconPackageSection className={styles.sectionHeadingIcon} aria-hidden />
                  Produtos da OS
                </h2>
              </div>
              {isNew ? (
                <>
                  <div className={styles.searchFieldWrap}>
                    <span className={styles.searchFieldIcon}>
                      <IconSearchField />
                    </span>
                    <input
                      className={loginStyles.input}
                      placeholder="Buscar produto pelo nome ou SKU…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onFocus={() => setProductDropdownOpen(true)}
                      onClick={() => setProductDropdownOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setProductDropdownOpen(false), 120);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveProductIndex((idx) => Math.min(idx + 1, Math.max(visibleProducts.length - 1, 0)));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveProductIndex((idx) => Math.max(idx - 1, 0));
                        } else if (e.key === "Enter") {
                          if (visibleProducts.length > 0) {
                            e.preventDefault();
                            const p = visibleProducts[Math.min(activeProductIndex, visibleProducts.length - 1)];
                            if (!p) return;
                            addProduct(p.id);
                            setProductSearch("");
                            setProductDropdownOpen(false);
                          }
                        } else if (e.key === "+") {
                          if (visibleProducts.length > 0) {
                            e.preventDefault();
                            addProduct(visibleProducts[0]!.id);
                            setProductSearch("");
                            setProductDropdownOpen(false);
                          }
                        }
                      }}
                      autoComplete="off"
                    />
                  </div>
                  {visibleProducts.length > 0 ? (
                    <div className={styles.searchResultList}>
                      {visibleProducts.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.searchResultBtn} ${idx === activeProductIndex ? styles.searchResultBtnActive : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addProduct(p.id);
                            setProductSearch("");
                            setProductDropdownOpen(false);
                          }}
                        >
                          <span>{renderHighlightedText(p.name, productSearch)}</span>
                          <small>{renderHighlightedText(p.sku, productSearch)}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {productDropdownOpen && visibleProducts.length === 0 ? (
                    <p className={styles.emptySearch}>Nenhum produto disponível para adicionar.</p>
                  ) : null}
                </>
              ) : null}

              {selectedProducts.length === 0 && isNew ? (
                <div className={styles.emptyStateDashed}>
                  <IconPackageSection className={styles.emptyStateIcon} aria-hidden />
                  <p>Nenhum produto adicionado.</p>
                  <p>Use a busca acima para incluir materiais na OS.</p>
                </div>
              ) : null}
              {selectedProducts.length === 0 && !isNew ? (
                <p className={styles.emptyText}>Nenhum produto adicionado.</p>
              ) : null}
              {selectedProducts.map((item) => {
                const product = productsMap.get(item.product_id);
                const unitPrice = Number(product?.unit_price ?? 0);
                return (
                  <div key={item.product_id} className={`${styles.itemRowCard} ${styles.itemRowCardProduct}`}>
                    <div>
                      <p className={styles.itemRowTitle}>{product?.name ?? `Produto #${item.product_id}`}</p>
                      <p className={styles.itemRowMeta}>{formatCurrency(unitPrice)} / un</p>
                    </div>
                    <input
                      className={styles.qtyInput}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        setSelectedProducts((prev) =>
                          prev.map((p) =>
                            p.product_id === item.product_id ? { ...p, quantity: Math.max(Number(e.target.value), 1) } : p,
                          ),
                        )
                      }
                      disabled={!isNew}
                    />
                    {isNew ? (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => setSelectedProducts((prev) => prev.filter((p) => p.product_id !== item.product_id))}
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>Resumo</h2>
              <div className={styles.discountRow}>
                <label className={loginStyles.label} htmlFor="os-discount">
                  Desconto (R$)
                </label>
                <input
                  id="os-discount"
                  type="number"
                  className={loginStyles.input}
                  min={0}
                  step={0.01}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                  onBlur={() => {
                    if (!isNew && order) void persistDiscount(discountAmount);
                  }}
                  disabled={readOnly || (!isNew && !canEdit)}
                />
              </div>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Tempo total</p>
                  <p className={styles.summaryValue}>{formatMinutes(estimatedMinutes)}</p>
                  <p className={styles.summaryHint}>Base para o horário final</p>
                </article>
                <article className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Serviços</p>
                  <p className={styles.summaryValue}>{formatCurrency(estimatedServiceValue)}</p>
                  <p className={styles.summaryHint}>Soma dos serviços da OS</p>
                </article>
                <article className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Produtos</p>
                  <p className={styles.summaryValue}>{formatCurrency(estimatedProductValue)}</p>
                  <p className={styles.summaryHint}>Soma dos produtos da OS</p>
                </article>
                <article className={`${styles.summaryCard} ${styles.summaryCardHighlight}`}>
                  <p className={styles.summaryLabel}>Total geral</p>
                  <p className={styles.summaryValue}>{formatCurrency(grandTotalPayable)}</p>
                  <p className={styles.summaryHint}>Valor líquido (após desconto)</p>
                </article>
              </div>
            </div>
            </div>
            </div>
          </div>
        ) : null}

        {activeTab === "planning" && !isTechnician ? (
          <div className={styles.tabPanel}>
          <div className={styles.section}>
            <h2 className={styles.sectionHeading}>Planejamento técnico</h2>
            {!isNew ? (
              isTerminal ? (
                <p className={styles.summaryLine}>Esta OS está {statusLabel(order?.status).toLowerCase()}.</p>
              ) : (
                <>
                  <div className={styles.planningTopRow}>
                    <div className={styles.planningTechField}>
                      <label className={loginStyles.label} htmlFor="planning-tech">
                        Técnico
                      </label>
                      <select
                        id="planning-tech"
                        className={loginStyles.input}
                        value={selectedTechnicianId}
                        onChange={(e) => {
                          setSelectedTechnicianId(e.target.value);
                          setTechnicianManuallySelected(true);
                        }}
                        disabled={readOnly || isTerminal}
                      >
                        <option value="">{showPlanningPreSchedule ? "Qualquer técnico" : "Manter / selecionar"}</option>
                        {technicianOptions.map((tech) => (
                          <option key={tech.technician_id} value={tech.technician_id}>
                            {tech.full_name}{" "}
                            {showPlanningPreSchedule
                              ? tech.is_available
                                ? "(livre)"
                                : `(ocupado: ${tech.busy_slots})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.planningSuggestActions}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={() =>
                          showPlanningPreSchedule
                            ? void suggestNextSlots()
                            : void onSuggestRescheduleOptions()
                        }
                        disabled={
                          loadingSuggestions ||
                          rescheduling ||
                          readOnly ||
                          isTerminal ||
                          (showPlanningReschedule && !order?.schedule)
                        }
                      >
                        {loadingSuggestions || rescheduling
                          ? "Buscando..."
                          : showPlanningPreSchedule
                            ? "Sugerir horários no dia"
                            : "Sugerir horários para remarcar"}
                      </button>
                      {showPlanningPreSchedule ? (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={suggestSplitPlan}
                          disabled={readOnly || isTerminal}
                        >
                          Sugerir divisão em dias
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.planningCalendarWrap}>
                    <div className={styles.planningCalendarHead}>
                      <button type="button" className={styles.btnGhost} onClick={() => shiftPlanningMonth(-1)}>
                        ‹
                      </button>
                      <span className={styles.planningCalendarTitle}>{planningCalendar.monthTitle}</span>
                      <button type="button" className={styles.btnGhost} onClick={() => shiftPlanningMonth(1)}>
                        ›
                      </button>
                    </div>
                    {!selectedTechnicianId ? (
                      <p className={styles.summaryLineMuted}>
                        Selecione um técnico para ver quantos agendamentos ele já tem em cada dia do mês.
                      </p>
                    ) : null}
                    <div className={styles.planningCalDowRow}>
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                        <span key={d} className={styles.planningCalDow}>
                          {d}
                        </span>
                      ))}
                    </div>
                    <div className={styles.planningCalGrid}>
                      {planningCalendar.cells.map((day, idx) => {
                        if (day === null) {
                          return <div key={`e-${idx}`} className={styles.planningCalCellEmpty} />;
                        }
                        const key = `${planningCalendar.calendarYear}-${String(planningCalendar.calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const count = scheduleCountsByDay[key] ?? 0;
                        const dayDate = new Date(
                          planningCalendar.calendarYear,
                          planningCalendar.calendarMonth - 1,
                          day,
                        );
                        const apiWd = jsDateToServiceWeekday(dayDate);
                        const isHoliday = planningHolidayKeys.has(key);
                        const noWorkDay =
                          Boolean(selectedTechnicianId) &&
                          planningWorkWeekdays.size > 0 &&
                          !planningWorkWeekdays.has(apiWd);
                        const unavailableDay = planningUnavailability.some((u) =>
                          dayKeyOverlapsUnavailability(key, u.starts_at, u.ends_at),
                        );
                        const isBlocked = isHoliday || noWorkDay || unavailableDay;
                        const titleParts: string[] = [];
                        if (isHoliday) titleParts.push("Feriado da empresa");
                        if (noWorkDay) titleParts.push("Sem jornada para este técnico");
                        if (unavailableDay) titleParts.push("Técnico indisponível");
                        const blockTitle = titleParts.length > 0 ? titleParts.join(" · ") : undefined;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`${styles.planningCalCell} ${planningDay === key ? styles.planningCalCellActive : ""} ${isBlocked ? styles.planningCalCellBlocked : ""}`}
                            title={blockTitle}
                            disabled={readOnly || isTerminal}
                            onClick={() => {
                              setPlanningDay(key);
                              if (showPlanningPreSchedule) void suggestNextSlots(key);
                              else void onSuggestRescheduleOptions(key);
                            }}
                          >
                            <span className={styles.planningCalDayNum}>{day}</span>
                            {count > 0 ? <span className={styles.planningCalCount}>{count}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    <p className={styles.summaryLineMuted}>
                      {showPlanningPreSchedule
                        ? "Toque no dia para sugerir horários naquela data (usa o técnico selecionado, se houver)."
                        : "Toque no dia para carregar opções de remarcação a partir dessa data."}{" "}
                      Feriados da empresa, dias sem jornada do técnico e indisponibilidades aparecem em vermelho.
                    </p>
                  </div>

                  {showPlanningPreSchedule ? (
                    <>
                      <label className={styles.summaryLine}>
                        <input
                          type="checkbox"
                          checked={allowOvertime}
                          onChange={(e) => setAllowOvertime(e.target.checked)}
                          disabled={readOnly || isTerminal}
                        />{" "}
                        Permitir hora extra (fora da janela padrão)
                      </label>
                      {loadingTechnicians ? (
                        <p className={styles.summaryLine}>Carregando disponibilidade dos técnicos...</p>
                      ) : null}
                      {splitPlanHint ? <p className={styles.summaryLine}>{splitPlanHint}</p> : null}
                      {selectedSplitDays ? (
                        <p className={styles.summaryLine}>
                          Divisão ativa para aprovação: <strong>{selectedSplitDays} dia(s)</strong>.
                        </p>
                      ) : null}
                      {splitOptions.length > 0 ? (
                        <div className={styles.suggestionsList}>
                          {splitOptions.map((option) => (
                            <button
                              key={option.days}
                              type="button"
                              className={styles.suggestionBtn}
                              onClick={() => applySplitOption(option)}
                              disabled={readOnly || isTerminal}
                            >
                              <span>
                                {option.days} dia(s) — {formatMinutes(option.minutesPerDay)} por dia
                              </span>
                              <small>Usar divisão</small>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {slotSuggestions.length > 0 ? (
                        <div className={styles.suggestionsList}>
                          {slotSuggestions.map((slot, idx) => (
                            <button
                              key={`${slot.technician_id}-${slot.starts_at}-${idx}`}
                              type="button"
                              className={styles.suggestionBtn}
                              onClick={() => {
                                const d = new Date(slot.starts_at);
                                const pad = (v: number) => String(v).padStart(2, "0");
                                setStartsAtLocal(
                                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                                );
                                setSelectedTechnicianId(String(slot.technician_id));
                                setMsg({
                                  kind: "ok",
                                  text: "Horário aplicado. Revise observações e confirme o agendamento abaixo.",
                                });
                              }}
                              disabled={readOnly || isTerminal}
                            >
                              <span>
                                Técnico #{slot.technician_id} — início {formatDateTime(slot.starts_at)}
                              </span>
                              <small>Usar horário</small>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <p className={styles.summaryLine}>
                        Dica: até 4 opções por turno (manhã/tarde), a partir do dia útil mais próximo.
                      </p>

                      {canEdit ? (
                        <div className={styles.conclusaoStack}>
                          <article className={styles.conclusaoCard}>
                            <h3 className={styles.conclusaoCardTitle}>Agendar</h3>
                            <p className={styles.placeholderText}>
                              Defina início e observações. O técnico é o selecionado acima (ou o da sugestão escolhida).
                            </p>
                            <label className={loginStyles.label} htmlFor="plan-start">
                              Iniciar em
                            </label>
                            <input
                              id="plan-start"
                              type="datetime-local"
                              className={loginStyles.input}
                              value={startsAtLocal}
                              onChange={(e) => setStartsAtLocal(e.target.value)}
                              disabled={readOnly || isTerminal}
                            />

                            <label className={loginStyles.label} htmlFor="plan-notes">
                              Observações e histórico
                            </label>
                            <textarea
                              id="plan-notes"
                              className={loginStyles.input}
                              value={approveNotes}
                              onChange={(e) => setApproveNotes(e.target.value)}
                              rows={4}
                              disabled={readOnly || isTerminal}
                              placeholder="Notas da equipe e registro de mudanças (app / WhatsApp)."
                            />

                            <p className={styles.summaryLineMuted}>
                              Fim estimado considera duração dos serviços e disponibilidade do técnico.
                            </p>

                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.btnPrimary}
                                onClick={() => void onApproveOrder()}
                                disabled={approving || isTerminal}
                              >
                                {approving ? "Agendando..." : "Aprovar e agendar"}
                              </button>
                              {order && ["open", "approved"].includes(order.status) ? (
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void onCancelOpenOrderWithoutSchedule()}
                                  disabled={statusUpdating || isTerminal}
                                >
                                  Cancelar OS em aberto
                                </button>
                              ) : null}
                            </div>
                          </article>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {showPlanningReschedule && canEdit ? (
                    <div className={styles.conclusaoStack}>
                      <article className={styles.conclusaoCard}>
                        <h3 className={styles.conclusaoCardTitle}>Reagendar</h3>
                        {rescheduleOptions.length > 0 ? (
                          <div className={styles.suggestionsList}>
                            {rescheduleOptions.map((option, idx) => (
                              <button
                                key={`${option.starts_at}-${idx}`}
                                type="button"
                                className={styles.suggestionBtn}
                                onClick={() => {
                                  const d = new Date(option.starts_at);
                                  const pad = (v: number) => String(v).padStart(2, "0");
                                  setStartsAtLocal(
                                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                                  );
                                  setSelectedRescheduleOption(option);
                                  if (option.technician_id) {
                                    setSelectedTechnicianId(String(option.technician_id));
                                    setTechnicianManuallySelected(true);
                                  }
                                }}
                                disabled={readOnly || isTerminal}
                              >
                                <span>
                                  {formatDateTime(option.starts_at)} —{" "}
                                  {option.status === "integral" ? "Integral" : "Fracionado"}
                                </span>
                                <small>{option.note}</small>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <p className={styles.summaryLineMuted}>
                          Até 4 sugestões por turno (manhã/tarde), respeitando agenda e feriados.
                        </p>
                        <label className={loginStyles.label} htmlFor="planning-reschedule-start">
                          Novo início
                        </label>
                        <input
                          id="planning-reschedule-start"
                          type="datetime-local"
                          className={loginStyles.input}
                          value={startsAtLocal}
                          onChange={(e) => setStartsAtLocal(e.target.value)}
                          disabled={readOnly || isTerminal}
                        />
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.btnPrimary}
                            onClick={() => void onRescheduleOrder()}
                            disabled={rescheduling || statusUpdating || isTerminal}
                          >
                            {rescheduling ? "Reagendando..." : "Aplicar reagendamento"}
                          </button>
                        </div>
                      </article>
                    </div>
                  ) : null}
                </>
              )
            ) : (
              <p className={styles.summaryLine}>
                Crie a OS primeiro para receber sugestões de horário por técnico e disponibilidade.
              </p>
            )}
          </div>
          </div>
        ) : null}

        {activeTab === "closing" && showConclusaoTab && !isTechnician ? (
          <div className={styles.tabPanel}>
            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>Conclusão</h2>
              <p className={styles.leadInline}>
                Dados da OS. Remarcação e agendamento ficam na aba Planejamento; execução em campo é feita pelo técnico na
                aba Técnica.
              </p>
              <dl className={styles.closingFacts}>
                <div>
                  <dt>Cliente</dt>
                  <dd>{selectedClient?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt>Contato</dt>
                  <dd>{clientPreferredContact(selectedClient)}</dd>
                </div>
                <div className={styles.closingFactsWide}>
                  <dt>Endereço</dt>
                  <dd>
                    {canOpenNavigation ? (
                      <button type="button" className={styles.addressLinkBtnInline} onClick={onAddressClick}>
                        {selectedClientAddress}
                      </button>
                    ) : (
                      selectedClientAddress
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Agendamento</dt>
                  <dd>{formatDateTime(order?.schedule?.starts_at)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{statusLabel(order?.status)}</dd>
                </div>
                <div>
                  <dt>Total líquido</dt>
                  <dd>{formatCurrency(grandTotalPayable)}</dd>
                </div>
                {order?.stock_consumed_at ? (
                  <div>
                    <dt>Estoque</dt>
                    <dd>Baixado em {formatDateTime(order.stock_consumed_at)}</dd>
                  </div>
                ) : null}
              </dl>
              {canEdit && order && order.status !== "cancelled" ? (
                <article className={styles.conclusaoCard}>
                  <h3 className={styles.conclusaoCardTitle}>Manutenção preventiva</h3>
                  <p className={styles.placeholderText}>
                    Registra na{" "}
                    <Link to="/app/preventive-maintenance">Gestão preventiva</Link> a data da última realização para cada
                    tipo de serviço desta OS que tenha periodicidade cadastrada (ex.: 6 ou 12 meses). Os lembretes usam esse
                    período automaticamente.
                  </p>
                  {order.service_items.length === 0 ? (
                    <p className={styles.placeholderText} style={{ marginTop: "0.5rem" }}>
                      Esta OS não tem linhas de serviço.
                    </p>
                  ) : (
                    <div style={{ marginTop: "0.5rem", marginBottom: "0.65rem" }}>
                      <p className={styles.placeholderText} style={{ marginBottom: "0.35rem" }}>
                        Serviços nesta OS:
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "1.15rem", fontSize: "0.88rem", lineHeight: 1.45 }}>
                        {order.service_items.map((it) => {
                          const name = it.service_name?.trim() || `Serviço #${it.service_id}`;
                          const per = it.periodicidade_meses;
                          return (
                            <li key={it.id}>
                              <strong>{name}</strong>
                              {per != null
                                ? ` — será registrado na preventiva (${per} meses)`
                                : " — não será registrado: defina periodicidade (6 ou 12 meses) no cadastro do serviço"}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <label className={loginStyles.label} htmlFor="os-preventive-date">
                    Data da realização
                  </label>
                  <input
                    id="os-preventive-date"
                    type="date"
                    className={loginStyles.input}
                    value={preventiveOsDate}
                    onChange={(e) => setPreventiveOsDate(e.target.value)}
                    disabled={preventiveOsLoading}
                  />
                  <div className={styles.actions} style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => void onRegisterPreventiveFromOs()}
                      disabled={preventiveOsLoading || !preventiveOsDate}
                    >
                      {preventiveOsLoading ? "Registrando…" : "Registrar na gestão preventiva"}
                    </button>
                  </div>
                  {preventiveOsMsg ? (
                    <p
                      className={preventiveOsMsg.kind === "ok" ? styles.msgOk : styles.msgErr}
                      style={{ marginTop: "0.65rem" }}
                    >
                      {preventiveOsMsg.text}
                    </p>
                  ) : null}
                </article>
              ) : null}
              {canEdit && order && !isTerminal ? (
                <article className={`${styles.conclusaoCard} ${styles.conclusaoCardDanger} ${styles.closingCancelCard}`}>
                  <h3 className={styles.conclusaoCardTitle}>Cancelar agendamento e OS</h3>
                  <p className={styles.placeholderText}>
                    Encerra a ordem e cancela os vínculos de agenda desta OS.
                  </p>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={() => void onCancelScheduleAndOrder()}
                    disabled={statusUpdating}
                  >
                    {statusUpdating ? "Cancelando..." : "Cancelar agendamento e OS"}
                  </button>
                </article>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "finance" && showFinanceiroTab && !isTechnician ? (
          <div className={styles.tabPanel}>
            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>
                <IconFinanceTab className={styles.sectionHeadingIcon} aria-hidden />
                Financeiro da OS
              </h2>
              <p className={styles.leadInline}>
                Após o técnico concluir a OS, registre aqui o meio de pagamento. O valor e as taxas seguem as mesmas regras
                do módulo Financeiro (incluindo tabela de maquininha, quando aplicável).
              </p>
              {!osFinSettings?.finance_enabled ? (
                <p className={styles.summaryLineMuted}>
                  O financeiro está desativado neste workspace. Ative em{" "}
                  <Link to="/app/finance/settings">Configurações do Financeiro</Link>.
                </p>
              ) : osFinLoading ? (
                <p className={styles.summaryLineMuted}>Carregando…</p>
              ) : osFinExisting.length > 0 ? (
                <div className={styles.conclusaoCard}>
                  <h3 className={styles.conclusaoCardTitle}>Lançamento vinculado</h3>
                  <p className={styles.summaryLine}>
                    {osFinExisting.length === 1
                      ? `Uma receita de ${formatCurrency(Number(osFinExisting[0]!.amount))} (${osFinExisting[0]!.payment_method ?? "—"}) já está no financeiro.`
                      : `${osFinExisting.length} parcelas registradas para esta OS.`}
                  </p>
                  <Link className={styles.btnPrimary} to="/app/finance">
                    Abrir módulo Financeiro
                  </Link>
                </div>
              ) : (
                <>
                  <div className={styles.clientRowPrimary}>
                    <div>
                      <label className={loginStyles.label} htmlFor="os-fin-amount">
                        Valor bruto (R$)
                      </label>
                      <input
                        id="os-fin-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        className={loginStyles.input}
                        value={osFinAmount}
                        onChange={(e) => setOsFinAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label} htmlFor="os-fin-due">
                        Vencimento (1ª parcela)
                      </label>
                      <input
                        id="os-fin-due"
                        type="date"
                        className={loginStyles.input}
                        value={osFinDueDate}
                        onChange={(e) => setOsFinDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <label className={loginStyles.label} htmlFor="os-fin-competence">
                    Data de competência
                  </label>
                  <input
                    id="os-fin-competence"
                    type="date"
                    className={loginStyles.input}
                    value={osFinCompetenceDate}
                    onChange={(e) => setOsFinCompetenceDate(e.target.value)}
                  />
                  <div className={styles.clientRowPrimary}>
                    <div>
                      <label className={loginStyles.label} htmlFor="os-fin-method">
                        Meio de pagamento
                      </label>
                      <select
                        id="os-fin-method"
                        className={loginStyles.select}
                        value={osFinPaymentMethod}
                        onChange={(e) => setOsFinPaymentMethod(e.target.value)}
                      >
                        <option value="pix">PIX</option>
                        <option value="cash">Dinheiro</option>
                        <option value="credit_card">Cartão de crédito</option>
                        <option value="debit_card">Cartão de débito</option>
                        <option value="boleto">Boleto</option>
                      </select>
                    </div>
                    {osFinShowMachineField ? (
                      <div>
                        <label className={loginStyles.label} htmlFor="os-fin-provider">
                          Maquininha / provedor
                        </label>
                        <input
                          id="os-fin-provider"
                          className={loginStyles.input}
                          list="os-finance-provider-suggestions"
                          value={osFinPaymentProvider}
                          onChange={(e) => setOsFinPaymentProvider(e.target.value)}
                          placeholder="Ex.: Stone"
                        />
                        <datalist id="os-finance-provider-suggestions">
                          {osFinProviderSuggestions.map((name) => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                  {osFinShowMachineField ? (
                    <>
                      <label className={loginStyles.label} htmlFor="os-fin-settle">
                        Previsão de compensação (caixa)
                      </label>
                      <select
                        id="os-fin-settle"
                        className={loginStyles.select}
                        value={osFinSettlementPlan}
                        onChange={(e) =>
                          setOsFinSettlementPlan(e.target.value as "same_as_due" | "next_business_day")
                        }
                      >
                        <option value="same_as_due">No dia do vencimento da parcela</option>
                        <option value="next_business_day">D+1 útil após o vencimento da parcela</option>
                      </select>
                      <p className={styles.summaryLineMuted}>
                        Taxa conforme tabela em Configurações → Maquininhas; valor bruto e taxas divididos entre parcelas.
                      </p>
                    </>
                  ) : null}
                  {osFinShowInstallmentsField ? (
                    <div className={styles.clientRowPrimary}>
                      <div>
                        <label className={loginStyles.label} htmlFor="os-fin-inst">
                          Parcelas
                        </label>
                        <input
                          id="os-fin-inst"
                          type="number"
                          min="1"
                          max="24"
                          step="1"
                          className={loginStyles.input}
                          value={osFinInstallments}
                          onChange={(e) => setOsFinInstallments(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={loginStyles.label} htmlFor="os-fin-interval">
                          Intervalo (meses)
                        </label>
                        <input
                          id="os-fin-interval"
                          type="number"
                          min="1"
                          max="12"
                          step="1"
                          className={loginStyles.input}
                          value={osFinInstallmentInterval}
                          onChange={(e) => setOsFinInstallmentInterval(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                  {osFinShowBankAccountField ? (
                    <label className={loginStyles.label} htmlFor="os-fin-account">
                      Conta de recebimento
                    </label>
                  ) : null}
                  {osFinShowBankAccountField ? (
                    <select
                      id="os-fin-account"
                      className={loginStyles.select}
                      value={osFinAccountId}
                      onChange={(e) => setOsFinAccountId(e.target.value)}
                    >
                      <option value="">Selecionar conta</option>
                      {osFinAccounts.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className={styles.clientRowPrimary}>
                    <div>
                      <label className={loginStyles.label} htmlFor="os-fin-cat">
                        Categoria
                      </label>
                      <select
                        id="os-fin-cat"
                        className={loginStyles.select}
                        value={osFinCategoryId}
                        onChange={(e) => setOsFinCategoryId(e.target.value)}
                      >
                        <option value="">Sem categoria</option>
                        {osFinCategories.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={loginStyles.label} htmlFor="os-fin-status">
                        Status inicial
                      </label>
                      <select
                        id="os-fin-status"
                        className={loginStyles.select}
                        value={osFinEntryStatus}
                        onChange={(e) => setOsFinEntryStatus(e.target.value as FinanceEntryStatus)}
                      >
                        <option value="paid">Pago</option>
                        <option value="pending">Pendente</option>
                        <option value="overdue">Vencido</option>
                      </select>
                    </div>
                  </div>
                  <label className={loginStyles.label} htmlFor="os-fin-wa">
                    WhatsApp do cliente (opcional, lembretes)
                  </label>
                  <input
                    id="os-fin-wa"
                    type="tel"
                    inputMode="tel"
                    className={loginStyles.input}
                    value={osFinRecipientWhatsapp}
                    onChange={(e) => setOsFinRecipientWhatsapp(formatPhoneBrInput(e.target.value))}
                    autoComplete="tel"
                    placeholder="(16) 99999-9999"
                  />
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => void onSubmitOsFinance()}
                      disabled={osFinSubmitting}
                    >
                      {osFinSubmitting ? "Salvando..." : "Registrar no financeiro"}
                    </button>
                    <Link className={styles.btnGhost} to="/app/finance">
                      Ver lançamentos
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "technical" && canSeeTechnicalTab && !isNew && order ? (
          <div className={styles.tabPanel}>
            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>OS #{order.id}</h2>
              <p className={styles.summaryLineMuted}>
                {statusLabel(order.status)} · {formatDateTime(order.schedule?.starts_at)}
              </p>
              <div className={styles.clientRowPrimary}>
                <div>
                  <p className={styles.metaLabel}>Cliente</p>
                  <p className={styles.metaValue}>{selectedClient?.name ?? "—"}</p>
                  {selectedClient?.document ? <p className={styles.metaDocument}>{selectedClient.document}</p> : null}
                </div>
                <div>
                  <p className={styles.metaLabel}>Contato</p>
                  <p className={styles.clientInfoValue}>{clientPreferredContact(selectedClient)}</p>
                </div>
              </div>
              <div className={styles.clientAddressBlock}>
                <div className={styles.addressHeaderRow}>
                  <p className={styles.metaLabel}>Endereço</p>
                  <button
                    type="button"
                    className={styles.addressPrefBtn}
                    onClick={() => applyNavigationPreference("ask")}
                    title="Voltar a perguntar qual app de navegação usar"
                  >
                    Alterar app
                  </button>
                </div>
                {canOpenNavigation ? (
                  <button type="button" className={styles.addressLinkBtn} onClick={onAddressClick}>
                    {selectedClientAddress}
                  </button>
                ) : (
                  <p className={styles.clientInfoValue}>{selectedClientAddress}</p>
                )}
              </div>
              {generalNotes.trim() ? (
                <p className={styles.summaryLine}>
                  <span className={styles.metaLabel}>Observações: </span>
                  {generalNotes}
                </p>
              ) : null}
            </div>
            <div className={styles.section}>
              <h3 className={styles.sectionHeading}>Serviços e equipamentos</h3>
              {selectedServices.length === 0 ? (
                <p className={styles.emptyText}>Nenhum serviço nesta OS.</p>
              ) : (
                selectedServices.map((item) => {
                  const service = servicesMap.get(item.service_id);
                  const unitMin = service?.duration_minutes ?? 0;
                  const unitPrice = Number(service?.price ?? 0);
                  const qty = Math.max(item.quantity, 1);
                  return (
                    <div key={item.lineId} className={`${styles.itemRowCard} ${styles.itemRowCardService}`}>
                      <div>
                        <p className={styles.itemRowTitle}>{service?.name ?? `Serviço #${item.service_id}`}</p>
                        <p className={styles.itemRowMeta}>
                          {formatMinutes(unitMin * qty)} no total · {formatCurrency(unitPrice * qty)}
                        </p>
                      </div>
                      <select
                        className={loginStyles.select}
                        value={item.equipment_id ?? ""}
                        onChange={(e) => {
                          const nextEquipmentId = e.target.value ? Number(e.target.value) : undefined;
                          setSelectedServices((prev) =>
                            prev.map((s) =>
                              s.lineId === item.lineId ? { ...s, equipment_id: nextEquipmentId } : s,
                            ),
                          );
                          if (order && item.service_item_id) {
                            void (async () => {
                              try {
                                const refreshed = await updateServiceOrderItemEquipment(
                                  order.id,
                                  item.service_item_id!,
                                  nextEquipmentId ?? null,
                                );
                                setOrder(refreshed);
                                setMsg({ kind: "ok", text: "Equipamento vinculado ao serviço." });
                              } catch (err) {
                                setMsg({
                                  kind: "err",
                                  text: err instanceof Error ? err.message : "Erro ao atualizar equipamento.",
                                });
                              }
                            })();
                          }
                        }}
                        disabled={clientEquipments.length === 0 || isTerminal}
                      >
                        <option value="">Sem equipamento</option>
                        {clientEquipments.map((equipment) => (
                          <option key={equipment.id} value={equipment.id}>
                            {equipment.identificacao}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
            <div className={styles.section}>
              {order.schedule ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => void onSendWhatsappReminder()}
                    disabled={sendingWhatsappReminder}
                  >
                    {sendingWhatsappReminder ? "Enviando..." : "Lembrete WhatsApp"}
                  </button>
                </div>
              ) : null}
              {canUpdateStatus && !isTerminal ? (
                <div className={styles.actions}>
                  {order.status === "scheduled" || order.status === "approved" ? (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => void onSetInProgress()}
                      disabled={statusUpdating}
                    >
                      {statusUpdating ? "Atualizando..." : "Iniciar serviço"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => void onCompleteOrder()}
                    disabled={statusUpdating}
                  >
                    {statusUpdating ? "Finalizando..." : "Finalizar OS"}
                  </button>
                </div>
              ) : null}
              <p className={styles.summaryLineMuted}>
                Ao finalizar, a OS segue para o financeiro para registrar o meio de pagamento.
              </p>
            </div>
          </div>
        ) : null}

        {isNew ? (
          <div className={styles.formActionsBar}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? "Salvando..." : "Criar OS"}
            </button>
          </div>
        ) : null}

        {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
      </form>

      {navigationChooserAddress ? (
        <div className={styles.navChooserBackdrop} role="dialog" aria-modal="true" aria-label="Escolher app de navegação">
          <div className={styles.navChooserCard}>
            <h3 className={styles.navChooserTitle}>Abrir endereço em</h3>
            <p className={styles.navChooserAddress}>{navigationChooserAddress}</p>
            <div className={styles.navChooserActions}>
              {navigationApps.map((app) => (
                <button
                  key={app}
                  type="button"
                  className={styles.navChooserBtn}
                  onClick={() => onChooseNavigationApp(app)}
                >
                  {navigationLabel(app)}
                </button>
              ))}
            </div>
            <label className={styles.navChooserRemember}>
              <input
                type="checkbox"
                checked={rememberNavigationChoice}
                onChange={(e) => setRememberNavigationChoice(e.target.checked)}
              />
              Lembrar minha escolha neste aparelho
            </label>
            <button
              type="button"
              className={styles.navChooserCancel}
              onClick={() => setNavigationChooserAddress(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
