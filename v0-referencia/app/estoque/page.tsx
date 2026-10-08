"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { InventoryAdjustment } from "@/components/inventory/inventory-adjustment"
import { InventoryTable } from "@/components/inventory/inventory-table"

export default function EstoquePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/estoque"
      />

      <div className="flex flex-1 flex-col">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Estoque"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Page Header */}
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Estoque</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Saldo físico, reserva em OS aprovadas ou em andamento (insumos dos serviços + itens de produto), e saldo disponível.
              </p>
            </div>

            {/* Manual Adjustment */}
            <InventoryAdjustment />

            {/* Inventory Table */}
            <InventoryTable />
          </div>
        </main>
      </div>
    </div>
  )
}
