import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Calendar, ClipboardCheck, ClipboardList, LayoutDashboard, Shield, Snowflake, User } from "lucide-react";
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  activatePmocPlan,
  archivePmocPlan,
  createPmocActivity,
  deactivatePmocPlan,
  deletePmocActivity,
  deletePmocArt,
  getPmocPlan,
  listPmocActivities,
  listPmocEquipments,
  replacePmocEquipments,
  updatePmocActivity,
  updatePmocPlan,
  uploadPmocArt,
  type PmocAirQualityAnalysisOut,
  type PmocFrequency,
  type PmocPlanEquipmentOut,
  type PmocPlanOut,
  type PmocScheduledActivityOut,
} from "../../api/pmoc";
import { listClientHvacEquipments, type EquipmentOut } from "../../api/clients";
import { listServices, type ServiceOut } from "../../api/services";
import { PmocAirAnalysisSection } from "../../components/pmoc/PmocAirAnalysisSection";
import { PmocCreateStatusBanner, type PmocCreateTab } from "../../components/pmoc/PmocCreateStatusBanner";
import { PmocFormCard } from "../../components/pmoc/PmocFormCard";
import { PmocPlanningTab } from "../../components/pmoc/PmocPlanningTab";
import { PmocScheduleActivitiesModal } from "../../components/pmoc/PmocScheduleActivitiesModal";
import { Button } from "../../components/ui/button";
import { ToastHost } from "../../components/ToastHost";
import { formatDurationMinutes } from "../../lib/formatDuration";
import { pmocEstablishmentLabel, pmocIdentificationFields } from "../../lib/pmocEstablishment";
import { importOfficialPmocTemplateActivities } from "../../lib/pmocOfficialTemplate";
import { parsePlanningScheduledRowKeys } from "../../lib/pmocPlanningExtras";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import pmocStyles from "./PmocPages.module.css";
import createStyles from "./PmocCreatePage.module.css";

type Tab = PmocCreateTab;

const VALID_TABS: Tab[] = ["identification", "schedule", "air", "planning"];

function tabFromSearch(raw: string | null): Tab {
  if (raw === "overview" || raw === "equipments") return "identification";
  if (raw === "executions" || raw === "occurrences") return "planning";
  if (raw && (VALID_TABS as string[]).includes(raw)) return raw as Tab;
  return "identification";
}

const FREQ_OPTIONS: { value: PmocFrequency; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "custom", label: "Personalizado" },
];

function statusLabel(s: PmocPlanOut["status"]): string {
  const m: Record<PmocPlanOut["status"], string> = {
    draft: "Rascunho",
    active: "Ativa",
    inactive: "Inativa",
    archived: "Arquivada",
  };
  return m[s];
}

