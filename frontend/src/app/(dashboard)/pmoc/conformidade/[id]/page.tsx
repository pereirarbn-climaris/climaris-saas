import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  History,
  Loader2,
  Thermometer,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  fetchPmocReportPdf,
  getPmocAnalyticsSummary,
  getPmocComplianceSummary,
  getPmocPlan,
  listPmocActivities,
  listPmocAirAnalyses,
  listPmocEquipments,
  listPmocExecutions,
  listPmocOccurrences,
  type PmocAirQualityAnalysisOut,
  type PmocAnalyticsSummaryOut,
  type PmocComplianceSummaryOut,
  type PmocExecutionOut,
  type PmocOccurrenceOut,
  type PmocPlanEquipmentOut,
} from "../../../../../api/pmoc";
import { PmocAirAnalysisSection } from "../../../../../components/pmoc/PmocAirAnalysisSection";
import { PmocComplianceTrafficPanel } from "../../../../../components/pmoc/PmocComplianceTrafficPanel";
import { PmocOccurrencesPanel } from "../../../../../components/pmoc/PmocOccurrencesPanel";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../../components/ui/table";
import { computeNextAirAnalysis } from "../../../../../lib/pmocAirAnalysisUtils";
import { toast } from "../../../../../lib/toast";
import type { DashboardOutletContext } from "../../../../../pages/dashboardContext";
import "./pmoc-conformidade.tailwind.css";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EquipmentHealthStatus = "ok" | "fail" | "pending";

export type PmocComplianceEquipmentRow = {
  id: number;
  name: string;
  model: string;
  location: string;
  btu: number;
  lastInspectionLabel: string;
  status: EquipmentHealthStatus;
};

export type PmocComplianceDashboardData = {
  pmocId: number;
  unitName: string;
  clientName: string;
  planTitle: string;
  hasContractualPendencies: boolean;
  totalAssets: number;
  totalBtu: number;
  preventiveCompletionPct: number;
  nextAirAnalysisLabel: string;
  nextAirAnalysisAttention: boolean;
  equipments: PmocComplianceEquipmentRow[];
};

// ─── Mock (render imediato + fallback de integração) ──────────────────────────

