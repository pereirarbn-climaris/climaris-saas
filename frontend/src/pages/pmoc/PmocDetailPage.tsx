import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  activatePmocPlan,
  archivePmocPlan,
  createPmocActivity,
  createPmocAirAnalysis,
  createPmocExecution,
  deactivatePmocPlan,
  deletePmocActivity,
  deletePmocArt,
  getPmocPlan,
  listPmocActivities,
  listPmocAirAnalyses,
  listPmocEquipments,
  listPmocExecutions,
  replacePmocEquipments,
  updatePmocActivity,
  updatePmocPlan,
  uploadPmocAirAnalysisFile,
  uploadPmocArt,
  type PmocAirQualityAnalysisOut,
  type PmocExecutionOut,
  type PmocFrequency,
  type PmocPlanEquipmentOut,
  type PmocPlanOut,
  type PmocScheduledActivityOut,
} from "../../api/pmoc";
import { listClientEquipments, type EquipmentOut } from "../../api/clients";
import type { DashboardOutletContext } from "../dashboardContext";
import listUi from "../../components/pmoc/PmocListUi.module.css";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import styles from "./PmocPages.module.css";

type Tab = "overview" | "equipments" | "schedule" | "executions" | "air";

const FREQ_OPTIONS: { value: PmocFrequency; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "custom", label: "Personalizado" },
];

