"use client"

import { useState } from "react"
import {
  ClipboardList,
  CalendarClock,
  Users,
  Package,
  Wrench,
  CheckCircle,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { StatCard } from "@/components/dashboard/stat-card"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { OnboardingSteps } from "@/components/dashboard/onboarding-steps"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const stats = [
  {
    title: "Ordens em aberto",
    value: "12",
    description: "4 aguardando aprovação",
    icon: ClipboardList,
    variant: "primary" as const,
    trend: { value: 8, isPositive: true },
  },
  {
    title: "Agendamentos hoje",
    value: "5",
    description: "Calendário do tenant",
    icon: CalendarClock,
    variant: "default" as const,
  },
  {
    title: "Clientes ativos",
    value: "148",
    description: "Base de clientes",
    icon: Users,
    variant: "success" as const,
    trend: { value: 12, isPositive: true },
  },
  {
    title: "Produtos ativos",
    value: "67",
    description: "Catálogo de produtos",
    icon: Package,
    variant: "default" as const,
  },
  {
    title: "Serviços ativos",
    value: "23",
    description: "Catálogo para agendamentos",
    icon: Wrench,
    variant: "default" as const,
  },
]

export default function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">
            {/* Welcome Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Bom dia, Robson!
                  </h2>
                  <p className="text-muted-foreground">
                    Aqui está o resumo das suas operações.
                  </p>
                </div>
                <Button className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Ver relatórios
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {stats.map((stat) => (
                <StatCard key={stat.title} {...stat} />
              ))}
            </div>

            {/* Monthly KPI */}
            <div className="mb-8">
              <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
                      <CheckCircle className="h-7 w-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700">
                        OS concluídas este mês
                      </p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-4xl font-bold text-emerald-800">
                          42
                        </p>
                        <span className="text-sm font-medium text-emerald-600">
                          +18% vs. mês anterior
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 gap-2"
                  >
                    Ver detalhes
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Onboarding */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      4
                    </span>
                    Próximos passos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <OnboardingSteps />
                </CardContent>
              </Card>

              {/* Activity */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Atividade recente</CardTitle>
                    <Button variant="ghost" size="sm" className="text-primary">
                      Ver tudo
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ActivityFeed />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
