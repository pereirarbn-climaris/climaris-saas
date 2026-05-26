/**
 * PreventiveMaintenancePage
 * Layout 100% baseado em CSS modules — mesma linguagem visual de ClientsListPage.
 * Nenhum uso de PreventiveManagementView para estrutura visual.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchPreventivePreview,
  fetchPreventiveSettings,
  listPreventiveItemsGrouped,
  sendPreventiveReminder,
  sendPreventiveRemindersBulk,
  type PreventiveItem,
  type PreventivePreview,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import type { DashboardOutletContext } from "../dashboardContext";
import { PreventiveCreateFormView } from "../../components/preventive";
import { getPreventiveStatus } from "../../lib/preventiveStatus";
import tableStyles from "../listTableCommon.module.css";
import styles from "./PreventiveMaintenancePage.module.css";

// ─── types ────────────────────────────────────────────────────────────────────
type PreventiveStatus = "em_dia" | "vence_este_mes" | "atrasada";
type StatusFilter = "all" | PreventiveStatus;

// ─── constants ────────────────────────────────────────────────────────────────
const WINDOW_OPTIONS = [
  { days: 7,   label: "7 dias"  },
  { days: 15,  label: "15 dias" },
  { days: 30,  label: "30 dias" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano"   },
] as const;

// ─── helpers ──────────────────────────────────────────────────────────────────
function getItemStatus(row: PreventiveItem): PreventiveStatus {
  const kind = getPreventiveStatus(row.dias_ate_vencimento, row.data_proximo_vencimento);
  if (kind === "overdue") return "atrasada";
  if (kind === "due_this_month") return "vence_este_mes";
  return "em_dia";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function equipmentCategoryLabel(tipo: string | null | undefined): string | null {
  const raw = (tipo ?? "").trim();
  if (!raw) return null;
  if (raw.toUpperCase() === "AR_CONDICIONADO") return "Ar condicionado";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function equipmentLabel(row: PreventiveItem): string {
  const ident = row.equipment_identificacao?.trim();
  const fromService = row.service_name?.replace(/^Preventiva\s*[—-]\s*/i, "").trim();
  let base = ident && fromService && ident !== fromService ? `${ident} — ${fromService}` : ident || fromService || "Equipamento";
  base = normalizeEquipmentLabelText(base);
  const category = equipmentCategoryLabel(row.equipment_tipo);
  if (category && !base.toLowerCase().startsWith(category.toLowerCase())) {
    base = `${category} ${base}`;
  }
  return base;
}

function historyPath(row: PreventiveItem): string {
  return row.equipment_id != null && row.equipment_id > 0
    ? `/app/clients/${row.client_id}?tab=historico`
    : `/app/clients/${row.client_id}?tab=preventiva`;
}

function initials(name: string): string {
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  if (chunks.length === 0) return "?";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
}

function avatarClass(id: number): string {
  const i = Math.abs(id) % 5;
  return [styles.avatarA, styles.avatarB, styles.avatarC, styles.avatarD, styles.avatarE][i] ?? styles.avatarA;
}

function windowLabel(d: number): string {
  return WINDOW_OPTIONS.find((o) => o.days === d)?.label ?? `${d} dias`;
}

function preventiveItemRowKey(row: PreventiveItem): string {
  return `${row.client_id}-${row.rule_id ?? 0}-${row.equipment_id ?? 0}-${row.historico_servico_id}`;
}

function preventiveWhatsAppGroupKey(row: PreventiveItem): string {
  const d = new Date(row.data_proximo_vencimento);
  return `${row.client_id}-${d.getFullYear()}-${d.getMonth() + 1}`;
}

type PreventiveMonthGroup = {
  key: string;
  client_id: number;
  client_name: string;
  whatsapp_valido: boolean;
  items: PreventiveItem[];
  dias_ate_vencimento: number;
  data_proximo_vencimento: string;
  data_ultima_realizacao: string;
};

