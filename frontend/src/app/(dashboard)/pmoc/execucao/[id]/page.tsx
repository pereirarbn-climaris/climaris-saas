import { Camera, ChevronLeft, ClipboardCheck, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  createPmocOccurrence,
  getPmocPlan,
  listPmocActivities,
  listPmocEquipments,
  submitPmocFieldInspection,
  type PmocFieldInspectionPayload,
  type PmocPlanEquipmentOut,
  type PmocScheduledActivityOut,
} from "../../../../../api/pmoc";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { SignaturePad } from "../../../../../components/pmoc/SignaturePad";
import { toast } from "../../../../../lib/toast";
import type { DashboardOutletContext } from "../../../../../pages/dashboardContext";
import "./pmoc-execucao.tailwind.css";

type ChecklistStatus = "ok" | "not_ok" | "na" | null;

type ChecklistItemState = {
  id: string;
  title: string;
  status: ChecklistStatus;
  failureNotes: string;
  photoDataUrl: string | null;
  photoName: string | null;
};

type PmocExecucaoPayload = PmocFieldInspectionPayload;

const MOCK_TASKS = [
  "Limpeza de filtros",
  "Verificação de dreno",
  "Teste de ruído",
  "Inspeção visual de serpentinas",
  "Verificação de pressão do gás",
  "Teste de partida e parada",
];

function buildChecklistFromActivities(activities: PmocScheduledActivityOut[]): ChecklistItemState[] {
  if (activities.length === 0) {
    return MOCK_TASKS.map((title, index) => ({
      id: `mock-${index + 1}`,
      title,
      status: null,
      failureNotes: "",
      photoDataUrl: null,
      photoName: null,
    }));
  }

  return activities.map((activity) => ({
    id: String(activity.id),
    title: activity.title,
    status: null,
    failureNotes: "",
    photoDataUrl: null,
    photoName: null,
  }));
}

