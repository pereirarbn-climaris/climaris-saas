"use client"

import { cn } from "@/lib/utils"
import { FileText, Package, CalendarClock, CheckCircle2 } from "lucide-react"

interface Tab {
  id: string
  label: string
  icon: React.ElementType
}

const tabs: Tab[] = [
  { id: "dados-iniciais", label: "Dados iniciais", icon: FileText },
  { id: "servicos-produtos", label: "Serviços e produtos", icon: Package },
  { id: "planejamento", label: "Planejamento", icon: CalendarClock },
  { id: "conclusao", label: "Conclusão", icon: CheckCircle2 },
]

interface OSTabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isNew?: boolean
}

export function OSTabNavigation({ activeTab, onTabChange, isNew = false }: OSTabNavigationProps) {
  const availableTabs = isNew ? tabs.slice(0, 3) : tabs

  return (
    <div className="border-b border-border">
      <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
        {availableTabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "group relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
