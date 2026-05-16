// Dashboard Components - v0-ui
// Export all dashboard components for easy importing

// Metric Cards
export {
  MetricCard,
  MetricGrid,
  MetricCardSkeleton,
  MiniMetricCard,
  // Icons
  ClipboardIcon,
  UsersIcon,
  CurrencyIcon,
  TrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
} from './metric-cards'

export type {
  MetricCardProps,
  MetricGridProps,
  MiniMetricCardProps,
} from './metric-cards'

// Revenue Chart
export {
  RevenueChart,
  RevenueChartSkeleton,
  MiniRevenueChart,
} from './revenue-chart'

export type {
  RevenueChartProps,
  RevenueDataPoint,
  MiniRevenueChartProps,
} from './revenue-chart'

// Recent Orders Table
export {
  RecentOrdersTable,
  RecentOrdersTableSkeleton,
  OrderStatusBadge,
  OrderRow,
} from './recent-orders'

export type {
  RecentOrdersTableProps,
  Order,
  OrderStatus,
  OrderRowProps,
} from './recent-orders'
