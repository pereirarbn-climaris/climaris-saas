"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  CalendarClock,
  User,
  Calendar,
  Clock,
  Zap,
  CalendarDays,
  Info,
} from "lucide-react"

const tecnicos = [
  { id: "robson", nome: "Robson Ferreira", status: "disponivel" },
  { id: "carlos", nome: "Carlos Santos", status: "ocupado" },
  { id: "maria", nome: "Maria Oliveira", status: "disponivel" },
]

const horariosDisponiveis = [
  { hora: "08:00", disponivel: true },
  { hora: "09:00", disponivel: true },
  { hora: "10:00", disponivel: false },
  { hora: "11:00", disponivel: true },
  { hora: "14:00", disponivel: true },
  { hora: "15:00", disponivel: true },
  { hora: "16:00", disponivel: false },
  { hora: "17:00", disponivel: true },
]

interface OSPlanejamentoProps {
  tecnicoAtual: string | null
  isEditing?: boolean
}

export function OSPlanejamento({ tecnicoAtual, isEditing = false }: OSPlanejamentoProps) {
  const [selectedDate, setSelectedDate] = useState("2026-04-24")
  const [selectedTecnico, setSelectedTecnico] = useState(tecnicoAtual || "")
  const [permitirHoraExtra, setPermitirHoraExtra] = useState(false)
  const [showHorarios, setShowHorarios] = useState(false)

  return (
    <div className="space-y-6">
      {/* Planejamento Técnico */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Planejamento Técnico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data e Técnico */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Dia para consulta
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <User className="h-4 w-4 text-muted-foreground" />
                Técnico preferencial
              </label>
              <Select value={selectedTecnico} onValueChange={setSelectedTecnico}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um técnico" />
                </SelectTrigger>
                <SelectContent>
                  {tecnicos.map((tecnico) => (
                    <SelectItem key={tecnico.id} value={tecnico.nome}>
                      <div className="flex items-center gap-2">
                        {tecnico.nome}
                        {tecnico.status === "ocupado" && (
                          <Badge variant="outline\" className="text-xs">
                            ocupado
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setShowHorarios(true)}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              Sugerir próximos horários
            </Button>
            <Button variant="outline" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Sugerir divisão em dias
            </Button>
          </div>

          {/* Checkbox Hora Extra */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="horaExtra"
              checked={permitirHoraExtra}
              onCheckedChange={(checked) => setPermitirHoraExtra(checked as boolean)}
            />
            <label
              htmlFor="horaExtra"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Permitir hora extra (fora da janela padrão)
            </label>
          </div>

          {/* Info Text */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Dica: selecione um horário sugerido para preencher automaticamente a etapa de
              conclusão.
            </p>
          </div>

          {/* Horários Sugeridos */}
          {showHorarios && (
            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Horários disponíveis</h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {horariosDisponiveis.map((horario) => (
                  <Button
                    key={horario.hora}
                    variant={horario.disponivel ? "outline" : "ghost"}
                    size="sm"
                    disabled={!horario.disponivel}
                    className={
                      horario.disponivel
                        ? "hover:bg-primary hover:text-primary-foreground"
                        : "opacity-50"
                    }
                  >
                    {horario.hora}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendário Visual (Preview) */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Visualização do Calendário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
            <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              Selecione uma data e clique em &quot;Sugerir próximos horários&quot; para visualizar a
              disponibilidade.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Button for editing */}
      {isEditing && (
        <div className="flex justify-end gap-3">
          <Button variant="outline">Voltar</Button>
          <Button>Confirmar agendamento</Button>
        </div>
      )}
    </div>
  )
}
