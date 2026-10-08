import { Check, ChevronRight, Users, Package, Wrench, Calendar, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface Step {
  id: string
  title: string
  description: string
  icon: typeof Users
  completed: boolean
  href: string
}

const steps: Step[] = [
  {
    id: "1",
    title: "Cadastre clientes e produtos",
    description: "Prepare a operação diária",
    icon: Users,
    completed: false,
    href: "/clientes",
  },
  {
    id: "2",
    title: "Cadastre serviços",
    description: "Monte ordens de serviço",
    icon: Wrench,
    completed: false,
    href: "/servicos",
  },
  {
    id: "3",
    title: "Configure feriados e janelas",
    description: "Ajuste o calendário dos técnicos",
    icon: Calendar,
    completed: false,
    href: "/agenda",
  },
  {
    id: "4",
    title: "Aprove uma OS",
    description: "Gere o agendamento automático",
    icon: FileCheck,
    completed: false,
    href: "/ordens",
  },
]

export function OnboardingSteps() {
  const completedCount = steps.filter((s) => s.completed).length
  const progress = (completedCount / steps.length) * 100

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Progresso</span>
          <span className="text-muted-foreground">
            {completedCount} de {steps.length} concluídos
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon

          return (
            <button
              key={step.id}
              className={cn(
                "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200",
                step.completed
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                  step.completed
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                )}
              >
                {step.completed ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.completed ? "text-emerald-700" : "text-foreground"
                  )}
                >
                  {step.title}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    step.completed ? "text-emerald-600/70" : "text-muted-foreground"
                  )}
                >
                  {step.description}
                </p>
              </div>
              {!step.completed && (
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
