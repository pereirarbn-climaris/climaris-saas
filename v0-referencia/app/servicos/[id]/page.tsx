"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ServiceEditForm } from "@/components/services/service-edit-form"

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditServicePage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar activePath="/servicos" />
      
      <div className="flex flex-1 flex-col">
        <DashboardHeader 
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Serviços"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />
        
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl px-6 py-8">
            <ServiceEditForm 
              serviceId={id}
              onBack={() => router.push("/servicos")}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
