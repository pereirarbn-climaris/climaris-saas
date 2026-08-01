import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createClientContract,
  deleteClientContract,
  listClientContracts,
  updateClientContract,
  type ClientContractOut,
  type ClientContractPayload,
  type ClientContractStatus,
  type ClientSiteOut,
} from "../../../api/clients";
import { amountToCurrencyBrlInput, formatCurrencyBrlInput, parseCurrencyBrlInput } from "../../../lib/brMask";
import { toast } from "../../../lib/toast";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { ListPaginationBar } from "../../ui/list-pagination";
import { RowActionsMenu, RowActionsMenuItem } from "../../ui/RowActionsMenu";
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboardList,
  IconClock,
  IconCopy,
  IconDownload,
  IconEdit,
  IconEye,
  IconFileText,
  IconLoader,
  IconMail,
  IconMessageCircle,
  IconMoreVertical,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconX,
} from "./icons";
import { EmptyState, formatDateBR, toDateInputValue } from "./shared";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type UiStatus = "ativo" | "a_vencer" | "vencido" | "encerrado";
type ContractCategory = "PMOC" | "Sob demanda" | "Peças" | "Instalação" | "Locação";
type SiteBadge = "Matriz" | "Filial";
type RecurrenceLabel = "Mensal" | "Anual" | "Único";

type ContractRow = {
  id: string;
  sourceId: number | null;
  code: string;
  numberLabel: string;
  year: number;
  type: string;
  category: ContractCategory;
  siteName: string;
  siteBadge: SiteBadge;
  startDate: string;
  endDate: string;
  value: number;
  recurrence: RecurrenceLabel;
  status: UiStatus;
  nextDueDate: string | null;
  dueBadge: string | null;
  responsible: string;
  isMock: boolean;
};

const TYPE_OPTIONS = [
  "Manutenção Preventiva",
  "Manutenção Corretiva",
  "Fornecimento de Peças",
  "Instalação",
  "Locação",
] as const;

const STATUS_FILTER_OPTIONS: { value: "all" | UiStatus; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "ativo", label: "Ativo" },
  { value: "a_vencer", label: "A vencer" },
  { value: "vencido", label: "Vencido" },
  { value: "encerrado", label: "Encerrado" },
];

const MOCK_UNIT_OPTIONS = ["Matriz - Araraquara", "Unidade São Paulo", "Unidade Ribeirão Preto"];

const MOCK_CONTRACTS: ContractRow[] = [
  {
    id: "mock-1",
    sourceId: null,
    code: "CTR-2025-001",
    numberLabel: "Nº: 2025.001.0001",
    year: 2025,
    type: "Manutenção Preventiva",
    category: "PMOC",
    siteName: "Matriz - Araraquara",
    siteBadge: "Matriz",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    value: 12800,
    recurrence: "Anual",
    status: "ativo",
    nextDueDate: "2025-08-10",
    dueBadge: "Em 25 dias",
    responsible: "Robson Pereira",
    isMock: true,
  },
  {
    id: "mock-2",
    sourceId: null,
    code: "CTR-2025-002",
    numberLabel: "Nº: 2025.002.0001",
    year: 2025,
    type: "Manutenção Corretiva",
    category: "Sob demanda",
    siteName: "Unidade São Paulo",
    siteBadge: "Filial",
    startDate: "2025-01-15",
    endDate: "2026-01-15",
    value: 9500,
    recurrence: "Anual",
    status: "ativo",
    nextDueDate: "2025-08-15",
    dueBadge: "Em 30 dias",
    responsible: "Equipe comercial",
    isMock: true,
  },
  {
    id: "mock-3",
    sourceId: null,
    code: "CTR-2025-003",
    numberLabel: "Nº: 2025.003.0001",
    year: 2025,
    type: "Fornecimento de Peças",
    category: "Peças",
    siteName: "Unidade Ribeirão Preto",
    siteBadge: "Filial",
    startDate: "2025-02-01",
    endDate: "2026-01-31",
    value: 5200,
    recurrence: "Anual",
    status: "a_vencer",
    nextDueDate: "2025-07-05",
    dueBadge: "Em -10 dias",
    responsible: "Compras",
    isMock: true,
  },
  {
    id: "mock-4",
    sourceId: null,
    code: "CTR-2024-004",
    numberLabel: "Nº: 2024.004.0001",
    year: 2024,
    type: "Instalação",
    category: "Instalação",
    siteName: "Matriz - Araraquara",
    siteBadge: "Matriz",
    startDate: "2024-01-10",
    endDate: "2025-01-10",
    value: 18000,
    recurrence: "Único",
    status: "vencido",
    nextDueDate: "2025-01-10",
    dueBadge: "Vencido",
    responsible: "Operações",
    isMock: true,
  },
  {
    id: "mock-5",
    sourceId: null,
    code: "CTR-2025-005",
    numberLabel: "Nº: 2025.005.0001",
    year: 2025,
    type: "Loja / Aluguel de Equip.",
    category: "Locação",
    siteName: "Unidade São Paulo",
    siteBadge: "Filial",
    startDate: "2025-03-01",
    endDate: "2026-02-28",
    value: 7200,
    recurrence: "Anual",
    status: "encerrado",
    nextDueDate: null,
    dueBadge: null,
    responsible: "Financeiro",
    isMock: true,
  },
];

