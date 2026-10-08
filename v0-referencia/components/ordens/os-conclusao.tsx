"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  CheckCircle2,
  ListChecks,
  Calendar,
  User,
  Clock,
  PlayCircle,
  CheckCircle,
  XCircle,
  CalendarCheck,
  CalendarX,
  Package,
} from "lucide-react"

const statusConfig = {
  rascunho: { label: "Rascunho", color: "bg-slate-100 text-slate-700" },
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-700" },
  aprovada: { label: "Aprovada", color: "bg-emerald-100 text-emerald-700" },
  em_execucao: { label: "Em Execução", color: "bg-blue-100 text-blue-700" },
  concluida: { label: "Concluída", color: "bg-green-100 text-green-700" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700" },
}

const tecnicos = [
  { id: "robson", nome: "Robson Ferreira" },
  { id: "carlos", nome: "Carlos Santos" },
  { id: "maria", nome: "Maria Oliveira" },
]

interface OSConclusaoProps {
  status: keyof typeof statusConfig
  tecnico: string | null
  dataAgendada: string | null
}

export function OSConclusao({ status, tecnico, dataAgendada }: OSConclusaoProps) {
  const [selectedTecnico, setSelectedTecnico] = useState(tecnico || "")
  const [aprovarComHoraExtra, setAprovarComHoraExtra] = useState(false)

  const checklist = [
    { id: 1, text: "Cliente selecionado e itens da OS conferidos.", done: true },
    { id: 2, text: "Tempo total revisado para agendamento automático.", done: true },
    { id: 3, text: "Observações finais registradas.", done: true },
  ]

  return (
    <div className="space-y-6">
      {/* Checklist de Encerramento */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <ListChecks className="h-4 w-4" />
            Conclusão e Agendamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Checklist */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="mb-3 font-semibold text-foreground">Checklist de encerramento</h4>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-muted-foreground">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Data de Início */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Iniciar em
            </label>
            <Input
              type="datetime-local"
              defaultValue="2026-04-24T14:50"
              className="w-full sm:w-auto"
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <Textarea
              placeholder="Observações adicionais sobre a conclusão..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Técnico Responsável */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <User className="h-4 w-4 text-muted-foreground" />
              Técnico responsável
            </label>
            <Select value={selectedTecnico} onValueChange={setSelectedTecnico}>
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Selecione um técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.nome}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status e Tempo Info */}
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Status atual:</span>
              <Badge className={statusConfig[status].color}>{statusConfig[status].label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Fim estimado: tempo total + regras de calendário e disponibilidade.</span>
            </div>
          </div>

          {/* Checkbox Hora Extra */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="aprovarHoraExtra"
              checked={aprovarComHoraExtra}
              onCheckedChange={(checked) => setAprovarComHoraExtra(checked as boolean)}
            />
            <label
              htmlFor="aprovarHoraExtra"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Aprovar com hora extra
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {/* Remarcar Agendamento */}
            <Button className="gap-2 bg-primary hover:bg-primary/90">
              <CalendarCheck className="h-4 w-4" />
              Remarcar agendamento
            </Button>

            {/* Cancelar Agendamento */}
            <Button variant="outline" className="gap-2">
              <CalendarX className="h-4 w-4" />
              Cancelar agendamento
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
            {/* Iniciar Serviço */}
            <Button variant="outline" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Iniciar serviço
            </Button>

            {/* Concluir OS */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  Concluir OS (baixa no estoque)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Concluir Ordem de Serviço</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ao concluir a OS, os produtos utilizados serão baixados do estoque
                    automaticamente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700">
                    Confirmar conclusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {/* Cancelar OS */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive">
                  <XCircle className="h-4 w-4" />
                  Cancelar OS
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar Ordem de Serviço</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja cancelar esta ordem de serviço? Esta ação pode ser
                    revertida posteriormente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
                    Cancelar OS
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
