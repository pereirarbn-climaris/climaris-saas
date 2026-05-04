"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { CalendarHeader } from "@/components/calendar/calendar-header"
import { CalendarGrid } from "@/components/calendar/calendar-grid"

export default function AgendaPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 24)) // 24/04/2026
  const [viewMode, setViewMode] = useState<"day" | "week">("week")

  const goToToday = () => {
    setCurrentDate(new Date(2026, 3, 24))
  }

  const goToPrevious = () => {
    const newDate = new Date(currentDate)
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 7)
    }
    setCurrentDate(newDate)
  }

  const goToNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 7)
    }
    setCurrentDate(newDate)
  }

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/agenda"
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Agenda"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 overflow-auto p-6">
          <CalendarHeader
            currentDate={currentDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onToday={goToToday}
            onPrevious={goToPrevious}
            onNext={goToNext}
            onDateChange={setCurrentDate}
          />

          <CalendarGrid
            currentDate={currentDate}
            viewMode={viewMode}
          />
        </main>
      </div>
    </div>
  )
}