function buildPreventiveMonthGroups(items: PreventiveItem[]): PreventiveMonthGroup[] {
  const map = new Map<string, PreventiveMonthGroup>();
  for (const row of items) {
    const key = preventiveWhatsAppGroupKey(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        client_id: row.client_id,
        client_name: row.client_name,
        whatsapp_valido: row.whatsapp_valido,
        items: [row],
        dias_ate_vencimento: row.dias_ate_vencimento,
        data_proximo_vencimento: row.data_proximo_vencimento,
        data_ultima_realizacao: row.data_ultima_realizacao,
      });
      continue;
    }
    existing.items.push(row);
    if (row.dias_ate_vencimento < existing.dias_ate_vencimento) {
      existing.dias_ate_vencimento = row.dias_ate_vencimento;
      existing.data_proximo_vencimento = row.data_proximo_vencimento;
    }
    if (row.data_ultima_realizacao < existing.data_ultima_realizacao) {
      existing.data_ultima_realizacao = row.data_ultima_realizacao;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.dias_ate_vencimento - b.dias_ate_vencimento || a.client_name.localeCompare(b.client_name),
  );
}

function getGroupStatus(group: PreventiveMonthGroup): PreventiveStatus {
  let status: PreventiveStatus = "em_dia";
  for (const item of group.items) {
    const s = getItemStatus(item);
    if (s === "atrasada") return "atrasada";
    if (s === "vence_este_mes") status = "vence_este_mes";
  }
  return status;
}