function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function PmocDetailPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const { pmocId: pmocIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const pmocId = pmocIdParam ? Number.parseInt(pmocIdParam, 10) : NaN;

  const fromClientNum = useMemo(() => {
    const raw = searchParams.get("from_client");
    if (!raw) return NaN;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : NaN;
  }, [searchParams]);

  const [tab, setTab] = useState<Tab>(() => tabFromSearch(searchParams.get("tab")));
  const [plan, setPlan] = useState<PmocPlanOut | null>(null);
  const [pmocEquipments, setPmocEquipments] = useState<PmocPlanEquipmentOut[]>([]);
  const [clientEquipments, setClientEquipments] = useState<EquipmentOut[]>([]);
  const [activities, setActivities] = useState<PmocScheduledActivityOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msgOk, setMsgOk] = useState("");

  const [draft, setDraft] = useState({
    title: "",
    version_label: "",
    law_reference_note: "",
    internal_notes: "",
    responsible_name: "",
    responsible_council: "",
    responsible_registration: "",
    art_number: "",
    art_issued_at: "",
    next_air_analysis_due: "",
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingArtFields, setSavingArtFields] = useState(false);
  const [isUploadingArt, setIsUploadingArt] = useState(false);

  const [selectedEquipIds, setSelectedEquipIds] = useState<number[]>([]);

  const [newAct, setNewAct] = useState({
    title: "",
    frequency: "monthly" as PmocFrequency,
    equipment_id: "" as "" | number,
    service_id: "" as "" | number,
    description: "",
    task_code: "",
  });

  const [editAct, setEditAct] = useState<PmocScheduledActivityOut | null>(null);
  const [newActEquipmentOpen, setNewActEquipmentOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleFocus, setScheduleFocus] = useState<{ equipmentId: number; activityId: number } | null>(null);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [catalogServices, setCatalogServices] = useState<ServiceOut[]>([]);

  const sortedCatalogServices = useMemo(
    () =>
      [...catalogServices].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      ),
    [catalogServices],
  );


  const canEdit =
    ctx?.user.role === "admin" || ctx?.user.role === "receptionist" || ctx?.user.role === "technician";

  const canScheduleOs = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  function selectTab(next: Tab) {
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  }

  function openScheduleModal() {
    setScheduleFocus(null);
    setScheduleModalOpen(true);
  }

  function closeScheduleModal() {
    setScheduleModalOpen(false);
    setScheduleFocus(null);
  }

  const load = useCallback(async () => {
    if (!Number.isFinite(pmocId)) return;
    setLoading(true);
    setErr("");
    setMsgOk("");
    try {
      const p = await getPmocPlan(pmocId);
      setPlan(p);
      setDraft({
        title: p.title,
        version_label: p.version_label,
        law_reference_note: p.law_reference_note ?? "",
        internal_notes: p.internal_notes ?? "",
        responsible_name: p.responsible_name ?? "",
        responsible_council: p.responsible_council ?? "",
        responsible_registration: p.responsible_registration ?? "",
        art_number: p.art_number ?? "",
        art_issued_at: toInputDate(p.art_issued_at),
        next_air_analysis_due: toInputDate(p.next_air_analysis_due),
      });
      const [eq, acts, ce] = await Promise.all([
        listPmocEquipments(pmocId),
        listPmocActivities(pmocId),
        listClientHvacEquipments(p.client_id, {
          only_active: true,
          client_site_id: p.client_site_id ?? undefined,
        }),
      ]);
      setPmocEquipments(eq);
      setSelectedEquipIds(eq.map((e) => e.equipment_id));
      setActivities(acts);
      setClientEquipments(ce);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar PMOC.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [pmocId]);

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !plan || searchParams.get("openSchedule") !== "1") return;
    selectTab("planning");
    const next = new URLSearchParams(searchParams);
    next.set("tab", "planning");
    next.delete("openSchedule");
    setSearchParams(next, { replace: true });
  }, [loading, plan, searchParams, setSearchParams]);

  useEffect(() => {
    if (tab !== "schedule" && tab !== "planning") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listServices({ limit: 200 });
        if (!cancelled) {
          setCatalogServices(rows.filter((s) => s.is_active));
        }
      } catch {
        if (!cancelled) setCatalogServices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  async function onImportOfficialTemplate() {
    if (!plan) return;
    setImportingTemplate(true);
    setErr("");
    setMsgOk("");
    try {
      const created = await importOfficialPmocTemplateActivities(plan.id, activities);
      setActivities(await listPmocActivities(plan.id));
      setMsgOk(
        created > 0
          ? `${created} atividade(s) do modelo oficial importada(s).`
          : "O cronograma já contém todas as atividades do modelo oficial.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível importar o modelo oficial.");
    } finally {
      setImportingTemplate(false);
    }
  }

  async function onCreateActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !newAct.title.trim()) return;
    setErr("");
    try {
      await createPmocActivity(plan.id, {
        title: newAct.title.trim(),
        frequency: newAct.frequency,
        equipment_id: newAct.equipment_id === "" ? null : newAct.equipment_id,
        service_id: newAct.service_id === "" ? null : newAct.service_id,
        description: newAct.description.trim() || null,
        task_code: newAct.task_code.trim() || null,
      });
      setNewAct({
        title: "",
        frequency: "monthly",
        equipment_id: "",
        service_id: "",
        description: "",
        task_code: "",
      });
      setNewActEquipmentOpen(false);
      setActivities(await listPmocActivities(plan.id));
      setMsgOk("Atividade incluída.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao criar atividade.");
    }
  }

  async function onSaveEditActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !editAct) return;
    setErr("");
    try {
      await updatePmocActivity(plan.id, editAct.id, {
        title: editAct.title.trim(),
        frequency: editAct.frequency,
        equipment_id: editAct.equipment_id,
        service_id: editAct.service_id,
        description: editAct.description?.trim() || null,
        task_code: editAct.task_code?.trim() || null,
        sort_order: editAct.sort_order,
      });
      setEditAct(null);
      setActivities(await listPmocActivities(plan.id));
      setMsgOk("Atividade atualizada.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao salvar atividade.");
    }
  }

  async function onDeleteActivity(id: number) {
    if (!plan) return;
    if (!window.confirm("Excluir esta atividade do cronograma?")) return;
    setErr("");
    try {
      await deletePmocActivity(plan.id, id);
      setActivities(await listPmocActivities(plan.id));
      setMsgOk("Atividade removida.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao excluir.");
    }
  }

  async function saveArtFields() {
    if (!plan) return;
    setSavingArtFields(true);
    setErr("");
    setMsgOk("");
    try {
      const updated = await updatePmocPlan(plan.id, {
        responsible_name: draft.responsible_name.trim() || null,
        responsible_council: draft.responsible_council.trim() || null,
        responsible_registration: draft.responsible_registration.trim() || null,
        art_number: draft.art_number.trim() || null,
        art_issued_at: draft.art_issued_at ? draft.art_issued_at : null,
        next_air_analysis_due: draft.next_air_analysis_due ? draft.next_air_analysis_due : null,
      });
      setPlan(updated);
      toast.success("Dados da ART e responsável técnico salvos.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível salvar.";
      setErr(message);
      toast.error(message);
    } finally {
      setSavingArtFields(false);
    }
  }

  async function onUploadArt(file: File | null) {
    if (!plan || !file) return;
    setIsUploadingArt(true);
    setErr("");
    try {
      const p = await uploadPmocArt(plan.id, file);
      setPlan(p);
      toast.success("PDF da ART enviado e arquivado com sucesso.");
    } catch (e2) {
      const message = e2 instanceof Error ? e2.message : "Falha no upload.";
      setErr(message);
      toast.error(message);
    } finally {
      setIsUploadingArt(false);
    }
  }

  async function onRemoveArt() {
    if (!plan) return;
    if (!window.confirm("Remover o arquivo de ART deste plano?")) return;
    setErr("");
    try {
      const p = await deletePmocArt(plan.id);
      setPlan(p);
      setMsgOk("ART removida.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao remover.");
    }
  }

  async function refreshPlanAfterAirUpload() {
    if (!plan) return;
    try {
      const p = await getPmocPlan(plan.id);
      setPlan(p);
      setDraft((d) => ({ ...d, next_air_analysis_due: toInputDate(p.next_air_analysis_due) }));
    } catch {
      /* falha silenciosa no detalhe */
    }
  }

  async function refreshPlanAfterPlanningSchedule() {
    if (!plan) return;
    try {
      const p = await getPmocPlan(plan.id);
      setPlan(p);
    } catch {
      /* falha silenciosa no detalhe */
    }
  }

  const handleAirAnalysesChange = useCallback((_rows: PmocAirQualityAnalysisOut[]) => {
    void refreshPlanAfterAirUpload();
  }, [plan?.id]);

  const identificationFields = useMemo(
    () => (plan ? pmocIdentificationFields(plan) : []),
    [plan],
  );

  const backToClientPath = useMemo(() => {
    if (!Number.isFinite(fromClientNum) || !plan) return null;
    if (fromClientNum !== plan.client_id) return null;
    return `/app/clients/${plan.client_id}?tab=pmoc`;
  }, [fromClientNum, plan]);

  const backHref = backToClientPath ?? "/app/pmoc";

  const planningEquipments = useMemo(
    () =>
      clientEquipments.map((eq) => ({
        id: String(eq.id),
        siteId: String(plan?.client_site_id ?? ""),
        identificacao: eq.identificacao,
        fabricante: eq.fabricante ?? "—",
        modelo: eq.modelo ?? "—",
        capacidadeBtu: eq.capacidade_btu ?? 0,
        localInstalacao: eq.local_instalacao ?? eq.identificacao,
      })),
    [clientEquipments, plan?.client_site_id],
  );

  const planningActivities = useMemo(
    () =>
      activities.map((row) => {
        const catalogSvc =
          row.service_id != null ? catalogServices.find((s) => s.id === row.service_id) : undefined;
        const durationMinutes =
          Number(catalogSvc?.duration_minutes ?? row.service?.duration_minutes) || undefined;
        return {
          id: String(row.id),
          service: row.title,
          serviceId: row.service_id ?? undefined,
          durationMinutes,
          frequency: row.frequency,
          frequencyLabel: FREQ_OPTIONS.find((f) => f.value === row.frequency)?.label ?? row.frequency,
          equipment:
            row.equipment_id == null
              ? null
              : pmocEquipments.find((e) => e.equipment_id === row.equipment_id)?.identificacao ?? null,
          scheduledDate: new Date().toISOString().slice(0, 10),
        };
      }),
    [activities, pmocEquipments, catalogServices],
  );

  async function handleFooterSave() {
    if (!plan || !canEdit) return;
    if (tab === "air") {
      await saveArtFields();
      return;
    }
    if (tab === "identification") {
      setSavingPlan(true);
      setErr("");
      try {
        const updated = await updatePmocPlan(plan.id, {
          title: draft.title.trim(),
          version_label: draft.version_label.trim(),
          law_reference_note: draft.law_reference_note.trim() || null,
          internal_notes: draft.internal_notes.trim() || null,
        });
        setPlan(updated);
        const orderedSelected = clientEquipments
          .filter((eq) => selectedEquipIds.includes(eq.id))
          .map((eq) => eq.id);
        const list = await replacePmocEquipments(plan.id, orderedSelected);
        setPmocEquipments(list);
        const refreshed = await getPmocPlan(plan.id);
        setPlan(refreshed);
        toast.success("Identificação e equipamentos salvos.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Não foi possível salvar.";
        setErr(message);
        toast.error(message);
      } finally {
        setSavingPlan(false);
      }
      return;
    }
  }

  function toggleEquip(id: number) {
    setSelectedEquipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** Live BTU sum — recalculated on every checkbox toggle */
  const selectedBtuSum = useMemo(
    () =>
      clientEquipments
        .filter((eq) => selectedEquipIds.includes(eq.id))
        .reduce((acc, eq) => acc + (eq.capacidade_btu ?? 0), 0),
    [clientEquipments, selectedEquipIds],
  );

  if (!ctx) return <Navigate to="/login" replace />;
  if (!Number.isFinite(pmocId)) return <Navigate to="/app/pmoc" replace />;

  if (loading && !plan) {
    return (
      <div className={pmocStyles.wrap}>
        <p className={pmocStyles.loading}>Carregando PMOC…</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={pmocStyles.wrap}>
        <p className={pmocStyles.msgErr}>{err || "PMOC não encontrado."}</p>
        <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          {Number.isFinite(fromClientNum) ? (
            <Link to={`/app/clients/${fromClientNum}?tab=pmoc`} className={pmocStyles.btnBackLink}>
              ← Voltar ao cliente
            </Link>
          ) : null}
          <Link to="/app/pmoc" className={pmocStyles.rowLink}>
            Lista PMOC
          </Link>
        </p>
      </div>
    );
  }

  const detailTabs: { id: Tab; label: string }[] = [
    { id: "identification", label: "Identificação do Cliente" },
    { id: "schedule", label: "Cronograma" },
    { id: "air", label: "Ar & ART" },
    { id: "planning", label: "Planejamento" },
  ];

  const statusBadgeClass =
    plan.status === "draft"
      ? createStyles.badgeDraft
      : plan.status === "archived"
        ? createStyles.badgeDraft
        : createStyles.badgeType;

  return (
    <div className={createStyles.pageShell}>
      <header className={createStyles.pageHeader}>
        <div className={createStyles.pageHeaderInner}>
          <h1 className={createStyles.title}>{plan.title}</h1>
          <div className={createStyles.badges}>
            <span className={statusBadgeClass}>{statusLabel(plan.status)}</span>
            <span className={createStyles.badgeType}>PMOC</span>
          </div>
          <p className={createStyles.lead}>
            Cliente:{" "}
            <Link className={pmocStyles.rowLink} to={`/app/clients/${plan.client_id}`}>
              {plan.client?.name ?? `#${plan.client_id}`}
            </Link>
            {" · "}
            Obra: {pmocEstablishmentLabel(plan)} · Versão {plan.version_label}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginTop: "0.65rem" }}>
            <Link to={`/app/pmoc/conformidade/${plan.id}`} className={pmocStyles.rowLink}>
              <LayoutDashboard size={14} style={{ verticalAlign: "middle", marginRight: "0.25rem" }} aria-hidden />
              Painel de conformidade
            </Link>
            {canEdit ? (
              <Link to={`/app/pmoc/execucao/${plan.id}`} className={pmocStyles.rowLink}>
                <ClipboardCheck size={14} style={{ verticalAlign: "middle", marginRight: "0.25rem" }} aria-hidden />
                Iniciar vistoria
              </Link>
            ) : null}
            {canScheduleOs && (plan.status === "active" || plan.status === "draft") ? (
              <button
                type="button"
                className={pmocStyles.rowLink}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                disabled={pmocEquipments.length === 0}
                onClick={() => openScheduleModal()}
              >
                Gerar ordem de serviço (OS)
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className={createStyles.content}>
        <PmocCreateStatusBanner
          selectedBtuSum={selectedBtuSum}
          equipmentCount={pmocEquipments.length}
          activityCount={activities.length}
          hasResponsibleTech={Boolean(draft.responsible_name.trim())}
          onNavigateTab={selectTab}
        />

        <nav className={createStyles.tabNav} role="tablist" aria-label="Seções do PMOC">
          {detailTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`${createStyles.tabNavBtn} ${tab === item.id ? createStyles.tabNavBtnActive : ""}`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className={createStyles.tabStack}>
          {err ? <p className={pmocStyles.msgErr}>{err}</p> : null}
          {msgOk ? <p className={pmocStyles.msgOk}>{msgOk}</p> : null}

      {tab === "identification" ? (
        <>
          <PmocFormCard icon={<User size={20} />} title="Cliente e obra" subtitle="Dados vinculados ao plano PMOC">
            <div className={createStyles.selectedPill}>
              <div className={createStyles.selectedPillLabel}>Cliente</div>
              <div className={createStyles.selectedPillValue}>{plan.client?.name ?? `#${plan.client_id}`}</div>
            </div>
            <div className={createStyles.selectedPill} style={{ marginTop: "0.65rem" }}>
              <div className={createStyles.selectedPillLabel}>Obra / filial</div>
              <div className={createStyles.selectedPillValue}>{pmocEstablishmentLabel(plan)}</div>
            </div>
            {identificationFields.length > 0 ? (
              <dl className={pmocStyles.grid2} style={{ margin: "0.85rem 0 0" }}>
                {identificationFields.map((field) => (
                  <div key={field.label}>
                    <dt className={pmocStyles.metaMuted}>{field.label}</dt>
                    <dd style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </PmocFormCard>

          <PmocFormCard
            icon={<Snowflake size={20} />}
            title="Equipamentos da unidade"
            subtitle="Selecione os equipamentos que compõem este PMOC"
          >
            <div className={pmocStyles.btuSummaryCard}>
              <div className={pmocStyles.btuSummaryRow}>
                <span className={pmocStyles.btuSummaryLabel}>Capacidade total selecionada</span>
                <span className={pmocStyles.btuSummaryValue}>{formatBtu(selectedBtuSum)}</span>
              </div>
              <div className={pmocStyles.btuSummaryRow} style={{ marginTop: "0.35rem" }}>
                <span className={pmocStyles.btuSummaryLabel}>
                  {selectedEquipIds.length} de {clientEquipments.length} equipamento
                  {clientEquipments.length !== 1 ? "s" : ""} selecionado{selectedEquipIds.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {clientEquipments.length === 0 ? (
              <p className={pmocStyles.metaMuted} style={{ padding: "1rem 0" }}>
                Nenhum equipamento ativo cadastrado para este cliente. Acesse o cadastro do cliente para adicionar
                equipamentos de ar-condicionado.
              </p>
            ) : (
              <div className={pmocStyles.tableWrap} style={{ marginTop: "1rem" }}>
                <table className={pmocStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: "2.5rem" }} />
                      <th>Identificação</th>
                      <th>Modelo</th>
                      <th>Capacidade BTU</th>
                      <th>Local de instalação</th>
                      <th>Fabricante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientEquipments.map((eq) => {
                      const checked = selectedEquipIds.includes(eq.id);
                      return (
                        <tr
                          key={eq.id}
                          className={checked ? pmocStyles.equipRowSelected : ""}
                          onClick={() => canEdit && toggleEquip(eq.id)}
                          style={{ cursor: canEdit ? "pointer" : "default" }}
                          aria-label={`${checked ? "Remover" : "Adicionar"} ${eq.identificacao}`}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className={pmocStyles.equipCheckbox}
                              checked={checked}
                              onChange={() => toggleEquip(eq.id)}
                              disabled={!canEdit}
                              aria-label={`Selecionar ${eq.identificacao}`}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: checked ? 600 : 400, color: checked ? "var(--color-primary)" : "inherit" }}>
                              {eq.identificacao}
                            </span>
                          </td>
                          <td className={pmocStyles.metaMuted}>{eq.modelo ?? "—"}</td>
                          <td>
                            {eq.capacidade_btu ? (
                              <span className={pmocStyles.btuPill}>{formatBtu(eq.capacidade_btu)}</span>
                            ) : (
                              <span className={pmocStyles.metaMuted}>—</span>
                            )}
                          </td>
                          <td className={pmocStyles.metaMuted}>{eq.local_instalacao ?? "—"}</td>
                          <td className={pmocStyles.metaMuted}>{eq.fabricante ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PmocFormCard>

          <PmocFormCard icon={<ClipboardList size={20} />} title="Identificação do plano" subtitle="Título e metadados exibidos nos relatórios">
            <div className={pmocStyles.grid2}>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Título</span>
                <input
                  className={loginStyles.input}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Versão / revisão</span>
                <input
                  className={loginStyles.input}
                  value={draft.version_label}
                  onChange={(e) => setDraft((d) => ({ ...d, version_label: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                <span className={pmocStyles.metaMuted}>Nota de referência legal</span>
                <textarea
                  className={loginStyles.input}
                  rows={3}
                  value={draft.law_reference_note}
                  onChange={(e) => setDraft((d) => ({ ...d, law_reference_note: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                <span className={pmocStyles.metaMuted}>Notas internas</span>
                <textarea
                  className={loginStyles.input}
                  rows={2}
                  value={draft.internal_notes}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </PmocFormCard>

          <PmocFormCard icon={<Building2 size={20} />} title="Status do plano" subtitle="Ativação e ciclo de vida do PMOC">
            <div className={pmocStyles.actions}>
              {canEdit && plan.status === "draft" ? (
                <Button
                  type="button"
                  onClick={async () => {
                    setErr("");
                    try {
                      const p = await activatePmocPlan(plan.id);
                      setPlan(p);
                      setMsgOk("PMOC ativada.");
                      await load();
                    } catch (e2) {
                      setErr(e2 instanceof Error ? e2.message : "Não foi possível ativar.");
                    }
                  }}
                >
                  Ativar PMOC
                </Button>
              ) : null}
              {canEdit && plan.status === "active" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    setErr("");
                    try {
                      const p = await deactivatePmocPlan(plan.id);
                      setPlan(p);
                      setMsgOk("PMOC inativada.");
                    } catch (e2) {
                      setErr(e2 instanceof Error ? e2.message : "Erro.");
                    }
                  }}
                >
                  Inativar
                </Button>
              ) : null}
              {canEdit && plan.status !== "archived" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    if (!window.confirm("Arquivar este PMOC?")) return;
                    setErr("");
                    try {
                      const p = await archivePmocPlan(plan.id);
                      setPlan(p);
                      setMsgOk("PMOC arquivada.");
                    } catch (e2) {
                      setErr(e2 instanceof Error ? e2.message : "Erro.");
                    }
                  }}
                >
                  Arquivar
                </Button>
              ) : null}
            </div>
            <p className={createStyles.metaHint}>
              Só é possível ativar com ao menos um equipamento vinculado. Indicadores completos ficam no painel de conformidade.
            </p>
          </PmocFormCard>
        </>
      ) : null}

      {tab === "schedule" ? (
        <PmocFormCard
          icon={<Calendar size={20} />}
          title="Cronograma de atividades"
          subtitle="Plano de manutenção preventiva vinculado aos serviços"
        >
          <div className={createStyles.sectionHeadRow}>
            <p className={pmocStyles.metaMuted} style={{ margin: 0 }}>
              {activities.length} atividade(s) no cronograma
            </p>
            {canEdit ? (
              <Button type="button" variant="outline" disabled={importingTemplate} onClick={() => void onImportOfficialTemplate()}>
                {importingTemplate ? "Importando…" : "Importar modelo oficial"}
              </Button>
            ) : null}
          </div>
          <div className={pmocStyles.tableWrap}>
            <table className={pmocStyles.table}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Periodicidade</th>
                  <th>Equipamento</th>
                  <th>Tempo est. (individual)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.title}
                      {a.is_system_seed ? (
                        <span className={pmocStyles.metaMuted} style={{ marginLeft: "0.35rem" }}>
                          (modelo)
                        </span>
                      ) : null}
                    </td>
                    <td>{FREQ_OPTIONS.find((f) => f.value === a.frequency)?.label ?? a.frequency}</td>
                    <td>
                      {a.equipment_id == null
                        ? "Todo o sistema / plano"
                        : pmocEquipments.find((e) => e.equipment_id === a.equipment_id)?.identificacao ?? `#${a.equipment_id}`}
                    </td>
                    <td className={pmocStyles.metaMuted}>
                      {a.service?.duration_minutes != null
                        ? formatDurationMinutes(a.service.duration_minutes)
                        : "—"}
                    </td>
                    <td>
                      {canEdit ? (
                        <>
                          <button type="button" className={pmocStyles.rowLink} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }} onClick={() => setEditAct({ ...a })}>
                            Editar
                          </button>
                          {" · "}
                          <button
                            type="button"
                            className={pmocStyles.rowLink}
                            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "var(--color-error)" }}
                            onClick={() => void onDeleteActivity(a.id)}
                          >
                            Excluir
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editAct && canEdit ? (
            <form onSubmit={onSaveEditActivity} className={pmocStyles.section} style={{ marginTop: "0.75rem" }}>
              <h3 className={pmocStyles.sectionTitle}>Editar atividade</h3>
              <div className={pmocStyles.grid2}>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Serviço relacionado (catálogo)</span>
                  <select
                    className={loginStyles.input}
                    value={editAct.service_id ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const svc = raw === "" ? undefined : catalogServices.find((s) => s.id === Number(raw));
                      setEditAct((x) =>
                        x
                          ? {
                              ...x,
                              service_id: raw === "" ? null : Number(raw),
                              title: svc ? svc.name : x.title,
                              service: svc
                                ? { id: svc.id, name: svc.name, duration_minutes: svc.duration_minutes }
                                : null,
                            }
                          : x,
                      );
                    }}
                  >
                    <option value="">— Sem vínculo —</option>
                    {sortedCatalogServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatDurationMinutes(s.duration_minutes)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Título</span>
                  <input
                    className={loginStyles.input}
                    value={editAct.title}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, title: e.target.value } : x))}
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Periodicidade</span>
                  <select
                    className={loginStyles.input}
                    value={editAct.frequency}
                    onChange={(e) =>
                      setEditAct((x) => (x ? { ...x, frequency: e.target.value as PmocFrequency } : x))
                    }
                  >
                    {FREQ_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={pmocStyles.metaMuted}>Descrição / procedimento</span>
                  <textarea
                    className={loginStyles.input}
                    rows={2}
                    value={editAct.description ?? ""}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, description: e.target.value } : x))}
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Código interno</span>
                  <input
                    className={loginStyles.input}
                    value={editAct.task_code ?? ""}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, task_code: e.target.value } : x))}
                  />
                </label>
                <details
                  className={formLayout.field}
                  style={{ gridColumn: "1 / -1" }}
                  open={editAct.equipment_id != null}
                >
                  <summary className={pmocStyles.metaMuted} style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
                    Aplicar apenas a um equipamento específico (opcional)
                  </summary>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Equipamento</span>
                    <select
                      className={loginStyles.input}
                      value={editAct.equipment_id ?? ""}
                      onChange={(e) =>
                        setEditAct((x) =>
                          x
                            ? {
                                ...x,
                                equipment_id: e.target.value === "" ? null : Number(e.target.value),
                              }
                            : x,
                        )
                      }
                    >
                      <option value="">— Todo o sistema / plano —</option>
                      {pmocEquipments.map((pe) => (
                        <option key={pe.equipment_id} value={pe.equipment_id}>
                          {pe.identificacao ?? `#${pe.equipment_id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
              </div>
              <div className={pmocStyles.actions}>
                <button type="submit" className={pmocStyles.btnPrimary}>
                  Salvar atividade
                </button>
                <button type="button" className={pmocStyles.btnSecondary} onClick={() => setEditAct(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}

          {canEdit ? (
            <form onSubmit={onCreateActivity} style={{ marginTop: "1rem" }}>
              <h3 className={pmocStyles.sectionTitle}>Nova atividade</h3>
              <div className={pmocStyles.grid2}>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Serviço relacionado (catálogo)</span>
                  <select
                    className={loginStyles.input}
                    value={newAct.service_id === "" ? "" : String(newAct.service_id)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const svc = raw === "" ? undefined : catalogServices.find((s) => s.id === Number(raw));
                      setNewAct((x) => ({
                        ...x,
                        service_id: raw === "" ? "" : Number(raw),
                        title: svc ? svc.name : x.title,
                      }));
                    }}
                  >
                    <option value="">— Selecione um serviço —</option>
                    {sortedCatalogServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatDurationMinutes(s.duration_minutes)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Título</span>
                  <input
                    className={loginStyles.input}
                    value={newAct.title}
                    onChange={(e) => setNewAct((x) => ({ ...x, title: e.target.value }))}
                    required
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Periodicidade</span>
                  <select
                    className={loginStyles.input}
                    value={newAct.frequency}
                    onChange={(e) => setNewAct((x) => ({ ...x, frequency: e.target.value as PmocFrequency }))}
                  >
                    {FREQ_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={pmocStyles.metaMuted}>Descrição</span>
                  <textarea
                    className={loginStyles.input}
                    rows={2}
                    value={newAct.description}
                    onChange={(e) => setNewAct((x) => ({ ...x, description: e.target.value }))}
                  />
                </label>
                <p className={pmocStyles.metaMuted} style={{ gridColumn: "1 / -1", margin: 0 }}>
                  Por padrão, a atividade aplica-se a{" "}
                  <strong>todo o sistema / plano</strong>
                  {pmocEquipments.length > 0
                    ? ` (${pmocEquipments.length} equipamento${pmocEquipments.length !== 1 ? "s" : ""} vinculado${pmocEquipments.length !== 1 ? "s" : ""} em Dados e conformidade).`
                    : " — vincule equipamentos em Dados e conformidade."}
                </p>
                <details
                  className={formLayout.field}
                  style={{ gridColumn: "1 / -1" }}
                  open={newActEquipmentOpen}
                  onToggle={(e) => {
                    const open = (e.target as HTMLDetailsElement).open;
                    setNewActEquipmentOpen(open);
                    if (!open) setNewAct((x) => ({ ...x, equipment_id: "" }));
                  }}
                >
                  <summary className={pmocStyles.metaMuted} style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
                    Aplicar apenas a um equipamento específico (opcional)
                  </summary>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Equipamento</span>
                    <select
                      className={loginStyles.input}
                      value={newAct.equipment_id === "" ? "" : String(newAct.equipment_id)}
                      onChange={(e) =>
                        setNewAct((x) => ({
                          ...x,
                          equipment_id: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">— Todo o sistema / plano —</option>
                      {pmocEquipments.map((pe) => (
                        <option key={pe.equipment_id} value={pe.equipment_id}>
                          {pe.identificacao ?? `#${pe.equipment_id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
                <label className={formLayout.field}>
                  <span className={pmocStyles.metaMuted}>Código</span>
                  <input
                    className={loginStyles.input}
                    value={newAct.task_code}
                    onChange={(e) => setNewAct((x) => ({ ...x, task_code: e.target.value }))}
                  />
                </label>
              </div>
              <div className={pmocStyles.actions}>
                <button type="submit" className={pmocStyles.btnSecondary}>
                  Adicionar ao cronograma
                </button>
              </div>
            </form>
          ) : null}
        </PmocFormCard>
      ) : null}

      {tab === "planning" ? (
        <PmocPlanningTab
          pmocId={plan.id}
          clientName={plan.client?.name ?? "Cliente"}
          planTitle={plan.title}
          activities={planningActivities}
          equipments={planningEquipments}
          selectedEquipmentIds={pmocEquipments.map((e) => String(e.equipment_id))}
          artIssuedAt={draft.art_issued_at}
          nextAirAnalysisDue={draft.next_air_analysis_due}
          planningScheduledRowKeys={parsePlanningScheduledRowKeys(plan.extras)}
          onScheduleSuccess={() => void refreshPlanAfterPlanningSchedule()}
        />
      ) : null}

      {tab === "air" ? (
        <>
          <ToastHost />
          <PmocFormCard icon={<Shield size={20} />} title="Central de conformidade legal" subtitle="RT, ART e análise de ar (Lei 13.589/2018)">
            <p className={pmocStyles.metaMuted} style={{ margin: 0 }}>
              Informe responsável técnico, ART e laudos laboratoriais exigidos para o plano.
            </p>
          </PmocFormCard>

          <PmocFormCard icon={<User size={20} />} title="Responsável técnico" subtitle="Profissional habilitado">
            <div className={pmocStyles.grid2}>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Nome</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_name}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_name: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Conselho (CREA/CFT)</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_council}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_council: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Registro profissional</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_registration}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_registration: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </PmocFormCard>

          <PmocFormCard icon={<ClipboardList size={20} />} title="Dados da ART" subtitle="Número, emissão e planejamento de análise de ar">
            <div className={pmocStyles.grid2}>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Número da ART</span>
                <input
                  className={loginStyles.input}
                  value={draft.art_number}
                  onChange={(e) => setDraft((d) => ({ ...d, art_number: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Emissão ART</span>
                <input
                  type="date"
                  className={loginStyles.input}
                  value={draft.art_issued_at}
                  onChange={(e) => setDraft((d) => ({ ...d, art_issued_at: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={pmocStyles.metaMuted}>Próxima análise de ar</span>
                <input
                  type="date"
                  className={loginStyles.input}
                  value={draft.next_air_analysis_due}
                  onChange={(e) => setDraft((d) => ({ ...d, next_air_analysis_due: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </PmocFormCard>

          <PmocFormCard icon={<Shield size={20} />} title="Documento ART (PDF)" subtitle="Anexo oficial emitido pelo conselho">
            {plan.art_file_url ? (
              <p>
                <a href={plan.art_file_url} target="_blank" rel="noreferrer" className={pmocStyles.rowLink}>
                  Abrir ART anexada
                </a>
              </p>
            ) : (
              <p className={pmocStyles.metaMuted}>Nenhum arquivo de ART.</p>
            )}
            {canEdit ? (
              <div className={pmocStyles.actions}>
                <label
                  className={pmocStyles.btnSecondary}
                  style={{ cursor: isUploadingArt ? "wait" : "pointer", opacity: isUploadingArt ? 0.7 : 1 }}
                >
                  {isUploadingArt ? "Enviando PDF…" : "Enviar PDF"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    disabled={isUploadingArt}
                    onChange={(e) => {
                      void onUploadArt(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {plan.art_file_url ? (
                  <Button type="button" variant="destructive" disabled={isUploadingArt} onClick={() => void onRemoveArt()}>
                    Remover arquivo
                  </Button>
                ) : null}
              </div>
            ) : null}
          </PmocFormCard>

          <PmocFormCard icon={<Shield size={20} />} title="Análises de qualidade do ar" subtitle="Laudos e histórico laboratorial">
            <PmocAirAnalysisSection pmocId={plan.id} canUpload={canEdit} onAnalysesChange={handleAirAnalysesChange} />
          </PmocFormCard>
        </>
      ) : null}
        </div>
      </div>

      <div className={createStyles.footerBar} role="toolbar" aria-label="Ações do PMOC">
        <div className={createStyles.footerInner}>
          <Link to={backHref}>
            <Button type="button" variant="ghost">
              Voltar
            </Button>
          </Link>
          {canEdit && (tab === "identification" || tab === "air") ? (
            <Button
              type="button"
              disabled={savingPlan || savingArtFields}
              onClick={() => void handleFooterSave()}
            >
              {savingPlan || savingArtFields ? "Salvando…" : "Salvar"}
            </Button>
          ) : null}
        </div>
      </div>

      {plan && scheduleModalOpen ? (
        <PmocScheduleActivitiesModal
          open={scheduleModalOpen}
          plan={plan}
          equipments={pmocEquipments}
          focus={scheduleFocus}
          onClose={closeScheduleModal}
          onScheduled={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
