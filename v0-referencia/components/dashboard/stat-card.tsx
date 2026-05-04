import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  variant?: "default" | "primary" | "success" | "warning"
}

const variantStyles = {
  default: {
    bg: "bg-card",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
  primary: {
    bg: "bg-primary/5",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  success: {
    bg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  warning: {
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = "default",
}: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border p-5 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5",
        styles.bg
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {value}
            </p>
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-emerald-600" : "text-red-500"
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
            styles.iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", styles.iconColor)} />
        </div>
      </div>
      
      {/* Decorative gradient */}
      <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </div>
  )
}