const EXEC_OPTIONS: { value: "done" | "partial" | "skipped"; label: string }[] = [
  { value: "done", label: "Concluído" },
  { value: "partial", label: "Parcial" },
  { value: "skipped", label: "Não realizado" },
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
  const [searchParams] = useSearchParams();
  const pmocId = pmocIdParam ? Number.parseInt(pmocIdParam, 10) : NaN;

  const fromClientNum = useMemo(() => {
    const raw = searchParams.get("from_client");
    if (!raw) return NaN;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : NaN;
  }, [searchParams]);

  const [tab, setTab] = useState<Tab>("overview");
  const [plan, setPlan] = useState<PmocPlanOut | null>(null);
  const [pmocEquipments, setPmocEquipments] = useState<PmocPlanEquipmentOut[]>([]);
  const [clientEquipments, setClientEquipments] = useState<EquipmentOut[]>([]);
  const [activities, setActivities] = useState<PmocScheduledActivityOut[]>([]);
  const [executions, setExecutions] = useState<PmocExecutionOut[]>([]);
  const [airRows, setAirRows] = useState<PmocAirQualityAnalysisOut[]>([]);
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

  const [selectedEquipIds, setSelectedEquipIds] = useState<number[]>([]);
  const [savingEquip, setSavingEquip] = useState(false);

  const [newAct, setNewAct] = useState({
    title: "",
    frequency: "monthly" as PmocFrequency,
    equipment_id: "" as "" | number,
    description: "",
    task_code: "",
  });

  const [editAct, setEditAct] = useState<PmocScheduledActivityOut | null>(null);

  const [newEx, setNewEx] = useState({
    scheduled_activity_id: "" as "" | number,
    equipment_id: "" as "" | number,
    executed_at: "",
    completion_status: "done" as "done" | "partial" | "skipped",
    notes: "",
  });

  const [newAir, setNewAir] = useState({
    analysis_date: "",
    lab_name: "",
    summary: "",
    next_due_date: "",
  });

  const canEdit =
    ctx?.user.role === "admin" || ctx?.user.role === "receptionist" || ctx?.user.role === "technician";

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
      const [eq, acts, ex, air, ce] = await Promise.all([
        listPmocEquipments(pmocId),
        listPmocActivities(pmocId),
        listPmocExecutions(pmocId),
        listPmocAirAnalyses(pmocId),
        listClientEquipments(p.client_id, { only_active: true }),
      ]);
      setPmocEquipments(eq);
      setSelectedEquipIds(eq.map((e) => e.equipment_id));
      setActivities(acts);
      setExecutions(ex);
      setAirRows(air);
      setClientEquipments(ce);
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const localIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T${pad(today.getHours())}:${pad(today.getMinutes())}`;
      setNewEx((prev) => ({ ...prev, executed_at: localIso }));
      setNewAir((prev) => ({
        ...prev,
        analysis_date: toInputDate(new Date().toISOString()),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar PMOC.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [pmocId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePlanFields() {
    if (!plan) return;
    setSavingPlan(true);
    setErr("");
    setMsgOk("");
    try {
      const updated = await updatePmocPlan(plan.id, {
        title: draft.title.trim(),
        version_label: draft.version_label.trim(),
        law_reference_note: draft.law_reference_note.trim() || null,
        internal_notes: draft.internal_notes.trim() || null,
        responsible_name: draft.responsible_name.trim() || null,
        responsible_council: draft.responsible_council.trim() || null,
        responsible_registration: draft.responsible_registration.trim() || null,
        art_number: draft.art_number.trim() || null,
        art_issued_at: draft.art_issued_at ? draft.art_issued_at : null,
        next_air_analysis_due: draft.next_air_analysis_due ? draft.next_air_analysis_due : null,
      });
      setPlan(updated);
      setMsgOk("Alterações salvas.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSavingPlan(false);
    }
  }

  async function onReplaceEquipments() {
    if (!plan) return;
    setSavingEquip(true);
    setErr("");
    setMsgOk("");
    try {
      const list = await replacePmocEquipments(plan.id, selectedEquipIds);
      setPmocEquipments(list);
      const p = await getPmocPlan(plan.id);
      setPlan(p);
      setMsgOk("Equipamentos atualizados. BTUs e obrigatoriedade de análise foram recalculados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar equipamentos.");
    } finally {
      setSavingEquip(false);
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
        description: newAct.description.trim() || null,
        task_code: newAct.task_code.trim() || null,
      });
      setNewAct({ title: "", frequency: "monthly", equipment_id: "", description: "", task_code: "" });
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

  async function onCreateExecution(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setErr("");
    try {
      const executedAt = newEx.executed_at ? new Date(newEx.executed_at).toISOString() : new Date().toISOString();
      await createPmocExecution(plan.id, {
        executed_at: executedAt,
        completion_status: newEx.completion_status,
        notes: newEx.notes.trim() || null,
        scheduled_activity_id: newEx.scheduled_activity_id === "" ? null : newEx.scheduled_activity_id,
        equipment_id: newEx.equipment_id === "" ? null : newEx.equipment_id,
      });
      setExecutions(await listPmocExecutions(plan.id));
      setMsgOk("Execução registrada.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao registrar execução.");
    }
  }

  async function onCreateAir(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !newAir.analysis_date) return;
    setErr("");
    try {
      await createPmocAirAnalysis(plan.id, {
        analysis_date: newAir.analysis_date,
        lab_name: newAir.lab_name.trim() || null,
        summary: newAir.summary.trim() || null,
        next_due_date: newAir.next_due_date ? newAir.next_due_date : null,
      });
      setAirRows(await listPmocAirAnalyses(plan.id));
      const p = await getPmocPlan(plan.id);
      setPlan(p);
      setMsgOk("Análise registrada.");
      setNewAir((prev) => ({ ...prev, lab_name: "", summary: "", next_due_date: "" }));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao criar análise.");
    }
  }

  async function onUploadArt(file: File | null) {
    if (!plan || !file) return;
    setErr("");
    try {
      const p = await uploadPmocArt(plan.id, file);
      setPlan(p);
      setMsgOk("ART enviada.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha no upload.");
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

  async function onUploadAirFile(analysisId: number, file: File | null) {
    if (!plan || !file) return;
    setErr("");
    try {
      const row = await uploadPmocAirAnalysisFile(plan.id, analysisId, file);
      setAirRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      setMsgOk("Arquivo da análise anexado.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha no upload.");
    }
  }

  const snapshotEntries = useMemo(() => {
    const snap = plan?.establishment_snapshot;
    if (!snap || typeof snap !== "object") return [];
    return Object.entries(snap as Record<string, unknown>).filter(([k]) => k !== "captured_at");
  }, [plan]);

  const backToClientPath = useMemo(() => {
    if (!Number.isFinite(fromClientNum) || !plan) return null;
    if (fromClientNum !== plan.client_id) return null;
    return `/app/clients/${plan.client_id}?tab=pmoc`;
  }, [fromClientNum, plan]);

  function toggleEquip(id: number) {
    setSelectedEquipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (!Number.isFinite(pmocId)) return <Navigate to="/app/pmoc" replace />;

  if (loading && !plan) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando PMOC…</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={styles.wrap}>
        <p className={styles.msgErr}>{err || "PMOC não encontrado."}</p>
        <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          {Number.isFinite(fromClientNum) ? (
            <Link to={`/app/clients/${fromClientNum}?tab=pmoc`} className={styles.btnBackLink}>
              ← Voltar ao cliente
            </Link>
          ) : null}
          <Link to="/app/pmoc" className={styles.rowLink}>
            Lista PMOC
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", margin: "0 0 0.75rem" }}>
        {backToClientPath ? (
          <Link to={backToClientPath} className={styles.btnBackLink}>
            ← Voltar ao cliente
          </Link>
        ) : null}
        <Link to="/app/pmoc" className={backToClientPath ? styles.rowLink : styles.btnBackLink}>
          {backToClientPath ? "Lista PMOC (todos)" : "← Lista PMOC"}
        </Link>
      </p>

      <header className={styles.hero}>
        <h1 className={styles.title}>{plan.title}</h1>
        <p className={styles.lead}>
          Cliente:{" "}
          <Link className={styles.rowLink} to={`/app/clients/${plan.client_id}`}>
            {plan.client?.name ?? `#${plan.client_id}`}
          </Link>
          {" · "}
          Versão {plan.version_label} · {statusLabel(plan.status)}
        </p>
      </header>

      {plan.air_analysis_required ? (
        <div className={`${styles.alertLaw} ${styles.alertDanger}`}>
          Soma de capacidades acima de 60.000 BTUs: é obrigatório manter análise laboratorial periódica da qualidade do ar e
          responsável técnico habilitado, conforme legislação aplicável.
        </div>
      ) : (
        <div className={styles.alertLaw}>
          Referência legal: Lei Federal nº 13.589/2018. Mantenha o cronograma e os registros de execução atualizados para
          fiscalização (ANVISA/órgãos competentes).
        </div>
      )}

      <div className={listUi.subTabs} role="tablist">
        {(
          [
            ["overview", "Dados e conformidade"],
            ["equipments", "Equipamentos"],
            ["schedule", "Cronograma"],
            ["executions", "Execuções"],
            ["air", "Ar & ART"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            className={`${listUi.subTab} ${tab === k ? listUi.subTabActive : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? <p className={styles.msgErr}>{err}</p> : null}
      {msgOk ? <p className={styles.msgOk}>{msgOk}</p> : null}

      {tab === "overview" ? (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Identificação do estabelecimento (snapshot)</h2>
            {snapshotEntries.length === 0 ? (
              <p className={styles.metaMuted}>Snapshot preenchido na criação do plano. Edite o cadastro do cliente se precisar atualizar.</p>
            ) : (
              <dl className={styles.grid2} style={{ margin: 0 }}>
                {snapshotEntries.map(([key, val]) => (
                  <div key={key}>
                    <dt className={styles.metaMuted}>{key}</dt>
                    <dd style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>{String(val ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Resumo</h2>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
              Soma BTU (equipamentos ativos no plano): <strong>{formatBtu(plan.total_btu_sum)}</strong>
              {" · "}
              Análise de ar obrigatória: <strong>{plan.air_analysis_required ? "Sim" : "Não"}</strong>
              {plan.next_air_analysis_due ? (
                <>
                  {" · "}
                  Próximo vencimento sugerido: <strong>{new Date(plan.next_air_analysis_due).toLocaleDateString("pt-BR")}</strong>
                </>
              ) : null}
            </p>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Plano e responsável técnico</h2>
            <div className={styles.grid2}>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Título</span>
                <input
                  className={loginStyles.input}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Versão / revisão</span>
                <input
                  className={loginStyles.input}
                  value={draft.version_label}
                  onChange={(e) => setDraft((d) => ({ ...d, version_label: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.metaMuted}>Nota de referência legal (editável)</span>
                <textarea
                  className={loginStyles.input}
                  rows={3}
                  value={draft.law_reference_note}
                  onChange={(e) => setDraft((d) => ({ ...d, law_reference_note: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.metaMuted}>Notas internas</span>
                <textarea
                  className={loginStyles.input}
                  rows={2}
                  value={draft.internal_notes}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Responsável técnico (nome)</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_name}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_name: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Conselho (CREA/CFT)</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_council}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_council: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Registro profissional</span>
                <input
                  className={loginStyles.input}
                  value={draft.responsible_registration}
                  onChange={(e) => setDraft((d) => ({ ...d, responsible_registration: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Número da ART</span>
                <input
                  className={loginStyles.input}
                  value={draft.art_number}
                  onChange={(e) => setDraft((d) => ({ ...d, art_number: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Emissão ART</span>
                <input
                  type="date"
                  className={loginStyles.input}
                  value={draft.art_issued_at}
                  onChange={(e) => setDraft((d) => ({ ...d, art_issued_at: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className={formLayout.field}>
                <span className={styles.metaMuted}>Próxima análise de ar (planejamento)</span>
                <input
                  type="date"
                  className={loginStyles.input}
                  value={draft.next_air_analysis_due}
                  onChange={(e) => setDraft((d) => ({ ...d, next_air_analysis_due: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
            </div>
            {canEdit ? (
              <div className={styles.actions}>
                <button type="button" className={styles.btnPrimary} onClick={() => void savePlanFields()} disabled={savingPlan}>
                  {savingPlan ? "Salvando…" : "Salvar dados do plano"}
                </button>
              </div>
            ) : null}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Status do plano</h2>
            <div className={styles.actions}>
              {canEdit && plan.status === "draft" ? (
                <button
                  type="button"
                  className={styles.btnPrimary}
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
                </button>
              ) : null}
              {canEdit && plan.status === "active" ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
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
                </button>
              ) : null}
              {canEdit && plan.status !== "archived" ? (
                <button
                  type="button"
                  className={styles.btnDanger}
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
                </button>
              ) : null}
            </div>
            <p className={styles.metaMuted}>
              Só é possível ativar com ao menos um equipamento vinculado. Ao ativar, outras PMOC ativas do mesmo cliente são
              inativadas automaticamente.
            </p>
          </div>
        </>
      ) : null}

      {tab === "equipments" ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Fichas de equipamento neste PMOC</h2>
          <p className={styles.metaMuted}>
            Selecione os equipamentos do cliente que integram este endereço. Cada máquina pode ter atividades específicas no
            cronograma.
          </p>
          <div className={styles.checkboxGrid}>
            {clientEquipments.map((eq) => (
              <label key={eq.id} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={selectedEquipIds.includes(eq.id)}
                  onChange={() => toggleEquip(eq.id)}
                  disabled={!canEdit}
                />
                <span>
                  {eq.identificacao}
                  {eq.capacidade_btu ? ` · ${formatBtu(eq.capacidade_btu)}` : ""}
                  {eq.local_instalacao ? ` · ${eq.local_instalacao}` : ""}
                </span>
              </label>
            ))}
          </div>
          {clientEquipments.length === 0 ? <p className={styles.metaMuted}>Nenhum equipamento ativo cadastrado para este cliente.</p> : null}
          {canEdit ? (
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} onClick={() => void onReplaceEquipments()} disabled={savingEquip}>
                {savingEquip ? "Salvando…" : "Salvar equipamentos"}
              </button>
            </div>
          ) : null}

          {pmocEquipments.length > 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <h3 className={styles.sectionTitle}>Ordem no documento</h3>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem" }}>
                {pmocEquipments.map((row) => (
                  <li key={row.id}>
                    {row.identificacao ?? `Equipamento #${row.equipment_id}`}
                    {row.capacidade_btu ? ` · ${formatBtu(row.capacidade_btu)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Plano de atividades</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Periodicidade</th>
                  <th>Equipamento</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.title}
                      {a.is_system_seed ? (
                        <span className={styles.metaMuted} style={{ marginLeft: "0.35rem" }}>
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
                    <td>
                      {canEdit ? (
                        <>
                          <button type="button" className={styles.rowLink} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }} onClick={() => setEditAct({ ...a })}>
                            Editar
                          </button>
                          {" · "}
                          <button
                            type="button"
                            className={styles.rowLink}
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
            <form onSubmit={onSaveEditActivity} className={styles.section} style={{ marginTop: "0.75rem" }}>
              <h3 className={styles.sectionTitle}>Editar atividade</h3>
              <div className={styles.grid2}>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Título</span>
                  <input
                    className={loginStyles.input}
                    value={editAct.title}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, title: e.target.value } : x))}
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Periodicidade</span>
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
                  <span className={styles.metaMuted}>Descrição / procedimento</span>
                  <textarea
                    className={loginStyles.input}
                    rows={2}
                    value={editAct.description ?? ""}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, description: e.target.value } : x))}
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Equipamento (vazio = plano inteiro)</span>
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
                    <option value="">— Plano / todas as fichas —</option>
                    {pmocEquipments.map((pe) => (
                      <option key={pe.equipment_id} value={pe.equipment_id}>
                        {pe.identificacao ?? `#${pe.equipment_id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Código interno</span>
                  <input
                    className={loginStyles.input}
                    value={editAct.task_code ?? ""}
                    onChange={(e) => setEditAct((x) => (x ? { ...x, task_code: e.target.value } : x))}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary}>
                  Salvar atividade
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => setEditAct(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}

          {canEdit ? (
            <form onSubmit={onCreateActivity} style={{ marginTop: "1rem" }}>
              <h3 className={styles.sectionTitle}>Nova atividade</h3>
              <div className={styles.grid2}>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Título</span>
                  <input
                    className={loginStyles.input}
                    value={newAct.title}
                    onChange={(e) => setNewAct((x) => ({ ...x, title: e.target.value }))}
                    required
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Periodicidade</span>
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
                  <span className={styles.metaMuted}>Descrição</span>
                  <textarea
                    className={loginStyles.input}
                    rows={2}
                    value={newAct.description}
                    onChange={(e) => setNewAct((x) => ({ ...x, description: e.target.value }))}
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Equipamento</span>
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
                    <option value="">— Plano inteiro —</option>
                    {pmocEquipments.map((pe) => (
                      <option key={pe.equipment_id} value={pe.equipment_id}>
                        {pe.identificacao ?? `#${pe.equipment_id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Código</span>
                  <input
                    className={loginStyles.input}
                    value={newAct.task_code}
                    onChange={(e) => setNewAct((x) => ({ ...x, task_code: e.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.btnSecondary}>
                  Adicionar ao cronograma
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "executions" ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Registro de execução</h2>
          <p className={styles.metaMuted}>Comprove que as manutenções planejadas foram realizadas (evidências podem ser anexadas em OS ou fotos em notas internas).</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Situação</th>
                  <th>Atividade</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.executed_at).toLocaleString("pt-BR")}</td>
                    <td>{EXEC_OPTIONS.find((o) => o.value === r.completion_status)?.label ?? r.completion_status}</td>
                    <td>
                      {r.scheduled_activity_id
                        ? activities.find((a) => a.id === r.scheduled_activity_id)?.title ?? `#${r.scheduled_activity_id}`
                        : "—"}
                    </td>
                    <td>{r.notes ?? "—"}</td>
                  </tr>
                ))}
                {executions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <span className={styles.metaMuted}>Nenhuma execução registrada.</span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <form onSubmit={onCreateExecution} style={{ marginTop: "1rem" }}>
              <h3 className={styles.sectionTitle}>Registrar execução</h3>
              <div className={styles.grid2}>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Data e hora</span>
                  <input
                    type="datetime-local"
                    className={loginStyles.input}
                    value={newEx.executed_at}
                    onChange={(e) => setNewEx((x) => ({ ...x, executed_at: e.target.value }))}
                    required
                  />
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Situação</span>
                  <select
                    className={loginStyles.input}
                    value={newEx.completion_status}
                    onChange={(e) =>
                      setNewEx((x) => ({
                        ...x,
                        completion_status: e.target.value as "done" | "partial" | "skipped",
                      }))
                    }
                  >
                    {EXEC_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Atividade (opcional)</span>
                  <select
                    className={loginStyles.input}
                    value={newEx.scheduled_activity_id === "" ? "" : String(newEx.scheduled_activity_id)}
                    onChange={(e) =>
                      setNewEx((x) => ({
                        ...x,
                        scheduled_activity_id: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">—</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field}>
                  <span className={styles.metaMuted}>Equipamento (opcional)</span>
                  <select
                    className={loginStyles.input}
                    value={newEx.equipment_id === "" ? "" : String(newEx.equipment_id)}
                    onChange={(e) =>
                      setNewEx((x) => ({
                        ...x,
                        equipment_id: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">—</option>
                    {pmocEquipments.map((pe) => (
                      <option key={pe.equipment_id} value={pe.equipment_id}>
                        {pe.identificacao ?? `#${pe.equipment_id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.metaMuted}>Observações / evidências</span>
                  <textarea
                    className={loginStyles.input}
                    rows={2}
                    value={newEx.notes}
                    onChange={(e) => setNewEx((x) => ({ ...x, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary}>
                  Registrar
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "air" ? (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>ART (arquivo)</h2>
            <p className={styles.metaMuted}>
              Anexe o PDF da ART emitida pelo conselho. Os metadados (número, data) podem ser preenchidos na aba “Dados e
              conformidade”.
            </p>
            {plan.art_file_url ? (
              <p>
                <a href={plan.art_file_url} target="_blank" rel="noreferrer" className={styles.rowLink}>
                  Abrir ART anexada
                </a>
              </p>
            ) : (
              <p className={styles.metaMuted}>Nenhum arquivo de ART.</p>
            )}
            {canEdit ? (
              <div className={styles.actions}>
                <label className={styles.btnSecondary} style={{ cursor: "pointer" }}>
                  Enviar PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => void onUploadArt(e.target.files?.[0] ?? null)}
                  />
                </label>
                {plan.art_file_url ? (
                  <button type="button" className={styles.btnDanger} onClick={() => void onRemoveArt()}>
                    Remover arquivo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Análises de qualidade do ar</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Laboratório</th>
                    <th>Resumo</th>
                    <th>Próximo</th>
                    <th>Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {airRows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.analysis_date).toLocaleDateString("pt-BR")}</td>
                      <td>{r.lab_name ?? "—"}</td>
                      <td>{r.summary ?? "—"}</td>
                      <td>{r.next_due_date ? new Date(r.next_due_date).toLocaleDateString("pt-BR") : "—"}</td>
                      <td>
                        {r.file_url ? (
                          <a href={r.file_url} className={styles.rowLink} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : (
                          <span className={styles.metaMuted}>—</span>
                        )}
                        {canEdit ? (
                          <label style={{ marginLeft: "0.5rem", cursor: "pointer", fontSize: "0.72rem" }}>
                            Anexar
                            <input
                              type="file"
                              style={{ display: "none" }}
                              onChange={(e) => void onUploadAirFile(r.id, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {airRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <span className={styles.metaMuted}>Nenhuma análise cadastrada.</span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {canEdit ? (
              <form onSubmit={onCreateAir} style={{ marginTop: "1rem" }}>
                <h3 className={styles.sectionTitle}>Nova análise</h3>
                <div className={styles.grid2}>
                  <label className={formLayout.field}>
                    <span className={styles.metaMuted}>Data da coleta / laudo</span>
                    <input
                      type="date"
                      className={loginStyles.input}
                      value={newAir.analysis_date}
                      onChange={(e) => setNewAir((x) => ({ ...x, analysis_date: e.target.value }))}
                      required
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={styles.metaMuted}>Laboratório</span>
                    <input
                      className={loginStyles.input}
                      value={newAir.lab_name}
                      onChange={(e) => setNewAir((x) => ({ ...x, lab_name: e.target.value }))}
                    />
                  </label>
                  <label className={formLayout.field} style={{ gridColumn: "1 / -1" }}>
                    <span className={styles.metaMuted}>Resumo / resultados principais</span>
                    <textarea
                      className={loginStyles.input}
                      rows={2}
                      value={newAir.summary}
                      onChange={(e) => setNewAir((x) => ({ ...x, summary: e.target.value }))}
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={styles.metaMuted}>Próximo vencimento</span>
                    <input
                      type="date"
                      className={loginStyles.input}
                      value={newAir.next_due_date}
                      onChange={(e) => setNewAir((x) => ({ ...x, next_due_date: e.target.value }))}
                    />
                  </label>
                </div>
                <div className={styles.actions}>
                  <button type="submit" className={styles.btnPrimary}>
                    Registrar análise
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