function statusButtonClass(active: boolean, tone: "ok" | "fail" | "na"): string {
  const base =
    "inline-flex min-w-[4.5rem] items-center justify-center rounded-lg px-3 py-3 text-sm font-semibold transition-colors";
  if (!active) {
    return `${base} border border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#006FEE]/35 hover:text-[#006FEE]`;
  }
  if (tone === "ok") return `${base} border border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (tone === "fail") return `${base} border border-red-200 bg-red-50 text-red-700`;
  return `${base} border border-slate-200 bg-slate-100 text-slate-700`;
}

export default function PmocExecucaoPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const pmocId = id ? Number.parseInt(id, 10) : NaN;

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("Ar Ideal Climatizadora");
  const [planTitle, setPlanTitle] = useState("PMOC — Plano Anual");
  const [equipments, setEquipments] = useState<PmocPlanEquipmentOut[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItemState[]>(() =>
    MOCK_TASKS.map((title, index) => ({
      id: `mock-${index + 1}`,
      title,
      status: null,
      failureNotes: "",
      photoDataUrl: null,
      photoName: null,
    })),
  );
  const [generalNotes, setGeneralNotes] = useState("");
  const [operationalData, setOperationalData] = useState({
    voltagePhasePhase: "",
    voltagePhaseNeutral: "",
    currentA: "",
    powerKw: "",
    powerFactor: "",
    suctionPressure: "",
    dischargePressure: "",
    superheatC: "",
    subcoolingC: "",
    returnC: "",
    supplyC: "",
    ambientC: "",
    externalC: "",
    deltaTC: "",
    observedPerformance: "",
  });
  const [indoorAir, setIndoorAir] = useState({
    ambientTemperatureC: "",
    relativeHumidityPct: "",
    co2Ppm: "",
    airRenewalRate: "",
    particulateMatter: "",
    fungiBacteria: "",
  });
  const [serviceLog, setServiceLog] = useState({
    technicianName: "",
    executedService: "",
    workedHours: "",
    observations: "",
    legalSignatureProvider: "",
    materialName: "",
    materialLot: "",
    materialValidityDate: "",
    materialQuantity: "",
  });
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const currentEquipment = useMemo(
    () => equipments.find((eq) => eq.equipment_id === selectedEquipmentId) ?? equipments[0] ?? null,
    [equipments, selectedEquipmentId],
  );

  const loadData = useCallback(async () => {
    if (!Number.isFinite(pmocId)) return;
    setLoading(true);
    setError("");
    try {
      const [plan, eqList, activities] = await Promise.all([
        getPmocPlan(pmocId),
        listPmocEquipments(pmocId),
        listPmocActivities(pmocId),
      ]);

      setClientName(plan.client?.name ?? plan.client?.trade_name ?? `Cliente #${plan.client_id}`);
      setPlanTitle(plan.title);
      setEquipments(eqList);

      const firstEquipmentId = eqList[0]?.equipment_id ?? null;
      setSelectedEquipmentId(firstEquipmentId);

      const filteredActivities =
        firstEquipmentId == null
          ? activities
          : activities.filter((a) => a.equipment_id == null || a.equipment_id === firstEquipmentId);

      setChecklist(buildChecklistFromActivities(filteredActivities));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o PMOC.");
      setChecklist(buildChecklistFromActivities([]));
    } finally {
      setLoading(false);
    }
  }, [pmocId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleEquipmentChange = useCallback(
    async (equipmentId: number) => {
      setSelectedEquipmentId(equipmentId);
      if (!Number.isFinite(pmocId)) return;
      try {
        const activities = await listPmocActivities(pmocId);
        const filtered = activities.filter((a) => a.equipment_id == null || a.equipment_id === equipmentId);
        setChecklist(buildChecklistFromActivities(filtered));
      } catch {
        setChecklist(buildChecklistFromActivities([]));
      }
    },
    [pmocId],
  );

  const updateItem = (itemId: string, patch: Partial<ChecklistItemState>) => {
    setChecklist((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const handlePhotoSelect = (itemId: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateItem(itemId, {
        photoDataUrl: typeof reader.result === "string" ? reader.result : null,
        photoName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFinalize = async () => {
    const pending = checklist.filter((item) => !item.status);
    if (pending.length > 0) {
      window.alert(`Preencha o status de todas as tarefas. Faltam ${pending.length} item(ns).`);
      return;
    }

    const failedItems = checklist.filter((item) => item.status === "not_ok");
    const missingFailureNotes = failedItems.filter((item) => !item.failureNotes.trim());
    if (missingFailureNotes.length > 0) {
      window.alert(
        `Informe a descrição da falha para: ${missingFailureNotes.map((item) => item.title).join(", ")}.`,
      );
      return;
    }

    const payload: PmocExecucaoPayload = {
      pmocId,
      equipmentId: currentEquipment?.equipment_id ?? selectedEquipmentId,
      generalNotes: generalNotes.trim(),
      checklist: checklist.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status as Exclude<ChecklistStatus, null>,
        photoReference: item.photoDataUrl,
      })),
      signatureBase64,
      operationalData: {
        electrical: {
          voltagePhasePhase: operationalData.voltagePhasePhase ? Number(operationalData.voltagePhasePhase) : null,
          voltagePhaseNeutral: operationalData.voltagePhaseNeutral ? Number(operationalData.voltagePhaseNeutral) : null,
          currentA: operationalData.currentA ? Number(operationalData.currentA) : null,
          powerKw: operationalData.powerKw ? Number(operationalData.powerKw) : null,
          powerFactor: operationalData.powerFactor ? Number(operationalData.powerFactor) : null,
        },
        refrigeration: {
          suctionPressure: operationalData.suctionPressure ? Number(operationalData.suctionPressure) : null,
          dischargePressure: operationalData.dischargePressure ? Number(operationalData.dischargePressure) : null,
          superheatC: operationalData.superheatC ? Number(operationalData.superheatC) : null,
          subcoolingC: operationalData.subcoolingC ? Number(operationalData.subcoolingC) : null,
        },
        temperatures: {
          returnC: operationalData.returnC ? Number(operationalData.returnC) : null,
          supplyC: operationalData.supplyC ? Number(operationalData.supplyC) : null,
          ambientC: operationalData.ambientC ? Number(operationalData.ambientC) : null,
          externalC: operationalData.externalC ? Number(operationalData.externalC) : null,
        },
        performance: {
          deltaTC: operationalData.deltaTC ? Number(operationalData.deltaTC) : null,
          observedPerformance: operationalData.observedPerformance.trim() || null,
        },
      },
      indoorAirQuality: {
        ambientTemperatureC: indoorAir.ambientTemperatureC ? Number(indoorAir.ambientTemperatureC) : null,
        relativeHumidityPct: indoorAir.relativeHumidityPct ? Number(indoorAir.relativeHumidityPct) : null,
        co2Ppm: indoorAir.co2Ppm ? Number(indoorAir.co2Ppm) : null,
        airRenewalRate: indoorAir.airRenewalRate.trim() || null,
        particulateMatter: indoorAir.particulateMatter.trim() || null,
        fungiBacteria: indoorAir.fungiBacteria.trim() || null,
      },
      serviceLog: {
        technicianName: serviceLog.technicianName.trim() || null,
        executedService: serviceLog.executedService.trim() || null,
        workedHours: serviceLog.workedHours ? Number(serviceLog.workedHours) : null,
        observations: serviceLog.observations.trim() || null,
        legalSignatureProvider: serviceLog.legalSignatureProvider.trim() || null,
        materials: serviceLog.materialName.trim()
          ? [
              {
                name: serviceLog.materialName.trim(),
                lotNumber: serviceLog.materialLot.trim() || null,
                validityDate: serviceLog.materialValidityDate || null,
                quantity: serviceLog.materialQuantity.trim() || null,
              },
            ]
          : [],
      },
    };

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await submitPmocFieldInspection(pmocId, payload);
      for (const item of failedItems) {
        await createPmocOccurrence(pmocId, {
          equipment_id: currentEquipment?.equipment_id ?? selectedEquipmentId,
          checklist_item_id: item.id,
          checklist_item_descricao: item.title,
          failure_description: item.failureNotes.trim(),
        });
      }
      toast.success("Vistoria finalizada com sucesso!");
      navigate(`/app/pmoc/${pmocId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro ao salvar a vistoria. Tente novamente.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ctx) return <Navigate to="/login" replace />;
  if (!Number.isFinite(pmocId)) return <Navigate to="/app/pmoc" replace />;

  const canExecute =
    ctx.user.role === "technician" || ctx.user.role === "admin" || ctx.user.role === "receptionist";

  if (!canExecute) return <Navigate to="/app" replace />;

  return (
    <div
      className="min-h-full bg-[#f8fafc] pb-10 font-[Inter,system-ui,sans-serif]"
      style={{ ["--pmoc-accent" as string]: "#006FEE" }}
    >
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Link
              to={`/app/pmoc/${pmocId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#64748b] transition-colors hover:text-[#006FEE]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Voltar ao PMOC
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#006FEE]">Checklist de Campo</p>
              <h1
                className="mt-1 text-2xl font-semibold text-[#0f172a] md:text-3xl"
                style={{ fontFamily: "Poppins, Inter, sans-serif" }}
              >
                Execução de Vistoria PMOC
              </h1>
            </div>
            {loading ? (
              <p className="text-sm text-[#64748b]">Carregando dados do plano…</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{clientName}</Badge>
                <Badge variant="secondary">{planTitle}</Badge>
                {currentEquipment ? (
                  <Badge variant="default">
                    {currentEquipment.identificacao ?? `Equipamento #${currentEquipment.equipment_id}`}
                  </Badge>
                ) : (
                  <Badge variant="warning">Equipamento não vinculado</Badge>
                )}
              </div>
            )}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {submitError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              variant="outline"
              style={{ padding: "12px 16px", fontWeight: 600 }}
              disabled={isSubmitting}
              onClick={() => navigate(`/app/pmoc/${pmocId}`)}
            >
              Voltar
            </Button>
            <Button
              style={{
                padding: "12px 16px",
                fontWeight: 600,
                backgroundColor: "#006FEE",
              }}
              disabled={isSubmitting || loading}
              onClick={() => void handleFinalize()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando Vistoria…
                </>
              ) : (
                "Finalizar Vistoria"
              )}
            </Button>
          </div>
        </div>

        {/* Seletor de equipamento */}
        {equipments.length > 1 ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Equipamento em vistoria</CardTitle>
              <CardDescription>Selecione o ativo para preencher o checklist correspondente.</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="h-11 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#0f172a] focus:border-[#006FEE] focus:outline-none focus:ring-2 focus:ring-[#006FEE]/20"
                value={selectedEquipmentId ?? ""}
                onChange={(e) => void handleEquipmentChange(Number(e.target.value))}
              >
                {equipments.map((eq) => (
                  <option key={eq.equipment_id} value={eq.equipment_id}>
                    {eq.identificacao ?? `Equipamento #${eq.equipment_id}`}
                    {eq.local_instalacao ? ` — ${eq.local_instalacao}` : ""}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        ) : null}

        {/* Checklist por ativo */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#006FEE]/10 text-[#006FEE]">
                <ClipboardCheck className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>
                  Checklist — {currentEquipment?.identificacao ?? "Ativo"}
                </CardTitle>
                <CardDescription>
                  Marque o status de cada tarefa e anexe fotos como evidência quando necessário.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {checklist.map((item, index) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                      Tarefa {index + 1}
                    </p>
                    <p
                      className="mt-1 text-base font-semibold text-[#0f172a]"
                      style={{ fontFamily: "Poppins, Inter, sans-serif" }}
                    >
                      {item.title}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={statusButtonClass(item.status === "ok", "ok")}
                      onClick={() => updateItem(item.id, { status: "ok" })}
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      className={statusButtonClass(item.status === "not_ok", "fail")}
                      onClick={() => updateItem(item.id, { status: "not_ok" })}
                    >
                      Não OK
                    </button>
                    <button
                      type="button"
                      className={statusButtonClass(item.status === "na", "na")}
                      onClick={() => updateItem(item.id, { status: "na" })}
                    >
                      N/A
                    </button>

                    <button
                      type="button"
                      aria-label={`Anexar foto — ${item.title}`}
                      className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] transition-colors hover:border-[#006FEE]/40 hover:text-[#006FEE]"
                      onClick={() => fileInputRefs.current[item.id]?.click()}
                    >
                      <Camera className="h-5 w-5" aria-hidden />
                    </button>
                    <input
                      ref={(el) => {
                        fileInputRefs.current[item.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        handlePhotoSelect(item.id, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                {item.status === "not_ok" ? (
                  <div className="mt-3">
                    <label
                      className="mb-1 block text-sm font-medium text-red-700"
                      htmlFor={`failure-notes-${item.id}`}
                    >
                      Descrição da falha *
                    </label>
                    <textarea
                      id={`failure-notes-${item.id}`}
                      className="min-h-[88px] w-full rounded-lg border border-red-200 bg-red-50/40 px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-red-400"
                      placeholder="Descreva o defeito ou não conformidade encontrada…"
                      value={item.failureNotes}
                      onChange={(e) => updateItem(item.id, { failureNotes: e.target.value })}
                    />
                  </div>
                ) : null}

                {item.photoDataUrl ? (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={item.photoDataUrl}
                      alt={item.photoName ?? "Evidência anexada"}
                      className="h-[60px] w-[60px] rounded-lg border border-[#e2e8f0] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-[#64748b]">{item.photoName ?? "Foto anexada"}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Remover foto"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] hover:bg-red-50 hover:text-red-600"
                      onClick={() => updateItem(item.id, { photoDataUrl: null, photoName: null })}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Observações gerais */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Evidências Gerais</CardTitle>
            <CardDescription>Observações do técnico sobre a vistoria como um todo.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="block text-sm font-medium text-[#64748b]" htmlFor="pmoc-general-notes">
              Observações Gerais do Técnico
            </label>
            <textarea
              id="pmoc-general-notes"
              rows={4}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Descreva condições gerais, recomendações ou pendências encontradas…"
              className="mt-2 w-full rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#006FEE] focus:outline-none focus:ring-2 focus:ring-[#006FEE]/20"
            />
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Medições Operacionais</CardTitle>
            <CardDescription>Preencha medições elétricas, frigoríficas e térmicas da inspeção.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Tensão F-F (V)" value={operationalData.voltagePhasePhase} onChange={(e) => setOperationalData((d) => ({ ...d, voltagePhasePhase: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Tensão F-N (V)" value={operationalData.voltagePhaseNeutral} onChange={(e) => setOperationalData((d) => ({ ...d, voltagePhaseNeutral: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Corrente (A)" value={operationalData.currentA} onChange={(e) => setOperationalData((d) => ({ ...d, currentA: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Potência (kW)" value={operationalData.powerKw} onChange={(e) => setOperationalData((d) => ({ ...d, powerKw: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Fator de potência" value={operationalData.powerFactor} onChange={(e) => setOperationalData((d) => ({ ...d, powerFactor: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Pressão sucção" value={operationalData.suctionPressure} onChange={(e) => setOperationalData((d) => ({ ...d, suctionPressure: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Pressão descarga" value={operationalData.dischargePressure} onChange={(e) => setOperationalData((d) => ({ ...d, dischargePressure: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Superaquecimento (°C)" value={operationalData.superheatC} onChange={(e) => setOperationalData((d) => ({ ...d, superheatC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Sub-resfriamento (°C)" value={operationalData.subcoolingC} onChange={(e) => setOperationalData((d) => ({ ...d, subcoolingC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Retorno (°C)" value={operationalData.returnC} onChange={(e) => setOperationalData((d) => ({ ...d, returnC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Insuflamento (°C)" value={operationalData.supplyC} onChange={(e) => setOperationalData((d) => ({ ...d, supplyC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Ambiente (°C)" value={operationalData.ambientC} onChange={(e) => setOperationalData((d) => ({ ...d, ambientC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Externa (°C)" value={operationalData.externalC} onChange={(e) => setOperationalData((d) => ({ ...d, externalC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Delta T (°C)" value={operationalData.deltaTC} onChange={(e) => setOperationalData((d) => ({ ...d, deltaTC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm md:col-span-2" placeholder="Rendimento observado" value={operationalData.observedPerformance} onChange={(e) => setOperationalData((d) => ({ ...d, observedPerformance: e.target.value }))} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Qualidade do Ar e Serviço Executado</CardTitle>
            <CardDescription>Rastreabilidade de QAI e consumíveis utilizados na manutenção.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Temperatura ambiente (°C)" value={indoorAir.ambientTemperatureC} onChange={(e) => setIndoorAir((d) => ({ ...d, ambientTemperatureC: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Umidade relativa (%)" value={indoorAir.relativeHumidityPct} onChange={(e) => setIndoorAir((d) => ({ ...d, relativeHumidityPct: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="CO2 (ppm)" value={indoorAir.co2Ppm} onChange={(e) => setIndoorAir((d) => ({ ...d, co2Ppm: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Taxa renovação de ar" value={indoorAir.airRenewalRate} onChange={(e) => setIndoorAir((d) => ({ ...d, airRenewalRate: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Material particulado" value={indoorAir.particulateMatter} onChange={(e) => setIndoorAir((d) => ({ ...d, particulateMatter: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Fungos/Bactérias" value={indoorAir.fungiBacteria} onChange={(e) => setIndoorAir((d) => ({ ...d, fungiBacteria: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Nome do técnico" value={serviceLog.technicianName} onChange={(e) => setServiceLog((d) => ({ ...d, technicianName: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Horas trabalhadas" value={serviceLog.workedHours} onChange={(e) => setServiceLog((d) => ({ ...d, workedHours: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Assinatura legal (ex.: ICP-Brasil)" value={serviceLog.legalSignatureProvider} onChange={(e) => setServiceLog((d) => ({ ...d, legalSignatureProvider: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm md:col-span-3" placeholder="Serviço executado" value={serviceLog.executedService} onChange={(e) => setServiceLog((d) => ({ ...d, executedService: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Consumível químico" value={serviceLog.materialName} onChange={(e) => setServiceLog((d) => ({ ...d, materialName: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Lote" value={serviceLog.materialLot} onChange={(e) => setServiceLog((d) => ({ ...d, materialLot: e.target.value }))} />
              <input type="date" className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" value={serviceLog.materialValidityDate} onChange={(e) => setServiceLog((d) => ({ ...d, materialValidityDate: e.target.value }))} />
              <input className="h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" placeholder="Quantidade" value={serviceLog.materialQuantity} onChange={(e) => setServiceLog((d) => ({ ...d, materialQuantity: e.target.value }))} />
              <textarea className="min-h-[88px] rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm md:col-span-2" placeholder="Observações do serviço" value={serviceLog.observations} onChange={(e) => setServiceLog((d) => ({ ...d, observations: e.target.value }))} />
            </div>
          </CardContent>
        </Card>

        {/* Assinatura digital */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Assinatura Digital</CardTitle>
            <CardDescription>
              Assinatura do técnico responsável pela vistoria (validade legal do registro de campo).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignaturePad onChange={setSignatureBase64} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            style={{ padding: "12px 16px", fontWeight: 600 }}
            disabled={isSubmitting}
            onClick={() => navigate(`/app/pmoc/${pmocId}`)}
          >
            Voltar
          </Button>
          <Button
            style={{
              padding: "12px 16px",
              fontWeight: 600,
              backgroundColor: "#006FEE",
            }}
            disabled={isSubmitting || loading}
            onClick={() => void handleFinalize()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Enviando Vistoria…
              </>
            ) : (
              "Finalizar Vistoria"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
