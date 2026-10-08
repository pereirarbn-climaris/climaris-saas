"use client"

import { Search, SlidersHorizontal, Download, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ClientsSearch() {
  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5">
      <p className="mb-3 text-sm font-medium text-foreground">Buscar</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar nome, documento, e-mail, telefone ou WhatsApp"
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        </div>
      </div>
    </div>
  )
}
