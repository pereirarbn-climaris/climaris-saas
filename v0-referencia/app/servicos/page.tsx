"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ServicesHeader } from "@/components/services/services-header"
import { ServicesSearch } from "@/components/services/services-search"
import { ServicesTable } from "@/components/services/services-table"

export default function ServicosPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/servicos"
      />

      <div className="flex flex-1 flex-col">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Serviços"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-7xl">
            <ServicesHeader />
            
            <div className="mt-6">
              <ServicesSearch />
            </div>

            <div className="mt-6">
              <ServicesTable />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
