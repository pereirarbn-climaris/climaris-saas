"use client"

import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface CalendarHeaderProps {
  currentDate: Date
  viewMode: "day" | "week"
  onViewModeChange: (mode: "day" | "week") => void
  onToday: () => void
  onPrevious: () => void
  onNext: () => void
  onDateChange: (date: Date) => void
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onToday,
  onPrevious,
  onNext,
  onDateChange,
}: CalendarHeaderProps) {
  // Calculate week range
  const getWeekRange = (date: Date) => {
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date)
    monday.setDate(diff)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { monday, sunday }
  }

  const { monday, sunday } = getWeekRange(currentDate)

  const formatDateRange = () => {
    if (viewMode === "day") {
      return format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
    }
    return `${format(monday, "EEE., dd/MM", { locale: ptBR })} - ${format(sunday, "EEE., dd/MM", { locale: ptBR })}`
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-sky-100 ring-1 ring-sky-300" />
          <span className="text-sm text-muted-foreground">OS / agendamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" />
          <span className="text-sm text-muted-foreground">Feriado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-rose-100 ring-1 ring-rose-300" />
          <span className="text-sm text-muted-foreground">Sem expediente</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="font-medium"
          >
            Hoje
          </Button>

          <div className="flex rounded-lg border border-border bg-muted/30 p-1">
            <Button
              variant={viewMode === "day" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("day")}
              className={cn(
                "h-8 px-4 text-sm font-medium",
                viewMode === "day" && "bg-white shadow-sm"
              )}
            >
              Dia
            </Button>
            <Button
              variant={viewMode === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("week")}
              className={cn(
                "h-8 px-4 text-sm font-medium",
                viewMode === "week" && "bg-white shadow-sm"
              )}
            >
              Semana
            </Button>
          </div>

          <div className="flex items-center rounded-lg border border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              className="h-8 w-8 rounded-r-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              className="h-8 w-8 rounded-l-none border-l"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">TÉCNICO</span>
            <Select defaultValue="all">
              <SelectTrigger className="h-9 w-[180px] border-border">
                <SelectValue placeholder="Selecionar técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os técnicos</SelectItem>
                <SelectItem value="1">João Silva</SelectItem>
                <SelectItem value="2">Carlos Oliveira</SelectItem>
                <SelectItem value="3">Pedro Santos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{formatDateRange()}</span>
            <span className="font-semibold">{format(currentDate, "dd/MM/yyyy")}</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => date && onDateChange(date)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}