function formatDueMonthLabel(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface RowDropdownProps {
  row: PreventiveItem;
  canEdit: boolean;
  sending: boolean;
  previewOpen: boolean;
  whatsappGroupSize: number;
  onGenerateOS: () => void;
  onViewHistory: () => void;
  onPreviewWhatsApp: () => void;
  onSendWhatsApp: () => void;
}

function RowDropdown({
  row,
  canEdit,
  sending,
  previewOpen,
  whatsappGroupSize,
  onGenerateOS,
  onViewHistory,
  onPreviewWhatsApp,
  onSendWhatsApp,
}: RowDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const canSendWa    = row.whatsapp_valido;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const menuHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight;
      setMenuStyle({
        position: "fixed",
        right: Math.max(12, window.innerWidth - rect.right),
        top: openUp ? Math.max(12, rect.top - 4) : rect.bottom + 4,
        transform: openUp ? "translateY(-100%)" : undefined,
        zIndex: 1200,
      });
    }
    setOpen((v) => !v);
  }

  return (
    <div className={styles.dropdownWrap} ref={wrapRef}>
      <button
        type="button"
        aria-label="Ações"
        aria-expanded={open}
        className={`${styles.dropdownTrigger} ${open ? styles.dropdownTriggerOpen : ""}`}
        onClick={toggleOpen}
      >
        {/* three-dots icon */}
        <svg viewBox="0 0 24 24" style={{ width: "1rem", height: "1rem", stroke: "currentColor", fill: "none", strokeWidth: 2 }}>
          <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
        </svg>
      </button>

      {open && (
        <div className={styles.dropdownMenu} style={menuStyle} role="menu">
          <button
            type="button"
            className={styles.dropdownItem}
            role="menuitem"
            onClick={() => { onGenerateOS(); setOpen(false); }}
          >
            <svg viewBox="0 0 24 24" className={styles.dropdownItemIcon}>
              <rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
            </svg>
            Gerar OS
          </button>
          <button
            type="button"
            className={styles.dropdownItem}
            role="menuitem"
            onClick={() => { onViewHistory(); setOpen(false); }}
          >
            <svg viewBox="0 0 24 24" className={styles.dropdownItemIcon}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
            </svg>
            Ver Histórico
          </button>

          {canSendWa && (
            <>
              <div className={styles.dropdownDivider} role="separator" />
              <button
                type="button"
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => { onPreviewWhatsApp(); setOpen(false); }}
              >
                {previewOpen ? "Fechar prévia" : "Prévia WhatsApp"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className={styles.dropdownItem}
                  role="menuitem"
                  disabled={sending}
                  onClick={() => { onSendWhatsApp(); setOpen(false); }}
                >
                  {sending
                    ? "Enviando…"
                    : whatsappGroupSize > 1
                      ? `Enviar WhatsApp (${whatsappGroupSize} equip.)`
                      : "Enviar WhatsApp"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── table skeleton ───────────────────────────────────────────────────────────
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {[100, 140, 90, 90, 70, 32].map((w, j) => (
            <td key={j}>
              <div
                style={{
                  height: "1.25rem",
                  width: `${w}px`,
                  borderRadius: "0.375rem",
                  background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.2s ease-in-out infinite",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export function PreventiveMaintenancePage() {
  const navigate  = useNavigate();
  const ctx       = useOutletContext<DashboardOutletContext | undefined>();
  const canEdit   = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  // ── data state ──────────────────────────────────────────────────────────────
  const [days,          setDays]          = useState<number>(30);
  const [items,         setItems]         = useState<PreventiveItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadErr,       setLoadErr]       = useState("");
  const [settings,      setSettings]      = useState<PreventiveSettings | null>(null);

  // ── filter state ────────────────────────────────────────────────────────────
  const [searchInput,   setSearchInput]   = useState("");
  const [searchQ,       setSearchQ]       = useState("");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("all");

  // ── preview / send state ─────────────────────────────────────────────────────
  const [selectedPreviewGroupKey, setSelectedPreviewGroupKey] = useState<string | null>(null);
  const [preview,           setPreview]           = useState<PreventivePreview | null>(null);
  const [previewErr,        setPreviewErr]        = useState("");
  const [sendErr,           setSendErr]           = useState("");
  const [sendingId,         setSendingId]         = useState<number | null>(null);
  const [bulkSending,       setBulkSending]       = useState(false);
  const [bulkNotice,        setBulkNotice]        = useState("");
  const [createOpen,        setCreateOpen]        = useState(false);

  // ── debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ── fetch ────────────────────────────────────────────────────────────────────
  const refreshList = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const [grouped, st] = await Promise.all([
        listPreventiveItemsGrouped(days),
        fetchPreventiveSettings(),
      ]);
      setItems(grouped.items);
      setSettings(st);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void refreshList(); }, [refreshList]);

  // ── preview loader ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedPreviewGroupKey == null) { setPreview(null); setPreviewErr(""); return; }
    const row = items.find((r) => preventiveWhatsAppGroupKey(r) === selectedPreviewGroupKey);
    if (row == null) { setPreview(null); setPreviewErr(""); return; }
    let cancelled = false;
    void (async () => {
      try {
        const p = await fetchPreventivePreview({
          historico_servico_id: row.historico_servico_id > 0 ? row.historico_servico_id : undefined,
          rule_id: row.rule_id ?? undefined,
          window_days: days,
        });
        if (!cancelled) { setPreview(p); setPreviewErr(""); }
      } catch (e) {
        if (!cancelled) { setPreview(null); setPreviewErr(e instanceof Error ? e.message : "Prévia indisponível."); }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPreviewGroupKey, items, days]);

  async function handleSend(row: PreventiveItem) {
    setSendErr(""); setBulkNotice("");
    const sendKey = row.historico_servico_id > 0 ? row.historico_servico_id : (row.rule_id ?? 0);
    setSendingId(sendKey);
    try {
      const payload =
        row.historico_servico_id > 0
          ? {
              historico_servico_id: row.historico_servico_id,
              window_days: days,
              promo_image_url: settings?.preventive_promo_image_url ?? undefined,
            }
          : {
              rule_id: row.rule_id ?? undefined,
              window_days: days,
              promo_image_url: settings?.preventive_promo_image_url ?? undefined,
            };
      const r = await sendPreventiveReminder(payload);
      if (r.processing_in_background)
        setBulkNotice("Envio iniciado em segundo plano (agrupado por cliente e mês). Clique em Atualizar para conferir.");
      await refreshList();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setSendingId(null);
    }
  }

  async function handleBulkSend() {
    if (!window.confirm(
      `Enviar campanha WhatsApp para ${whatsappEligibleCount} cliente(s) (agrupado por mês de vencimento) nesta janela (${windowLabel(days)})?`
    )) return;
    setSendErr(""); setBulkNotice(""); setBulkSending(true);
    try {
      const r = await sendPreventiveRemindersBulk({
        window_days_if_empty: days,
        promo_image_url:      settings?.preventive_promo_image_url ?? undefined,
      });
      if (r.processing_in_background)
        setBulkNotice(`Envio em lote para ${r.attempted} cliente(s) (agrupado por mês) iniciado em segundo plano.`);
      else if (r.failed > 0)
        setSendErr(`Enviados ${r.sent}/${r.attempted}. Falhas: ${r.failed}. Primeiro erro: ${r.errors[0]?.detail ?? "—"}`);
      await refreshList();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Falha no envio em lote.");
    } finally {
      setBulkSending(false);
    }
  }

  // ── derived ──────────────────────────────────────────────────────────────────
  const whatsappEligibleCount = useMemo(() => {
    const groups = new Set<string>();
    for (const r of items) {
      if (!r.whatsapp_valido) continue;
      groups.add(preventiveWhatsAppGroupKey(r));
    }
    return groups.size;
  }, [items]);

  const selectedPreviewRow = useMemo(
    () => selectedPreviewGroupKey != null
      ? (items.find((r) => preventiveWhatsAppGroupKey(r) === selectedPreviewGroupKey) ?? null)
      : null,
    [items, selectedPreviewGroupKey],
  );

  const selectedPreviewGroupItems = useMemo(
    () => selectedPreviewGroupKey != null
      ? items.filter((r) => preventiveWhatsAppGroupKey(r) === selectedPreviewGroupKey)
      : [],
    [items, selectedPreviewGroupKey],
  );

  const filteredItems = useMemo(() => {
    const q = searchQ.toLowerCase();
    return items
      .filter((row) => {
        if (q) {
          const matchName = row.client_name.toLowerCase().includes(q);
          const matchEquip = equipmentLabel(row).toLowerCase().includes(q);
          if (!matchName && !matchEquip) return false;
        }
        if (statusFilter === "all") return true;
        return getItemStatus(row) === statusFilter;
      })
      .sort(
        (a, b) =>
          a.dias_ate_vencimento - b.dias_ate_vencimento ||
          a.client_name.localeCompare(b.client_name) ||
          equipmentLabel(a).localeCompare(equipmentLabel(b)),
      );
  }, [items, searchQ, statusFilter]);

  const whatsappGroupSizes = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      if (!row.whatsapp_valido) continue;
      const key = preventiveWhatsAppGroupKey(row);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const metrics = useMemo(() => {
    const groups = buildPreventiveMonthGroups(items);
    const clientIds = new Set(groups.map((g) => g.client_id));
    let onTime = 0;
    let overdue = 0;
    for (const group of groups) {
      if (getGroupStatus(group) === "atrasada") overdue++;
      else onTime++;
    }
    return { activeContracts: clientIds.size, onTime, overdue, groupCount: groups.length };
  }, [items]);

  // ── status pill helper ───────────────────────────────────────────────────────
  function StatusPill({ status }: { status: PreventiveStatus }) {
    const cls =
      status === "atrasada"       ? styles.statusAtrasada :
      status === "vence_este_mes" ? styles.statusVence    :
                                    styles.statusEmDia;
    const label =
      status === "atrasada"       ? "Atrasada"        :
      status === "vence_este_mes" ? "Vence este Mês"  :
                                    "Em Dia";
    return <span className={`${styles.statusPill} ${cls}`}>{label}</span>;
  }

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.wrap}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Gestão Preventiva</h1>
          <p className={styles.pageSubtitle}>
            Gerencie os contratos e cronogramas de manutenção preventiva
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className={tableStyles.listToolbarBtnPrimary}
            onClick={() => setCreateOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "1.125rem", height: "1.125rem" }}>
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            Nova Preventiva
          </button>
        ) : null}
      </header>

      <p className={styles.pageSubtitle} style={{ marginBottom: "1rem" }}>
        Mensagens WhatsApp, botões e respostas dos clientes:{" "}
        <Link to="/app/integrations/whatsapp">Integrações → WhatsApp → Gestão preventiva</Link>
      </p>

      {/* ── Stat cards (3 cols — same token as Clients) ───────────────────── */}
      <div className={styles.heroStats}>
        {/* Contratos Ativos */}
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Contratos Ativos</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.activeContracts}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>clientes distintos</p>
        </article>

        {/* No Prazo */}
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Grupos no Prazo</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.onTime}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>dentro do período</p>
        </article>

        {/* Atrasadas */}
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Atrasadas</p>
              <p className={styles.statValue}>{loading ? "—" : metrics.overdue}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>fora do prazo</p>
        </article>
      </div>

      {/* ── Toolbar (search + window pills + status + actions) ────────────── */}
      <div className={tableStyles.listToolbar}>
        {/* Search */}
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

        {/* Window pills + Status + Buttons */}
        <div className={tableStyles.listToolbarActions}>
          {/* Janela pills */}
          <div className={styles.windowCol}>
            <label className={tableStyles.listToolbarLabel}>Janela</label>
            <div className={styles.windowPills}>
              {WINDOW_OPTIONS.map(({ days: d, label }) => (
                <button
                  key={d}
                  type="button"
                  className={days === d ? styles.windowPillActive : styles.windowPill}
                  onClick={() => setDays(d)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className={tableStyles.listToolbarFilterBlock}>
            <label className={tableStyles.listToolbarLabel} htmlFor="prev-status">
              Status
            </label>
            <select
              id="prev-status"
              className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Todos os Status</option>
              <option value="em_dia">Em Dia</option>
              <option value="vence_este_mes">Vence este Mês</option>
              <option value="atrasada">Atrasada</option>
            </select>
          </div>

          {/* Action buttons */}
          <button
            type="button"
            className={tableStyles.listToolbarBtnGhost}
            onClick={() => void refreshList()}
            disabled={loading}
          >
            Atualizar
          </button>

          {canEdit ? (
            <button
              type="button"
              className={tableStyles.listToolbarBtnGhost}
              disabled={bulkSending || loading || whatsappEligibleCount === 0}
              onClick={() => void handleBulkSend()}
            >
              {bulkSending ? "Enviando lote…" : `Enviar WhatsApp (${whatsappEligibleCount})`}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      {loadErr    ? <p className={styles.msgErr}    role="alert">{loadErr}</p>    : null}
      {sendErr    ? <p className={styles.msgErr}    role="alert">{sendErr}</p>    : null}
      {bulkNotice ? <p className={styles.msgNotice}            >{bulkNotice}</p>  : null}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Equipamento / Setor</th>
              <th>Última Manutenção</th>
              <th>Próxima Manutenção</th>
              <th>Status</th>
              <th className={tableStyles.tailActionsCol} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} />
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                  <div>
                    <svg viewBox="0 0 24 24" style={{ width: "2.5rem", height: "2.5rem", stroke: "#cbd5e1", fill: "none", strokeWidth: 1.5, margin: "0 auto 0.75rem", display: "block" }}>
                      <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" />
                    </svg>
                    <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Nenhuma preventiva encontrada</p>
                    <p style={{ fontSize: "0.875rem" }}>Cadastre uma nova preventiva para começar</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((row) => {
                const groupKey = preventiveWhatsAppGroupKey(row);
                return (
                <tr key={preventiveItemRowKey(row)}>
                  <td>
                    <div className={styles.clientCell}>
                      <span className={`${styles.avatar} ${avatarClass(row.client_id)}`}>
                        {initials(row.client_name)}
                      </span>
                      <span className={styles.clientName}>{row.client_name}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.equipCell}>
                      <span className={styles.equipName}>{equipmentLabel(row)}</span>
                    </div>
                  </td>
                  <td>{formatDate(row.data_ultima_realizacao)}</td>
                  <td>
                    <div className={styles.equipCell}>
                      <span className={styles.equipName}>{formatDueMonthLabel(row.data_proximo_vencimento)}</span>
                      <span className={styles.equipSector}>{formatDate(row.data_proximo_vencimento)}</span>
                    </div>
                  </td>
                  <td><StatusPill status={getItemStatus(row)} /></td>
                  <td className={tableStyles.tailActionsCol}>
                    <div className={tableStyles.rowActions}>
                      <RowDropdown
                        row={row}
                        canEdit={canEdit}
                        whatsappGroupSize={whatsappGroupSizes.get(groupKey) ?? 1}
                        sending={
                          sendingId === row.historico_servico_id ||
                          (row.historico_servico_id <= 0 && sendingId === (row.rule_id ?? 0))
                        }
                        previewOpen={selectedPreviewGroupKey === groupKey}
                        onGenerateOS={() => navigate("/app/service-orders/new")}
                        onViewHistory={() => navigate(historyPath(row))}
                        onPreviewWhatsApp={() => {
                          setSelectedPreviewGroupKey(selectedPreviewGroupKey === groupKey ? null : groupKey);
                        }}
                        onSendWhatsApp={() => void handleSend(row)}
                      />
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Prévia WhatsApp ───────────────────────────────────────────────── */}
      {selectedPreviewGroupKey != null && selectedPreviewRow ? (
        <div className={styles.previewPanel}>
          <h3 className={styles.previewTitle}>Prévia da mensagem</h3>
          {preview?.is_grouped ? (
            <p className={styles.previewMeta}>
              Mensagem agrupada — {preview.equipment_count ?? selectedPreviewGroupItems.length} equipamento(s):{" "}
              {selectedPreviewGroupItems.map((r) => equipmentLabel(r)).join(" · ")}
            </p>
          ) : null}
          {previewErr ? <p className={styles.err}>{previewErr}</p> : null}
          {preview ? (
            <>
              <div className={styles.previewBox}>{preview.message_text}</div>
              <p className={styles.previewMeta}>
                Botões: "{preview.button_more_label}" · "{preview.button_schedule_label}"
              </p>
              {preview.image_url ? (
                <img
                  className={styles.previewImg}
                  src={preview.image_url}
                  alt="Campanha"
                  onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                />
              ) : (
                <p className={styles.previewMeta}>Nenhuma imagem configurada (opcional).</p>
              )}
            </>
          ) : (
            !previewErr && <p className={styles.loadingHint}>Carregando prévia…</p>
          )}
        </div>
      ) : null}

      {/* ── Modal Nova Preventiva ──────────────────────────────────────────── */}
      <PreventiveCreateFormView
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        preventiveSettings={settings}
        onCreated={async (out) => {
          setCreateOpen(false);
          await refreshList();
          if (out.whatsapp_job?.scheduled_for) {
            window.alert(
              `Lembrete agendado para ${new Date(out.whatsapp_job.scheduled_for).toLocaleString(
                "pt-BR", { dateStyle: "short", timeStyle: "short" },
              )}.`,
            );
          }
        }}
      />
    </div>
  );
}
