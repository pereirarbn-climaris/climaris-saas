"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ClientEditForm } from "@/components/clients/client-edit-form"

export default function ClientEditPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string

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
          <div className="mx-auto max-w-4xl p-6">
            <ClientEditForm 
              clientId={clientId} 
              onBack={() => router.push("/clientes")}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
