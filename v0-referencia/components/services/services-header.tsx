"use client"

import { Wrench, Clock, TrendingUp, DollarSign } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const stats = [
  {
    title: "Total de Serviços",
    value: "12",
    subtitle: "2 novos este mês",
    icon: Wrench,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    title: "Tempo Médio",
    value: "2h 30min",
    subtitle: "Por serviço",
    icon: Clock,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600",
  },
  {
    title: "Ticket Médio",
    value: "R$ 385,00",
    subtitle: "Preço de venda",
    icon: DollarSign,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600",
  },
  {
    title: "Margem Média",
    value: "58%",
    subtitle: "Lucro sobre preço",
    icon: TrendingUp,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-600",
  },
]

export function ServicesHeader() {
  return (
    <div className="space-y-6">
      {/* Title Section */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Serviços</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os serviços oferecidos, tempo de execução e precificação
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.iconBg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
