"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { OSHeader } from "@/components/ordens/os-header"
import { OSTabNavigation } from "@/components/ordens/os-tab-navigation"
import { OSDadosIniciais } from "@/components/ordens/os-dados-iniciais"
import { OSServicosEProdutos } from "@/components/ordens/os-servicos-produtos"
import { OSPlanejamento } from "@/components/ordens/os-planejamento"
import { OSConclusao } from "@/components/ordens/os-conclusao"
import { ArrowLeft } from "lucide-react"

// Mock data para demonstração
const mockOS = {
  id: 35,
  numero: "#35",
  status: "aprovada" as const,
  dataAgendada: "24/04/2026, 14:50",
  totalEstimado: 170.0,
  cliente: {
    nome: "Robson Pereira",
    documento: "29990581878",
    contato: "16",
    endereco: "Rua Bragança - 413 - Apto 01 - Vila Linda - Santo André - SP - 09181300",
  },
  servicos: [
    {
      id: 1,
      nome: "Limpeza e higienização da condensadora hi-wall de 12000BTUs",
      quantidade: 1,
      preco: 170.0,
      tempo: 40,
    },
  ],
  produtos: [],
  tecnico: "Robson Ferreira",
  observacoes: "Informacoes importantes para a equipe e para o atendimento.",
  tempoTotal: 40,
  valorServicos: 170.0,
  valorProdutos: 0,
  valorTotal: 170.0,
}

export default function OrdemDeServicoPage() {
  const params = useParams()
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
              <h1 className="text-2xl font-bold text-foreground">OS {mockOS.numero}</h1>
              <p className="text-muted-foreground">
                A OS pode ter produtos e serviços. O agendamento usa o tempo total dos serviços
                selecionados para calcular o fim.
              </p>
            </div>

            {/* OS Header Card */}
            <div className="mb-6">
              <OSHeader
                numero={mockOS.numero}
                status={mockOS.status}
                dataAgendada={mockOS.dataAgendada}
                totalEstimado={mockOS.totalEstimado}
              />
            </div>

            {/* Tab Navigation */}
            <OSTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === "dados-iniciais" && (
                <OSDadosIniciais
                  cliente={mockOS.cliente}
                  status={mockOS.status}
                  observacoes={mockOS.observacoes}
                />
              )}

              {activeTab === "servicos-produtos" && (
                <OSServicosEProdutos
                  servicos={mockOS.servicos}
                  produtos={mockOS.produtos}
                  tempoTotal={mockOS.tempoTotal}
                  valorServicos={mockOS.valorServicos}
                  valorProdutos={mockOS.valorProdutos}
                  valorTotal={mockOS.valorTotal}
                />
              )}

              {activeTab === "planejamento" && (
                <OSPlanejamento tecnicoAtual={mockOS.tecnico} />
              )}

              {activeTab === "conclusao" && (
                <OSConclusao
                  status={mockOS.status}
                  tecnico={mockOS.tecnico}
                  dataAgendada={mockOS.dataAgendada}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
