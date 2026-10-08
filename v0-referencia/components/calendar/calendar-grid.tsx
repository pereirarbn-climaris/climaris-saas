"use client"

import { useState } from "react"
import { format, isSameDay, addDays, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CalendarEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  date: Date
  type: "os" | "feriado" | "sem_expediente"
  osNumber?: string
  clientName?: string
  phone?: string
  whatsapp?: string
  address?: string
}

interface CalendarGridProps {
  currentDate: Date
  viewMode: "day" | "week"
}

// Mock events data
const mockEvents: CalendarEvent[] = [
  {
    id: "1",
    title: "OS #14",
    startTime: "10:10",
    endTime: "14:10",
    date: new Date(2026, 3, 20),
    type: "os",
    osNumber: "#14",
    clientName: "Robson Pereira",
    phone: "(16)",
    whatsapp: "(11) 98505-1385",
    address: "Rua Bragança, 413, Vila Linda, Sant...",
  },
  {
    id: "2",
    title: "Tiradentes",
    startTime: "00:00",
    endTime: "23:59",
    date: new Date(2026, 3, 21),
    type: "feriado",
  },
  {
    id: "3",
    title: "OS #13",
    startTime: "08:00",
    endTime: "12:00",
    date: new Date(2026, 3, 22),
    type: "os",
    osNumber: "#13",
    clientName: "GUERINO & ALMEIDA TRANS...",
    address: "Rua Santa Yolanda, 14, Vila Santa A...",
  },
  {
    id: "4",
    title: "OS #34",
    startTime: "13:05",
    endTime: "13:45",
    date: new Date(2026, 3, 24),
    type: "os",
    osNumber: "#34",
  },
  {
    id: "5",
    title: "Dia sem expediente",
    startTime: "00:00",
    endTime: "23:59",
    date: new Date(2026, 3, 26),
    type: "sem_expediente",
  },
]

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00"
]

export function CalendarGrid({ currentDate, viewMode }: CalendarGridProps) {
  const [hoveredSlot, setHoveredSlot] = useState<{ day: number; time: string } | null>(null)
  const today = new Date(2026, 3, 24)

  // Get days for current week
  const getWeekDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }

  const weekDays = viewMode === "week" ? getWeekDays() : [currentDate]

  const getEventsForDay = (date: Date) => {
    return mockEvents.filter(event => isSameDay(event.date, date))
  }

  const getEventStyle = (event: CalendarEvent) => {
    switch (event.type) {
      case "feriado":
        return "bg-amber-50 border-l-4 border-l-amber-400 text-amber-900"
      case "sem_expediente":
        return "bg-rose-50 border-l-4 border-l-rose-400 text-rose-900"
      default:
        return "bg-sky-50 border-l-4 border-l-sky-400 text-sky-900"
    }
  }

  const getEventPosition = (event: CalendarEvent) => {
    if (event.type === "feriado" || event.type === "sem_expediente") {
      return { top: 0, height: "100%" }
    }

    const [startHour, startMin] = event.startTime.split(":").map(Number)
    const [endHour, endMin] = event.endTime.split(":").map(Number)

    const startOffset = ((startHour - 8) * 60 + startMin) / 60
    const duration = ((endHour - startHour) * 60 + (endMin - startMin)) / 60

    return {
      top: `${startOffset * 64}px`,
      height: `${duration * 64}px`,
    }
  }

  const isToday = (date: Date) => isSameDay(date, today)

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Header with days */}
        <div className={cn(
          "grid border-b border-border bg-muted/30",
          viewMode === "week" ? "grid-cols-[60px_repeat(7,1fr)]" : "grid-cols-[60px_1fr]"
        )}>
          <div className="border-r border-border p-3" />
          {weekDays.map((day, index) => (
            <div
              key={index}
              className={cn(
                "border-r border-border p-3 text-center last:border-r-0",
                isToday(day) && "bg-primary/5"
              )}
            >
              <div className={cn(
                "text-sm font-medium",
                isToday(day) ? "text-primary" : "text-foreground"
              )}>
                {format(day, "EEE.", { locale: ptBR })} {format(day, "dd/MM")}
              </div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className={cn(
          "grid",
          viewMode === "week" ? "grid-cols-[60px_repeat(7,1fr)]" : "grid-cols-[60px_1fr]"
        )}>
          {/* Time column */}
          <div className="border-r border-border">
            {timeSlots.map((time) => (
              <div
                key={time}
                className="flex h-16 items-start justify-end border-b border-border pr-2 pt-1 text-xs text-muted-foreground"
              >
                {time}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIndex) => {
            const dayEvents = getEventsForDay(day)
            const fullDayEvent = dayEvents.find(e => e.type === "feriado" || e.type === "sem_expediente")

            return (
              <div
                key={dayIndex}
                className={cn(
                  "relative border-r border-border last:border-r-0",
                  isToday(day) && "bg-cyan-50/50"
                )}
              >
                {/* Full day event (feriado/sem expediente) */}
                {fullDayEvent && (
                  <div
                    className={cn(
                      "absolute inset-x-1 top-1 z-10 rounded-md p-2",
                      getEventStyle(fullDayEvent)
                    )}
                    style={{ bottom: "4px" }}
                  >
                    <div className="text-xs font-semibold">
                      {fullDayEvent.type === "feriado" ? "Feriado" : "Sem expediente"}
                    </div>
                    <div className="text-xs opacity-80">{fullDayEvent.title}</div>
                  </div>
                )}

                {/* Time slots */}
                {timeSlots.map((time, timeIndex) => (
                  <Tooltip key={time}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "h-16 border-b border-border transition-colors",
                          !fullDayEvent && "hover:bg-primary/5 cursor-pointer"
                        )}
                        onMouseEnter={() => setHoveredSlot({ day: dayIndex, time })}
                        onMouseLeave={() => setHoveredSlot(null)}
                      />
                    </TooltipTrigger>
                    {!fullDayEvent && hoveredSlot?.day === dayIndex && hoveredSlot?.time === time && (
                      <TooltipContent side="top" className="bg-foreground text-background">
                        <p>Clique para abrir nova OS neste dia/horário</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}

                {/* OS Events */}
                {dayEvents
                  .filter(e => e.type === "os")
                  .map((event) => {
                    const position = getEventPosition(event)
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "absolute inset-x-1 z-20 cursor-pointer overflow-hidden rounded-md p-2 transition-shadow hover:shadow-md",
                          getEventStyle(event)
                        )}
                        style={{
                          top: position.top,
                          height: position.height,
                        }}
                      >
                        <div className="space-y-0.5 text-xs">
                          <div className="font-semibold">
                            {event.startTime} - {event.endTime}
                          </div>
                          <div className="font-medium">{event.osNumber}</div>
                          {event.clientName && (
                            <div className="text-[10px] opacity-80">
                              Cliente: {event.clientName}
                            </div>
                          )}
                          {event.phone && (
                            <div className="text-[10px] opacity-80">
                              Tel: {event.phone}
                            </div>
                          )}
                          {event.whatsapp && (
                            <div className="text-[10px] opacity-80">
                              WhatsApp: {event.whatsapp}
                            </div>
                          )}
                          {event.address && (
                            <div className="text-[10px] opacity-80">
                              Endereço: {event.address}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}
