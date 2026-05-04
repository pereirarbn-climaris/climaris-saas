"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ClientsStats } from "@/components/clients/clients-stats"
import { ClientsSearch } from "@/components/clients/clients-search"
import { ClientsTable } from "@/components/clients/clients-table"

export default function ClientsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/clientes"
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Clientes"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">
            {/* Stats Cards */}
            <ClientsStats />

            {/* Search and Filters */}
            <ClientsSearch />

            {/* Clients Table */}
            <ClientsTable />
          </div>
        </main>
      </div>
    </div>
  )
}
