import Link from "next/link"
import { Wrench, Sparkles, Settings, ArrowRight, Wind } from "lucide-react"

const services = [
  {
    number: "01",
    icon: Wrench,
    title: "Instalação",
    description:
      "Instalação profissional de ar-condicionado com garantia de 12 meses. Soluções personalizadas para residências e empresas, priorizando segurança e eficiência energética.",
    href: "/servicos/instalacao",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Limpeza e Higienização",
    description:
      "Serviço completo de limpeza e higienização para garantir a qualidade do ar e o bom funcionamento do seu equipamento. Ambiente mais saudável para você e sua família.",
    href: "/servicos/limpeza",
  },
  {
    number: "03",
    icon: Settings,
    title: "Manutenção",
    description:
      "Manutenção preventiva e corretiva para prolongar a vida útil do seu ar-condicionado, reduzir o consumo de energia e garantir o funcionamento ideal do equipamento.",
    href: "/servicos/manutencao",
  },
  {
    number: "04",
    icon: Wind,
    title: "Climatizadores",
    description:
      "Especialistas em climatizadores evaporativos residenciais e industriais. Instalação, limpeza e manutenção com economia de até 90% na conta de energia.",
    href: "/servicos/climatizadores",
  },
]

export function Services() {
  return (
    <section id="servicos" className="py-24 md:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-20">
          <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
            Nossos serviços
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground max-w-xl leading-tight">
            Soluções completas em climatização
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-8">
          {services.map((service) => (
            <div
              key={service.number}
              className="group relative bg-card border border-border rounded-2xl p-8 hover:border-primary/30 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-8">
                <span className="text-6xl font-bold text-muted/50 group-hover:text-primary/20 transition-colors">
                  {service.number}
                </span>
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <service.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-card-foreground mb-4">
                {service.title}
              </h3>
              
              <p className="text-muted-foreground leading-relaxed mb-6">
                {service.description}
              </p>

              <Link
                href={service.href}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
              >
                Saiba mais
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