function categoryFromType(type: string): ContractCategory {
  const t = type.toLowerCase();
  if (t.includes("prevent") || t.includes("pmoc")) return "PMOC";
  if (t.includes("corret") || t.includes("demanda")) return "Sob demanda";
  if (t.includes("peça") || t.includes("peca")) return "Peças";
  if (t.includes("instal")) return "Instalação";
  if (t.includes("loca") || t.includes("alug")) return "Locação";
  return "Sob demanda";
}

function recurrenceLabel(value: string | null | undefined): RecurrenceLabel {
  const v = (value ?? "").toLowerCase();
  if (v === "monthly" || v === "mensal") return "Mensal";
  if (v === "one_time" || v === "avulso" || v === "único" || v === "unico") return "Único";
  return "Anual";
}

function daysUntil(dateIso: string | null | undefined, today = new Date()): number | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function uiStatusFromApi(c: ClientContractOut): UiStatus {
  if (c.status === "cancelled") return "encerrado";
  if (c.status === "expired") return "vencido";
  if (c.status === "suspended") return "a_vencer";
  const days = daysUntil(c.end_date);
  if (days != null && days < 0) return "vencido";
  if (days != null && days <= 45) return "a_vencer";
  if (c.status === "active" || c.status === "draft") return "ativo";
  return "encerrado";
}

function dueBadgeFromDate(dateIso: string | null, status: UiStatus): string | null {
  if (status === "encerrado") return null;
  if (!dateIso) return null;
  if (status === "vencido") return "Vencido";
  const days = daysUntil(dateIso);
  if (days == null) return null;
  if (days < 0) return `Em ${days} dias`;
  if (days === 0) return "Hoje";
  return `Em ${days} dias`;
}

function mapApiToRow(c: ClientContractOut, sites: ClientSiteOut[]): ContractRow {
  const status = uiStatusFromApi(c);
  const year = Number((c.start_date ?? "").slice(0, 4)) || new Date().getFullYear();
  const site = sites.find((s) => s.is_active) ?? sites[0];
  const nextDue = c.end_date?.slice(0, 10) ?? null;
  return {
    id: `api-${c.id}`,
    sourceId: c.id,
    code: c.contract_number || `CTR-${c.id}`,
    numberLabel: c.title ? `Nº: ${c.title}` : `Nº: ${c.contract_number}`,
    year,
    type: c.contract_type || "Contrato",
    category: categoryFromType(c.contract_type || ""),
    siteName: site?.name ?? "—",
    siteBadge: site?.site_type === "matriz" ? "Matriz" : "Filial",
    startDate: c.start_date?.slice(0, 10) ?? "",
    endDate: c.end_date?.slice(0, 10) ?? "",
    value: Number(c.value) || 0,
    recurrence: recurrenceLabel(c.recurrence),
    status,
    nextDueDate: status === "encerrado" ? null : nextDue,
    dueBadge: dueBadgeFromDate(nextDue, status),
    responsible: "",
    isMock: false,
  };
}

function categoryPillClass(category: ContractCategory): string {
  if (category === "PMOC") return styles.pillPurple;
  if (category === "Sob demanda") return styles.pillSky;
  if (category === "Peças") return styles.pillOrange;
  if (category === "Instalação") return styles.pillSuccess;
  return styles.pillMuted;
}

