"use client"

import { useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { OSTabNavigation } from "@/components/ordens/os-tab-navigation"
import { OSDadosIniciais } from "@/components/ordens/os-dados-iniciais"
import { OSServicosEProdutos } from "@/components/ordens/os-servicos-produtos"
import { OSPlanejamento } from "@/components/ordens/os-planejamento"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, FileText } from "lucide-react"

export default function NovaOrdemPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState("dados-iniciais")

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/ordens"
      />

      <div className="flex flex-1 flex-col">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Ordens de serviço"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-6">
            {/* Back Link */}
            <Link
              href="/ordens"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar a lista
            </Link>

            {/* Title */}
            <div className="mb-2">
              <h1 className="text-2xl font-bold text-foreground">Nova Ordem de Serviço</h1>
              <p className="text-muted-foreground">
                Preencha os dados para criar uma nova OS. Você pode adicionar serviços, produtos e
                agendar com um técnico.
              </p>
            </div>

            {/* Header Card - New OS */}
            <Card className="mb-6 overflow-hidden">
              <div className="bg-gradient-to-r from-primary to-primary/80 p-6">
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                      Número da OS
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary-foreground/80" />
                      <p className="text-lg font-bold text-primary-foreground">Nova</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                      Status Atual
                    </p>
                    <div className="mt-1">
                      <Badge className="bg-white/20 text-white hover:bg-white/30">Rascunho</Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                      Agendada para
                    </p>
                    <p className="mt-1 text-lg font-semibold text-primary-foreground">
                      A definir
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                      Total Estimado
                    </p>
                    <p className="mt-1 text-lg font-bold text-primary-foreground">R$ 0,00</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Tab Navigation */}
            <OSTabNavigation activeTab={activeTab} onTabChange={setActiveTab} isNew />

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === "dados-iniciais" && (
                <OSDadosIniciais
                  cliente={null}
                  status="rascunho"
                  observacoes=""
                  isEditing
                />
              )}

              {activeTab === "servicos-produtos" && (
                <OSServicosEProdutos
                  servicos={[]}
                  produtos={[]}
                  tempoTotal={0}
                  valorServicos={0}
                  valorProdutos={0}
                  valorTotal={0}
                  isEditing
                />
              )}

              {activeTab === "planejamento" && <OSPlanejamento tecnicoAtual={null} isEditing />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
