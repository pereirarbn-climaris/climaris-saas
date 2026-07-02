import { useEffect, useMemo, useState } from "react";
import {
  fetchDashboardExtendedKpis,
  fetchDashboardFinancialSnapshot,
  fetchDashboardHomeKpis,
  fetchDashboardOrderBreakdown,
  fetchDashboardPmocSummary,
  fetchDashboardRevenueChart,
  fetchDashboardTechnicianWorkload,
  fetchDashboardTier,
  fetchDashboardUpcomingSchedules,
  fetchRecentOrders,
  mapRecentOrdersToTableRows,
  mapRevenueChartToDataPoints,
  type DashboardExtendedKpisOut,
  type DashboardFinancialSnapshotOut,
  type DashboardHomeKpisOut,
  type DashboardOrderStatusBreakdownItemOut,
  type DashboardPmocSummaryOut,
  type DashboardRevenueChartOut,
  type DashboardTechnicianWorkloadOut,
  type DashboardTierOut,
  type DashboardUpcomingScheduleOut,
} from "../../api/dashboard";
import { listPmocOccurrenceAlerts, type PmocOccurrenceAlertOut } from "../../api/pmoc";
import type { RevenueDataPoint, ServiceOrder } from "../../components/v0-ui/dashboard";
import type { DashboardTier } from "../../lib/dashboardEntitlements";
import { hasDashboardTier } from "../../lib/dashboardEntitlements";

function computeGrowthPercent(data: RevenueDataPoint[]): number | undefined {
  if (data.length < 2) return undefined;
  const last = data[data.length - 1]!.revenue;
  const prev = data[data.length - 2]!.revenue;
  if (prev <= 0) return undefined;
  return ((last - prev) / prev) * 100;
}

export type DashboardHomeData = {
  tier: DashboardTier;
  tierInfo: DashboardTierOut | null;
  kpis: DashboardHomeKpisOut | null;
  extended: DashboardExtendedKpisOut | null;
  revenueChart: DashboardRevenueChartOut | null;
  revenueData: RevenueDataPoint[];
  totalRevenue: number;
  growthPercent: number | undefined;
  recentOrders: ServiceOrder[];
  incidentAlerts: PmocOccurrenceAlertOut[];
  orderBreakdown: DashboardOrderStatusBreakdownItemOut[];
  upcomingSchedules: DashboardUpcomingScheduleOut[];
  financialSnapshot: DashboardFinancialSnapshotOut | null;
  pmocSummary: DashboardPmocSummaryOut | null;
  technicianWorkload: DashboardTechnicianWorkloadOut[];
  isLoading: boolean;
  chartLoading: boolean;
  ordersLoading: boolean;
  extendedLoading: boolean;
  error: string | null;
  chartError: string | null;
  ordersError: string | null;
};

function chartMonthsForTier(tier: DashboardTier): number {
  if (hasDashboardTier(tier, "complete")) return 12;
  if (hasDashboardTier(tier, "advanced")) return 9;
  return 6;
}

