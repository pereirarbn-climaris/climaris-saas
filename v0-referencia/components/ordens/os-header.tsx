"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Calendar, Clock, DollarSign, Hash } from "lucide-react"

const statusConfig = {
  rascunho: { label: "Rascunho", color: "bg-slate-500 text-white" },
  pendente: { label: "Pendente", color: "bg-amber-500 text-white" },
  aprovada: { label: "Aprovada", color: "bg-emerald-500 text-white" },
  em_execucao: { label: "Em Execução", color: "bg-blue-500 text-white" },
  concluida: { label: "Concluída", color: "bg-green-600 text-white" },
  cancelada: { label: "Cancelada", color: "bg-red-500 text-white" },
}

interface OSHeaderProps {
  numero: string
  status: keyof typeof statusConfig
  dataAgendada: string | null
  totalEstimado: number
}

export function OSHeader({ numero, status, dataAgendada, totalEstimado }: OSHeaderProps) {
  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className="bg-gradient-to-r from-primary via-primary to-primary/90 p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {/* Número da OS */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary-foreground/70">
              <Hash className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Número da OS</span>
            </div>
            <p className="text-2xl font-bold text-primary-foreground">{numero}</p>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary-foreground/70">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Status Atual</span>
            </div>
            <div className="mt-0.5">
              <Badge className={`${statusConfig[status].color} border-0 px-3 py-1 font-semibold`}>
                {statusConfig[status].label}
              </Badge>
            </div>
          </div>

          {/* Data Agendada */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary-foreground/70">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Agendada para</span>
            </div>
            <p className="text-lg font-semibold text-primary-foreground">
              {dataAgendada || "Não agendada"}
            </p>
          </div>

          {/* Total Estimado */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary-foreground/70">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Estimado</span>
            </div>
            <p className="text-2xl font-bold text-primary-foreground">
              R$ {totalEstimado.toFixed(2).replace(".", ",")}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
