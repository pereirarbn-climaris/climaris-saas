import { Check, Shield, Award, Users } from "lucide-react"

const stats = [
  { icon: Shield, value: "12", label: "Meses de Garantia" },
  { icon: Award, value: "100%", label: "Satisfação" },
  { icon: Users, value: "500+", label: "Clientes Atendidos" },
]

const benefits = [
  "Instalamos qualquer marca de ar-condicionado",
  "Profissionais qualificados e experientes",
  "Atendimento rápido e personalizado",
  "Orçamento sem compromisso",
  "Serviços para residências e empresas",
  "Suporte pós-serviço incluso",
]

export function About() {
  return (
    <section id="sobre" className="py-24 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Sobre nós
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 leading-tight">
              Por que escolher a Ar Ideal?
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Somos especializados em serviços de climatização em Araraquara, 
              oferecendo soluções completas com qualidade e compromisso. Nossa 
              equipe é composta por profissionais qualificados e dedicados ao 
              conforto do seu ambiente.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-sm text-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content - Stats */}
          <div className="bg-slate-900 rounded-3xl p-10 lg:p-14">
            <div className="grid gap-10">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <stat.icon className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      {stat.value}
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