export function useDashboardHomeData(canSeePmocIncidents: boolean): DashboardHomeData {
  const [tierInfo, setTierInfo] = useState<DashboardTierOut | null>(null);
  const [kpis, setKpis] = useState<DashboardHomeKpisOut | null>(null);
  const [extended, setExtended] = useState<DashboardExtendedKpisOut | null>(null);
  const [revenueChart, setRevenueChart] = useState<DashboardRevenueChartOut | null>(null);
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([]);
  const [incidentAlerts, setIncidentAlerts] = useState<PmocOccurrenceAlertOut[]>([]);
  const [orderBreakdown, setOrderBreakdown] = useState<DashboardOrderStatusBreakdownItemOut[]>([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<DashboardUpcomingScheduleOut[]>([]);
  const [financialSnapshot, setFinancialSnapshot] = useState<DashboardFinancialSnapshotOut | null>(null);
  const [pmocSummary, setPmocSummary] = useState<DashboardPmocSummaryOut | null>(null);
  const [technicianWorkload, setTechnicianWorkload] = useState<DashboardTechnicianWorkloadOut[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [extendedLoading, setExtendedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const tier: DashboardTier = tierInfo?.tier ?? "basic";

  const revenueData = useMemo(
    () => (revenueChart ? mapRevenueChartToDataPoints(revenueChart) : []),
    [revenueChart],
  );

  const totalRevenue = useMemo(
    () => revenueData.reduce((sum, point) => sum + point.revenue, 0),
    [revenueData],
  );

  const growthPercent = useMemo(() => computeGrowthPercent(revenueData), [revenueData]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setChartLoading(true);
    setOrdersLoading(true);
    setExtendedLoading(true);
    setError(null);
    setChartError(null);
    setOrdersError(null);

    void (async () => {
      const tierResult = await Promise.allSettled([fetchDashboardTier()]);
      if (cancelled) return;

      let resolvedTier: DashboardTier = "basic";
      if (tierResult[0]?.status === "fulfilled") {
        setTierInfo(tierResult[0].value);
        resolvedTier = tierResult[0].value.tier;
      }

      const isAdvanced = hasDashboardTier(resolvedTier, "advanced");
      const isComplete = hasDashboardTier(resolvedTier, "complete");
      const chartMonths = chartMonthsForTier(resolvedTier);

      const [
        kpisResult,
        chartResult,
        ordersResult,
        alertsResult,
        extendedResult,
        breakdownResult,
        schedulesResult,
        financialResult,
        pmocResult,
        workloadResult,
      ] = await Promise.allSettled([
        fetchDashboardHomeKpis(),
        fetchDashboardRevenueChart(chartMonths),
        fetchRecentOrders(isComplete ? 8 : 5),
        canSeePmocIncidents ? listPmocOccurrenceAlerts(8) : Promise.resolve([] as PmocOccurrenceAlertOut[]),
        isAdvanced ? fetchDashboardExtendedKpis() : Promise.resolve(null),
        isAdvanced ? fetchDashboardOrderBreakdown() : Promise.resolve([]),
        isAdvanced ? fetchDashboardUpcomingSchedules(5) : Promise.resolve([]),
        isComplete ? fetchDashboardFinancialSnapshot() : Promise.resolve(null),
        isComplete ? fetchDashboardPmocSummary() : Promise.resolve(null),
        isComplete ? fetchDashboardTechnicianWorkload() : Promise.resolve([]),
      ]);

      if (cancelled) return;

      if (kpisResult.status === "fulfilled") {
        setKpis(kpisResult.value);
      } else {
        setKpis(null);
        setError(
          kpisResult.reason instanceof Error
            ? kpisResult.reason.message
            : "Não foi possível carregar os indicadores.",
        );
      }
      setIsLoading(false);

      if (chartResult.status === "fulfilled") {
        setRevenueChart(chartResult.value);
        setChartError(null);
      } else {
        setRevenueChart(null);
        setChartError(
          chartResult.reason instanceof Error
            ? chartResult.reason.message
            : "Não foi possível carregar o gráfico.",
        );
      }
      setChartLoading(false);

      if (ordersResult.status === "fulfilled") {
        setRecentOrders(mapRecentOrdersToTableRows(ordersResult.value));
        setOrdersError(null);
      } else {
        setRecentOrders([]);
        setOrdersError(
          ordersResult.reason instanceof Error
            ? ordersResult.reason.message
            : "Não foi possível carregar as ordens recentes.",
        );
      }
      setOrdersLoading(false);

      if (canSeePmocIncidents && alertsResult.status === "fulfilled") {
        setIncidentAlerts(alertsResult.value);
      } else {
        setIncidentAlerts([]);
      }

      setExtended(extendedResult.status === "fulfilled" ? extendedResult.value : null);
      setOrderBreakdown(breakdownResult.status === "fulfilled" ? breakdownResult.value : []);
      setUpcomingSchedules(schedulesResult.status === "fulfilled" ? schedulesResult.value : []);
      setFinancialSnapshot(financialResult.status === "fulfilled" ? financialResult.value : null);
      setPmocSummary(pmocResult.status === "fulfilled" ? pmocResult.value : null);
      setTechnicianWorkload(workloadResult.status === "fulfilled" ? workloadResult.value : []);
      setExtendedLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [canSeePmocIncidents]);

  return {
    tier,
    tierInfo,
    kpis,
    extended,
    revenueChart,
    revenueData,
    totalRevenue,
    growthPercent,
    recentOrders,
    incidentAlerts,
    orderBreakdown,
    upcomingSchedules,
    financialSnapshot,
    pmocSummary,
    technicianWorkload,
    isLoading,
    chartLoading,
    ordersLoading,
    extendedLoading,
    error,
    chartError,
    ordersError,
  };
}