function statusPill(status: UiStatus): { label: string; className: string; Icon: typeof IconCheck } {
  if (status === "ativo") return { label: "Ativo", className: styles.pillSuccess, Icon: IconCheck };
  if (status === "a_vencer") return { label: "A vencer", className: styles.pillWarning, Icon: IconClock };
  if (status === "vencido") return { label: "Vencido", className: styles.pillDanger, Icon: IconAlertTriangle };
  return { label: "Encerrado", className: styles.pillMuted, Icon: IconX };
}

function dueBadgeClass(badge: string | null): string {
  if (!badge || badge === "-") return styles.contractDueMuted;
  if (badge === "Vencido" || badge.includes("-")) return styles.contractDueDanger;
  return styles.contractDueInfo;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const part = iso.slice(0, 10);
  const [y, m, d] = part.split("-");
  if (!y || !m || !d) return formatDateBR(iso);
  return `${d}/${m}/${y}`;
}

function emptyPayload(): ClientContractPayload {
  const today = new Date().toISOString().slice(0, 10);
  return {
    contract_number: "",
    contract_type: "Manutenção Preventiva",
    title: "",
    status: "active",
    recurrence: "annual",
    start_date: today,
    end_date: today,
    value: 0,
    payment_method: "",
    notes: "",
  };
}

const API_STATUS_OPTIONS: { value: ClientContractStatus; label: string }[] = [
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "expired", label: "Vencido" },
  { value: "cancelled", label: "Cancelado" },
];

type Props = {
  clientId: number;
  readOnly?: boolean;
  sites?: ClientSiteOut[];
  onContractsChanged?: (count: number) => void;
};

