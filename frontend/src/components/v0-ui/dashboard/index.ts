// Dashboard Components - v0-ui
// Export all dashboard components for easy importing

// Metric Cards
export {
  MetricCard,
  MetricGrid,
  MetricCardSkeleton,
  MiniMetricCard,
  MetricIconOrders,
  MetricIconClients,
  MetricIconRevenue,
  MetricIconGrowth,
  MetricIconTime,
  MetricIconCheck,
} from "./metric-cards";

export type {
  MetricCardProps,
  MetricGridProps,
  MetricVariant,
  MetricTrend,
  MetricSize,
} from "./metric-cards";

// Revenue Chart
export {
  RevenueChart,
  RevenueChartCard,
  RevenueChartSkeleton,
  MiniRevenueChart,
} from "./evenue-chart";

export type {
  RevenueChartProps,
  RevenueChartCardProps,
  RevenueDataPoint,
  MiniRevenueChartProps,
} from "./evenue-chart";

// Recent Orders Table
export {
  RecentOrdersTable,
  RecentOrdersCard,
  RecentOrdersTableSkeleton,
} from "./recent-orders";

export type {
  RecentOrdersTableProps,
  RecentOrdersCardProps,
  ServiceOrder,
  OrderStatus,
  OrderClient,
  OrderTechnician,
} from "./recent-orders";
  