"use client"

import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ProductEditForm } from "@/components/products/product-edit-form"

export default function NewProductPage() {
  const router = useRouter()

  const handleBack = () => {
    router.push("/produtos")
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar activePath="/produtos" />
      <div className="flex flex-1 flex-col">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Produtos"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />
        <main className="flex-1 overflow-auto p-6">
          <ProductEditForm
            onBack={handleBack}
          />
        </main>
      </div>
    </div>
  )
}