export function ClientContractsTab({ clientId, readOnly, sites = [], onContractsChanged }: Props) {
  const navigate = useNavigate();
  const [apiContracts, setApiContracts] = useState<ClientContractOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UiStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientContractPayload>(emptyPayload());
  const [valueInput, setValueInput] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listClientContracts(clientId);
      setApiContracts(rows);
      onContractsChanged?.(rows.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os contratos.");
    } finally {
      setLoading(false);
    }
  }, [clientId, onContractsChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo<ContractRow[]>(() => {
    if (apiContracts.length > 0) {
      return apiContracts.map((c) => mapApiToRow(c, sites));
    }
    return MOCK_CONTRACTS;
  }, [apiContracts, sites]);

  const usingMock = apiContracts.length === 0;

  const siteOptions = useMemo(() => {
    const fromSites = sites.map((s) => s.name).filter(Boolean);
    const fromRows = rows.map((r) => r.siteName);
    const merged = Array.from(new Set([...MOCK_UNIT_OPTIONS, ...fromSites, ...fromRows]));
    return merged.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows, sites]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (siteFilter !== "all" && r.siteName !== siteFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.numberLabel.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.responsible.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q)
      );
    });
  }, [rows, search, siteFilter, typeFilter, statusFilter]);

  const totals = useMemo(() => {
    const base = usingMock ? MOCK_CONTRACTS : rows;
    return {
      total: base.length,
      ativos: base.filter((r) => r.status === "ativo").length,
      aVencer: base.filter((r) => r.status === "a_vencer").length,
      vencidos: base.filter((r) => r.status === "vencido").length,
      encerrados: base.filter((r) => r.status === "encerrado").length,
    };
  }, [rows, usingMock]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetFilters() {
    setSearch("");
    setSiteFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  function openNew() {
    navigate(`/app/clients/${clientId}/contracts/new`);
  }

  function openEdit(row: ContractRow) {
    if (row.isMock || row.sourceId == null) {
      toast.success("Este é um exemplo visual. Cadastre um contrato real para editar.");
      openNew();
      return;
    }
    const c = apiContracts.find((item) => item.id === row.sourceId);
    if (!c) return;
    setEditingId(c.id);
    setForm({
      contract_number: c.contract_number,
      contract_type: c.contract_type,
      title: c.title,
      status: c.status,
      recurrence: c.recurrence,
      start_date: toDateInputValue(c.start_date),
      end_date: toDateInputValue(c.end_date),
      value: c.value,
      payment_method: c.payment_method ?? "",
      due_day: c.due_day ?? undefined,
      notes: c.notes ?? "",
    });
    setValueInput(amountToCurrencyBrlInput(c.value));
    setFormOpen(true);
  }

  function onView(row: ContractRow) {
    toast.success(`Contrato ${row.code} — visualização em breve.`);
  }

  function onMenuAction(label: string, row: ContractRow) {
    toast.success(`${label}: ${row.code}`);
  }

  async function onSave() {
    if (!(form.contract_number ?? "").trim() || !form.title.trim()) {
      toast.error("Informe número e título do contrato.");
      return;
    }
    setSaving(true);
    const payload: ClientContractPayload = { ...form, value: parseCurrencyBrlInput(valueInput) };
    try {
      if (editingId != null) {
        await updateClientContract(clientId, editingId, payload);
        toast.success("Contrato atualizado.");
      } else {
        await createClientContract(clientId, payload);
        toast.success("Contrato cadastrado.");
      }
      setFormOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o contrato.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: ContractRow) {
    if (row.isMock || row.sourceId == null) {
      toast.success("Exemplos visuais não podem ser excluídos.");
      return;
    }
    if (!window.confirm("Excluir este contrato?")) return;
    setSaving(true);
    try {
      await deleteClientContract(clientId, row.sourceId);
      toast.success("Contrato excluído.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o contrato.");
    } finally {
      setSaving(false);
    }
  }

  async function onCloseContract(row: ContractRow) {
    if (row.isMock || row.sourceId == null) {
      toast.success("Exemplos visuais não podem ser encerrados.");
      return;
    }
    if (!window.confirm(`Encerrar o contrato ${row.code}?`)) return;
    setSaving(true);
    try {
      await updateClientContract(clientId, row.sourceId, { status: "cancelled" });
      toast.success("Contrato encerrado.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível encerrar o contrato.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Contratos cadastrados</h3>
            <p className={styles.cardHint}>Gerencie os contratos e acordos comerciais do cliente.</p>
          </div>
          {!readOnly ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openNew}>
              <IconPlus /> Novo contrato
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className={styles.loading}>
            <IconLoader /> Carregando contratos…
          </p>
        ) : (
          <>
            {usingMock ? (
              <div className={styles.equipMockBanner} role="status">
                <IconAlertTriangle />
                Exibindo exemplos visuais. Ao cadastrar o primeiro contrato real, a lista passa a usar os dados da API.
              </div>
            ) : null}

            <div className={styles.equipStatsGrid}>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconBlue}`}>
                  <IconFileText />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.total}</span>
                  <span className={styles.equipStatLabel}>Total de contratos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconGreen}`}>
                  <IconCheck />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.ativos}</span>
                  <span className={styles.equipStatLabel}>Ativos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconOrange}`}>
                  <IconClock />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.aVencer}</span>
                  <span className={styles.equipStatLabel}>A vencer</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconRed}`}>
                  <IconAlertTriangle />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.vencidos}</span>
                  <span className={styles.equipStatLabel}>Vencidos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconGray}`}>
                  <IconX />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.encerrados}</span>
                  <span className={styles.equipStatLabel}>Encerrados</span>
                </span>
              </div>
            </div>

            <div className={styles.filterBar}>
              <div className={styles.filterSearchWrap}>
                <IconSearch />
                <input
                  className={`${styles.fieldInput} ${styles.filterSearchInput}`}
                  placeholder="Buscar contrato, nº do contrato, tipo, responsável..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={siteFilter}
                onChange={(e) => {
                  setSiteFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar por unidade"
              >
                <option value="all">Todas as unidades</option>
                {siteOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar por tipo"
              >
                <option value="all">Todos os tipos</option>
                {TYPE_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {!TYPE_OPTIONS.includes(typeFilter as (typeof TYPE_OPTIONS)[number]) && typeFilter !== "all" ? (
                  <option value={typeFilter}>{typeFilter}</option>
                ) : null}
              </select>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | UiStatus);
                  setPage(1);
                }}
                aria-label="Filtrar por status"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.btnLinkMuted}
                style={{ color: "var(--color-primary)" }}
                onClick={resetFilters}
              >
                Limpar filtros
              </button>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState message="Nenhum contrato encontrado para o filtro atual." />
            ) : (
              <>
                <div className={`${styles.tableWrap} ${styles.contractsDesktopTable}`} style={{ marginTop: "1rem" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Tipo</th>
                        <th>Unidade / Filial</th>
                        <th>Vigência</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Próximo vencimento</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => {
                        const st = statusPill(row.status);
                        return (
                          <tr key={row.id}>
                            <td>
                              <div className={styles.contractCell}>
                                <span className={styles.contractThumb} aria-hidden>
                                  <IconFileText />
                                </span>
                                <span className={styles.contractCellText}>
                                  <span className={styles.contractCode}>{row.code}</span>
                                  <span className={styles.contractNumber}>{row.numberLabel}</span>
                                  <span className={`${styles.pill} ${styles.pillPrimary} ${styles.contractYearBadge}`}>
                                    Ano: {row.year}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.contractTypeCell}>
                                <span className={styles.contractTypeName}>{row.type}</span>
                                <span className={`${styles.pill} ${categoryPillClass(row.category)}`}>{row.category}</span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.contractSiteCell}>
                                <span>{row.siteName}</span>
                                <span
                                  className={`${styles.pill} ${row.siteBadge === "Matriz" ? styles.pillPrimary : styles.pillPurple}`}
                                >
                                  {row.siteBadge}
                                </span>
                              </div>
                            </td>
                            <td className={styles.contractVigencia}>
                              {formatDateLocal(row.startDate)} a {formatDateLocal(row.endDate)}
                            </td>
                            <td>
                              <div className={styles.contractValueCell}>
                                <strong>{formatMoney(row.value)}</strong>
                                <span>{row.recurrence}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.pill} ${st.className}`}>
                                <st.Icon /> {st.label}
                              </span>
                            </td>
                            <td>
                              <div className={styles.contractDueCell}>
                                <span>{row.nextDueDate ? formatDateLocal(row.nextDueDate) : "—"}</span>
                                {row.dueBadge ? (
                                  <span className={`${styles.pill} ${dueBadgeClass(row.dueBadge)}`}>{row.dueBadge}</span>
                                ) : (
                                  <span className={`${styles.pill} ${styles.contractDueMuted}`}>—</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className={styles.contractActions}>
                                <button
                                  type="button"
                                  className={styles.btnGhostIcon}
                                  onClick={() => onView(row)}
                                  aria-label="Visualizar contrato"
                                  title="Visualizar"
                                >
                                  <IconEye />
                                </button>
                                {!readOnly ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhostIcon}
                                    onClick={() => openEdit(row)}
                                    aria-label="Editar contrato"
                                    title="Editar"
                                    style={{ color: "var(--color-primary)" }}
                                  >
                                    <IconEdit />
                                  </button>
                                ) : null}
                                <RowActionsMenu
                                  ariaLabel="Mais ações"
                                  preferUp
                                  triggerClassName={styles.btnGhostIcon}
                                  trigger={<IconMoreVertical />}
                                >
                                  <RowActionsMenuItem onSelect={() => onView(row)}>
                                    <IconEye /> Ver contrato
                                  </RowActionsMenuItem>
                                  {!readOnly ? (
                                    <RowActionsMenuItem onSelect={() => openEdit(row)}>
                                      <IconEdit /> Editar contrato
                                    </RowActionsMenuItem>
                                  ) : null}
                                  {!readOnly ? (
                                    <RowActionsMenuItem onSelect={() => onMenuAction("Duplicar", row)}>
                                      <IconCopy /> Duplicar
                                    </RowActionsMenuItem>
                                  ) : null}
                                  {!readOnly ? (
                                    <RowActionsMenuItem onSelect={() => onMenuAction("Renovar contrato", row)}>
                                      <IconRefreshCw /> Renovar contrato
                                    </RowActionsMenuItem>
                                  ) : null}
                                  <RowActionsMenuItem onSelect={() => onMenuAction("Gerar cobrança", row)}>
                                    <IconFileText /> Gerar cobrança
                                  </RowActionsMenuItem>
                                  <RowActionsMenuItem onSelect={() => onMenuAction("Gerar OS", row)}>
                                    <IconClipboardList /> Gerar OS
                                  </RowActionsMenuItem>
                                  <RowActionsMenuItem onSelect={() => onMenuAction("Enviar por WhatsApp", row)}>
                                    <IconMessageCircle /> Enviar por WhatsApp
                                  </RowActionsMenuItem>
                                  <RowActionsMenuItem onSelect={() => onMenuAction("Enviar por e-mail", row)}>
                                    <IconMail /> Enviar por e-mail
                                  </RowActionsMenuItem>
                                  <RowActionsMenuItem onSelect={() => onMenuAction("Baixar PDF", row)}>
                                    <IconDownload /> Baixar PDF
                                  </RowActionsMenuItem>
                                  {!readOnly ? (
                                    <RowActionsMenuItem danger onSelect={() => void onCloseContract(row)}>
                                      <IconX /> Encerrar contrato
                                    </RowActionsMenuItem>
                                  ) : null}
                                  {!readOnly && !row.isMock ? (
                                    <RowActionsMenuItem danger onSelect={() => void onDelete(row)}>
                                      Excluir
                                    </RowActionsMenuItem>
                                  ) : null}
                                </RowActionsMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className={styles.contractsMobileList}>
                  {pageRows.map((row) => {
                    const st = statusPill(row.status);
                    return (
                      <div key={row.id} className={styles.contractMobileCard}>
                        <div className={styles.contractMobileHead}>
                          <div className={styles.contractCell}>
                            <span className={styles.contractThumb} aria-hidden>
                              <IconFileText />
                            </span>
                            <span className={styles.contractCellText}>
                              <span className={styles.contractCode}>{row.code}</span>
                              <span className={styles.contractNumber}>{row.numberLabel}</span>
                            </span>
                          </div>
                          <span className={`${styles.pill} ${st.className}`}>
                            <st.Icon /> {st.label}
                          </span>
                        </div>
                        <div className={styles.contractMobileMeta}>
                          <span>
                            <strong>{row.type}</strong> · {row.category}
                          </span>
                          <span>
                            {row.siteName} · {row.siteBadge}
                          </span>
                          <span>
                            Vigência: {formatDateLocal(row.startDate)} a {formatDateLocal(row.endDate)}
                          </span>
                          <span>
                            {formatMoney(row.value)} · {row.recurrence}
                          </span>
                          <span>
                            Próximo vencimento: {row.nextDueDate ? formatDateLocal(row.nextDueDate) : "—"}
                            {row.dueBadge ? ` · ${row.dueBadge}` : ""}
                          </span>
                        </div>
                        <div className={styles.contractMobileFooter}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                            onClick={() => onView(row)}
                          >
                            <IconEye /> Ver
                          </button>
                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            {!readOnly ? (
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => openEdit(row)}
                                aria-label="Editar"
                              >
                                <IconEdit />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.btnGhostIcon}
                              onClick={() => onMenuAction("Baixar PDF", row)}
                              aria-label="Baixar PDF"
                            >
                              <IconDownload />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.paginationFooterRow}>
                  <ListPaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredRows.length}
                    itemsPerPage={pageSize}
                    onPageChange={setPage}
                    itemLabel="contrato"
                    itemLabelPlural="contratos"
                  />
                  <label className={styles.pageSizeField}>
                    Itens por página:
                    <select
                      className={styles.pageSizeSelect}
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
          </>
        )}

        {formOpen ? (
          <div className={styles.card} style={{ marginTop: "1.25rem", background: "#f8fafc" }}>
            <div className={styles.cardHeadRow}>
              <h4 className={styles.cardTitle} style={{ fontSize: "0.9375rem" }}>
                <IconFileText /> {editingId != null ? "Editar contrato" : "Novo contrato"}
              </h4>
              <button type="button" className={styles.btnGhostIcon} onClick={() => setFormOpen(false)} aria-label="Fechar">
                <IconX />
              </button>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Número<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  className={styles.fieldInput}
                  value={form.contract_number ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, contract_number: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Título<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  className={styles.fieldInput}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Tipo</label>
                <select
                  className={styles.fieldSelect}
                  value={form.contract_type}
                  onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value }))}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Recorrência</label>
                <select
                  className={styles.fieldSelect}
                  value={form.recurrence ?? "annual"}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                >
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                  <option value="one_time">Único</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Data início</label>
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Data final</label>
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Valor</label>
                <input
                  className={styles.fieldInput}
                  placeholder="R$ 0,00"
                  value={valueInput}
                  onChange={(e) => setValueInput(formatCurrencyBrlInput(e.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Status</label>
                <select
                  className={styles.fieldSelect}
                  value={form.status ?? "active"}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ClientContractStatus }))}
                >
                  {API_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>Observações</label>
                <textarea
                  className={styles.fieldTextarea}
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? "Salvando…" : "Salvar contrato"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
