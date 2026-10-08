import { Users, Building2, User, CheckCircle } from "lucide-react"

const stats = [
  {
    title: "TOTAL DE CLIENTES",
    value: "3",
    description: "+2 este mês",
    icon: Users,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    title: "EMPRESAS",
    value: "2",
    description: "67% do total",
    icon: Building2,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  {
    title: "PESSOAS FÍSICAS",
    value: "1",
    description: "33% do total",
    icon: User,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    title: "ATIVOS",
    value: "2",
    description: "67% ativos",
    icon: CheckCircle,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
]

export function ClientsStats() {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {stat.title}
              </p>
              <p className="text-3xl font-bold tracking-tight text-foreground">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </div>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.iconBg}`}
            >
              <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
