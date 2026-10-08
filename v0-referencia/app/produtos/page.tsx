"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ProductsSearch } from "@/components/products/products-search"
import { ProductsTable } from "@/components/products/products-table"

export default function ProductsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/produtos"
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Produtos"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">
            {/* Search and Sort */}
            <ProductsSearch />

            {/* Products Table */}
            <ProductsTable />
          </div>
        </main>
      </div>
    </div>
  )
}
