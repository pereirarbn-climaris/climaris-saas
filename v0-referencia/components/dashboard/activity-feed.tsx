import { Clock, CheckCircle2, AlertCircle, Calendar, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface Activity {
  id: string
  type: "completed" | "scheduled" | "alert" | "client"
  title: string
  description: string
  time: string
}

const activities: Activity[] = [
  {
    id: "1",
    type: "completed",
    title: "OS #1247 concluída",
    description: "Instalação de ar condicionado - Cliente João Silva",
    time: "Há 2 horas",
  },
  {
    id: "2",
    type: "scheduled",
    title: "Novo agendamento",
    description: "Manutenção preventiva - Empresa ABC Ltda",
    time: "Há 3 horas",
  },
  {
    id: "3",
    type: "client",
    title: "Novo cliente cadastrado",
    description: "Maria Oliveira - Residencial",
    time: "Há 5 horas",
  },
  {
    id: "4",
    type: "alert",
    title: "Estoque baixo",
    description: "Filtro HEPA - Apenas 3 unidades restantes",
    time: "Há 1 dia",
  },
]

const typeStyles = {
  completed: {
    icon: CheckCircle2,
    bg: "bg-emerald-100",
    color: "text-emerald-600",
  },
  scheduled: {
    icon: Calendar,
    bg: "bg-primary/10",
    color: "text-primary",
  },
  alert: {
    icon: AlertCircle,
    bg: "bg-amber-100",
    color: "text-amber-600",
  },
  client: {
    icon: User,
    bg: "bg-sky-100",
    color: "text-sky-600",
  },
}

export function ActivityFeed() {
  if (activities.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhum evento ainda</p>
        <p className="text-xs text-muted-foreground">
          O histórico aparecerá aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => {
        const style = typeStyles[activity.type]
        const Icon = style.icon

        return (
          <div
            key={activity.id}
            className="group flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                style.bg
              )}
            >
              <Icon className={cn("h-4 w-4", style.color)} />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground leading-tight">
                {activity.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {activity.description}
              </p>
              <p className="text-xs text-muted-foreground/70">{activity.time}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