export const mockPmocComplianceData: PmocComplianceDashboardData = {
  pmocId: 1,
  unitName: "Ar Ideal Climatizadora — Matriz",
  clientName: "Ar Ideal Climatizadora",
  planTitle: "PMOC Anual 2026 — Escritório Central",
  hasContractualPendencies: true,
  totalAssets: 8,
  totalBtu: 120_000,
  preventiveCompletionPct: 92,
  nextAirAnalysisLabel: "Julho/2026",
  nextAirAnalysisAttention: false,
  equipments: [
    {
      id: 101,
      name: "Split Inverter 24000",
      model: "Carrier XPower",
      location: "Sala de Reunião",
      btu: 24_000,
      lastInspectionLabel: "12/05/2026",
      status: "ok",
    },
    {
      id: 102,
      name: "Split Hi-Wall 18000",
      model: "LG Dual Inverter",
      location: "Recepção",
      btu: 18_000,
      lastInspectionLabel: "10/05/2026",
      status: "ok",
    },
    {
      id: 103,
      name: "Cassete 48000",
      model: "Daikin Sky Air",
      location: "Open Space",
      btu: 48_000,
      lastInspectionLabel: "—",
      status: "pending",
    },
    {
      id: 104,
      name: "Split 12000",
      model: "Samsung WindFree",
      location: "Sala TI",
      btu: 12_000,
      lastInspectionLabel: "02/04/2026",
      status: "fail",
    },
    {
      id: 105,
      name: "Split 9000",
      model: "Midea Spring",
      location: "Copa",
      btu: 9_000,
      lastInspectionLabel: "15/05/2026",
      status: "ok",
    },
    {
      id: 106,
      name: "Split 9000",
      model: "Gree G-Top",
      location: "Diretoria",
      btu: 9_000,
      lastInspectionLabel: "14/05/2026",
      status: "ok",
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTUs`;
  if (n >= 1_000) return `${n.toLocaleString("pt-BR")} BTUs`;
  return `${n} BTUs`;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function parseFieldInspectionNotes(notes: string | null): { hasNotOk: boolean } | null {
  if (!notes?.trim()) return null;
  try {
    const data = JSON.parse(notes) as { type?: string; checklist?: Array<{ status?: string }> };
    if (data.type !== "field_inspection" || !Array.isArray(data.checklist)) return null;
    const hasNotOk = data.checklist.some((item) => item.status === "not_ok");
    return { hasNotOk };
  } catch {
    return null;
  }
}

function resolveEquipmentStatus(
  equipmentId: number,
  executions: PmocExecutionOut[],
): { status: EquipmentHealthStatus; lastInspectionLabel: string } {
  const related = executions
    .filter((ex) => ex.equipment_id === equipmentId)
    .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());

  if (related.length === 0) {
    return { status: "pending", lastInspectionLabel: "—" };
  }

  const latest = related[0]!;
  const inspection = parseFieldInspectionNotes(latest.notes);

  if (inspection?.hasNotOk || latest.completion_status === "partial" || latest.completion_status === "skipped") {
    return { status: "fail", lastInspectionLabel: formatDateShort(latest.executed_at) };
  }

  if (inspection || latest.completion_status === "done") {
    return { status: "ok", lastInspectionLabel: formatDateShort(latest.executed_at) };
  }

  return { status: "pending", lastInspectionLabel: formatDateShort(latest.executed_at) };
}

function buildDashboardFromApi(
  pmocId: number,
  plan: Awaited<ReturnType<typeof getPmocPlan>>,
  equipments: PmocPlanEquipmentOut[],
  executions: PmocExecutionOut[],
  activitiesCount: number,
  airAnalyses: PmocAirQualityAnalysisOut[],
): PmocComplianceDashboardData {
  const equipmentRows: PmocComplianceEquipmentRow[] = equipments.map((eq) => {
    const { status, lastInspectionLabel } = resolveEquipmentStatus(eq.equipment_id, executions);
    return {
      id: eq.equipment_id,
      name: eq.identificacao ?? `Equipamento #${eq.equipment_id}`,
      model: eq.modelo ?? "—",
      location: eq.local_instalacao ?? "—",
      btu: eq.capacidade_btu ?? 0,
      lastInspectionLabel,
      status,
    };
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthExecutions = executions.filter((ex) => new Date(ex.executed_at) >= monthStart);
  const denominator = Math.max(activitiesCount, equipments.length, 1);
  const preventiveCompletionPct = Math.min(100, Math.round((monthExecutions.length / denominator) * 100));

  const hasFail = equipmentRows.some((row) => row.status === "fail");
  const hasPending = equipmentRows.some((row) => row.status === "pending");
  const nextAir = computeNextAirAnalysis(airAnalyses, plan.next_air_analysis_due);
  const hasContractualPendencies =
    hasFail || hasPending || preventiveCompletionPct < 100 || nextAir.attention;

  const totalBtu =
    plan.total_btu_sum > 0
      ? plan.total_btu_sum
      : equipmentRows.reduce((acc, row) => acc + row.btu, 0);

  return {
    pmocId,
    unitName: plan.client?.trade_name ?? plan.client?.name ?? `Cliente #${plan.client_id}`,
    clientName: plan.client?.name ?? `Cliente #${plan.client_id}`,
    planTitle: plan.title,
    hasContractualPendencies,
    totalAssets: equipments.length,
    totalBtu,
    preventiveCompletionPct,
    nextAirAnalysisLabel: nextAir.label,
    nextAirAnalysisAttention: nextAir.attention,
    equipments: equipmentRows,
  };
}

function statusMeta(status: EquipmentHealthStatus): { label: string; dotClass: string; badgeClass: string } {
  if (status === "ok") {
    return {
      label: "OK",
      dotClass: "bg-emerald-500",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (status === "fail") {
    return {
      label: "Falha / Urgente",
      dotClass: "bg-red-500",
      badgeClass: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return {
    label: "Pendente",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
  };
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  attention,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-white p-6 shadow-sm ${attention ? "ring-1 ring-amber-300" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className={`text-sm font-medium ${attention ? "text-amber-700" : "text-[#64748b]"}`}>{label}</p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            attention ? "bg-amber-100 text-amber-700" : "bg-[#006FEE]/10 text-[#006FEE]"
          }`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`text-2xl font-semibold tracking-tight md:text-3xl ${
          attention ? "text-amber-800" : "text-[#0f172a]"
        }`}
        style={{ fontFamily: "Poppins, Inter, sans-serif" }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PmocConformidadePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const pmocId = id ? Number.parseInt(id, 10) : NaN;

  const [data, setData] = useState<PmocComplianceDashboardData>(mockPmocComplianceData);
  const [complianceSummary, setComplianceSummary] = useState<PmocComplianceSummaryOut | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<PmocAnalyticsSummaryOut | null>(null);
  const [occurrences, setOccurrences] = useState<PmocOccurrenceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!Number.isFinite(pmocId)) return;
    setLoading(true);
    setLoadError("");
    try {
      const [plan, equipments, executions, activities, analyses, summary, analytics, openOccurrences] = await Promise.all([
        getPmocPlan(pmocId),
        listPmocEquipments(pmocId),
        listPmocExecutions(pmocId),
        listPmocActivities(pmocId),
        listPmocAirAnalyses(pmocId),
        getPmocComplianceSummary(pmocId),
        getPmocAnalyticsSummary(pmocId),
        listPmocOccurrences(pmocId, { status: "open" }),
      ]);
      setData(buildDashboardFromApi(pmocId, plan, equipments, executions, activities.length, analyses));
      setComplianceSummary(summary);
      setAnalyticsSummary(analytics);
      setOccurrences(openOccurrences);
      setUsingMock(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
      setData({ ...mockPmocComplianceData, pmocId });
      setAnalyticsSummary(null);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, [pmocId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const complianceBadge = useMemo(() => {
    if (data.hasContractualPendencies) {
      return {
        variant: "warning" as const,
        label: "Atenção: Pendências Contratuais",
      };
    }
    return {
      variant: "success" as const,
      label: "100% Em Conformidade Legal",
    };
  }, [data.hasContractualPendencies]);

  const handleAirAnalysesChange = useCallback((rows: PmocAirQualityAnalysisOut[]) => {
    setData((prev) => {
      const nextAir = computeNextAirAnalysis(rows, null);
      return {
        ...prev,
        nextAirAnalysisLabel: nextAir.label,
        nextAirAnalysisAttention: nextAir.attention,
        hasContractualPendencies:
          prev.equipments.some((row) => row.status === "fail" || row.status === "pending") ||
          prev.preventiveCompletionPct < 100 ||
          nextAir.attention,
      };
    });
  }, []);

  const handleDownloadPdf = async () => {
    if (!Number.isFinite(pmocId)) return;
    setDownloadingPdf(true);
    try {
      const blob = await fetchPmocReportPdf(pmocId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PMOC-Laudo-${pmocId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Laudo oficial baixado com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar o laudo.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!ctx) return <Navigate to="/login" replace />;
  if (!Number.isFinite(pmocId)) return <Navigate to="/app/pmoc" replace />;

  return (
    <div className="min-h-full bg-[#f8fafc] pb-10 font-[Inter,system-ui,sans-serif]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        {/* Cabeçalho + ações */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#006FEE]">PMOC 2.0</p>
              <h1
                className="mt-1 text-2xl font-semibold text-[#0f172a] md:text-3xl"
                style={{ fontFamily: "Poppins, Inter, sans-serif" }}
              >
                Painel de Conformidade PMOC
              </h1>
              <p className="mt-1 text-sm text-[#64748b]">
                {data.unitName} · {data.planTitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={complianceBadge.variant}>{complianceBadge.label}</Badge>
              {usingMock ? (
                <Badge variant="outline">Exibindo dados simulados</Badge>
              ) : null}
              {loading ? (
                <span className="inline-flex items-center gap-1 text-xs text-[#64748b]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Atualizando…
                </span>
              ) : null}
            </div>
            {loadError ? <p className="text-sm text-amber-700">{loadError}</p> : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              variant="outline"
              style={{
                padding: "12px 16px",
                fontWeight: 600,
                color: "#006FEE",
                borderColor: "#006FEE",
              }}
              onClick={() => navigate(`/app/pmoc/${pmocId}`)}
            >
              <History className="h-4 w-4" aria-hidden />
              Histórico de Ocorrências
            </Button>
            <Button
              style={{
                padding: "12px 16px",
                fontWeight: 600,
                backgroundColor: "#006FEE",
              }}
              disabled={downloadingPdf}
              onClick={() => void handleDownloadPdf()}
            >
              {downloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Baixar Último Laudo Oficial (PDF)
            </Button>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total de Ativos"
            value={String(data.totalAssets)}
            icon={<Building2 className="h-5 w-5" aria-hidden />}
          />
          <MetricCard
            label="Carga Térmica Monitorada"
            value={formatBtu(data.totalBtu)}
            icon={<Thermometer className="h-5 w-5" aria-hidden />}
          />
          <MetricCard
            label="Preventivas Realizadas"
            value={`${data.preventiveCompletionPct}%`}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          />
          <MetricCard
            label="Próxima Análise de Ar"
            value={data.nextAirAnalysisLabel}
            attention={data.nextAirAnalysisAttention}
            icon={<Wind className="h-5 w-5" aria-hidden />}
          />
        </div>

        {complianceSummary ? (
          <PmocComplianceTrafficPanel
            indicators={complianceSummary.indicators}
            overallStatus={complianceSummary.overall_status}
            openOccurrences={complianceSummary.open_occurrences}
          />
        ) : null}

        {analyticsSummary ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>
                Analytics avançado (fase 2)
              </CardTitle>
              <p className="text-sm text-[#64748b]">
                Indicadores calculados a partir de medições e consumíveis normalizados para auditoria.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Cobertura de medições</p>
                  <p className="text-xl font-semibold text-[#0f172a]">{analyticsSummary.measurement_coverage_pct}%</p>
                  <p className="text-xs text-[#64748b]">
                    {analyticsSummary.executions_with_measurements}/{analyticsSummary.total_executions} execuções
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Rastreabilidade de consumíveis</p>
                  <p className="text-xl font-semibold text-[#0f172a]">{analyticsSummary.consumable_traceability_pct}%</p>
                  <p className="text-xs text-[#64748b]">{analyticsSummary.total_consumables_used} itens lançados</p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Ambientes mapeados</p>
                  <p className="text-xl font-semibold text-[#0f172a]">{analyticsSummary.environments_count}</p>
                  <p className="text-xs text-[#64748b]">
                    {analyticsSummary.environments_linked_equipment_count} com equipamento vinculado
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Ocorrências em aberto</p>
                  <p className="text-xl font-semibold text-[#0f172a]">{analyticsSummary.unresolved_occurrences}</p>
                  <p className="text-xs text-[#64748b]">{analyticsSummary.done_executions} execuções concluídas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Delta T médio</p>
                  <p className="text-lg font-semibold text-[#0f172a]">
                    {analyticsSummary.avg_delta_t_c != null ? `${analyticsSummary.avg_delta_t_c} °C` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">Corrente média</p>
                  <p className="text-lg font-semibold text-[#0f172a]">
                    {analyticsSummary.avg_current_a != null ? `${analyticsSummary.avg_current_a} A` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] p-3">
                  <p className="text-xs text-[#64748b]">CO₂ médio</p>
                  <p className="text-lg font-semibold text-[#0f172a]">
                    {analyticsSummary.avg_co2_ppm != null ? `${analyticsSummary.avg_co2_ppm} ppm` : "—"}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Consumível</TableHead>
                      <TableHead>Uso</TableHead>
                      <TableHead>Rastreáveis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyticsSummary.top_consumables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-sm text-[#64748b]">
                          Sem consumíveis registrados nas execuções analisadas.
                        </TableCell>
                      </TableRow>
                    ) : (
                      analyticsSummary.top_consumables.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="font-medium text-[#0f172a]">{row.name}</TableCell>
                          <TableCell>{row.usage_count}</TableCell>
                          <TableCell>{row.traceable_count}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>Plano de ação — ocorrências</CardTitle>
            <p className="text-sm text-[#64748b]">
              Falhas registradas pelo técnico em checklist (O.S. ou vistoria). Visível para gestores e clientes com acesso ao PMOC.
            </p>
          </CardHeader>
          <CardContent>
            <PmocOccurrencesPanel occurrences={occurrences} pmocId={pmocId} />
          </CardContent>
        </Card>

        {!usingMock ? (
          <PmocAirAnalysisSection
            pmocId={pmocId}
            onAnalysesChange={handleAirAnalysesChange}
          />
        ) : null}

        {/* Saúde dos equipamentos */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle style={{ fontFamily: "Poppins, Inter, sans-serif" }}>
                Saúde dos Equipamentos
              </CardTitle>
              <p className="mt-1 text-sm text-[#64748b]">
                Inventário do plano PMOC — visão por ativo com status da última vistoria.
              </p>
            </div>
            <Link
              to={`/app/pmoc/execucao/${pmocId}`}
              className="text-sm font-semibold text-[#006FEE] hover:underline"
            >
              Nova vistoria de campo
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Capacidade</TableHead>
                  <TableHead>Última Vistoria</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.equipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-[#64748b]">
                      Nenhum equipamento vinculado a este plano PMOC.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.equipments.map((row) => {
                    const meta = statusMeta(row.status);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-semibold text-[#0f172a]">{row.name}</p>
                          <p className="text-xs text-[#64748b]">{row.model}</p>
                        </TableCell>
                        <TableCell className="text-[#475569]">{row.location}</TableCell>
                        <TableCell className="font-medium text-[#0f172a]">
                          {row.btu > 0 ? formatBtu(row.btu) : "—"}
                        </TableCell>
                        <TableCell className="text-[#475569]">{row.lastInspectionLabel}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} aria-hidden />
                            {meta.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {data.hasContractualPendencies ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Existem equipamentos com pendência ou falha registrada. Regularize as vistorias e preventivas
                  para restabelecer a conformidade legal do estabelecimento.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[#94a3b8]">
          Laudo em conformidade com a Lei Federal 13.589/2018 e ABNT NBR 17.037:2023.
        </p>
      </div>
    </div>
  );
}
