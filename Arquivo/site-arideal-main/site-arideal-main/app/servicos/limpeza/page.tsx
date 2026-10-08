import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Button } from "@/components/ui/button"
import { Check, ArrowRight, Shield, Clock, Award, Sparkles, Wind, Droplets, Heart, Phone } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Limpeza e Higienização de Ar-Condicionado em Araraquara | Ar Ideal Climatização",
  description: "Serviço completo de limpeza e higienização de ar-condicionado em Araraquara. Elimine fungos, bactérias e ácaros. Ambiente mais saudável para sua família.",
  keywords: "limpeza ar condicionado, higienização ar condicionado, limpeza ar condicionado Araraquara, manutenção preventiva",
}

const features = [
  {
    icon: Wind,
    title: "Ar Mais Puro",
    description: "Eliminamos poeira, ácaros e partículas que prejudicam a qualidade do ar que você respira.",
  },
  {
    icon: Droplets,
    title: "Eliminação de Fungos",
    description: "Higienização completa que remove fungos, bactérias e mofo do seu equipamento.",
  },
  {
    icon: Heart,
    title: "Saúde em Primeiro Lugar",
    description: "Ambiente mais saudável para você e sua família, ideal para alérgicos e asmáticos.",
  },
  {
    icon: Sparkles,
    title: "Eficiência Recuperada",
    description: "Equipamento limpo consome menos energia e refrigera melhor o ambiente.",
  },
]

const steps = [
  {
    number: "01",
    title: "Inspeção Inicial",
    description: "Avaliamos as condições do equipamento e identificamos os pontos que necessitam atenção.",
  },
  {
    number: "02",
    title: "Desmontagem Cuidadosa",
    description: "Desmontamos os componentes com cuidado para uma limpeza completa e profunda.",
  },
  {
    number: "03",
    title: "Limpeza Profunda",
    description: "Limpamos filtros, serpentina, turbina, bandeja e todos os componentes internos.",
  },
  {
    number: "04",
    title: "Higienização",
    description: "Aplicamos produtos bactericidas e fungicidas para eliminar microrganismos nocivos.",
  },
]

const benefits = [
  "Eliminação de mau cheiro",
  "Redução de alergias e problemas respiratórios",
  "Menor consumo de energia",
  "Maior vida útil do equipamento",
  "Ar mais fresco e saudável",
  "Prevenção de doenças respiratórias",
]

const symptoms = [
  "Mau cheiro ao ligar o ar-condicionado",
  "Ruídos estranhos durante o funcionamento",
  "Ar saindo fraco ou com pouco frio",
  "Gotejamento de água",
  "Aumento no consumo de energia",
  "Crises alérgicas frequentes em casa",
]

export default function LimpezaPage() {
  return (
    <main className="min-h-screen">
      <Header />
      
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-slate-900">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-slate-900 to-slate-900" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 lg:px-8 pt-32 pb-20">
          <div className="max-w-4xl">
            <p className="text-sm md:text-base font-medium tracking-widest uppercase text-cyan-400 mb-6">
              Serviço de Limpeza e Higienização
            </p>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight">
              Limpeza e
              <br />
              <span className="text-cyan-400">Higienização</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-12 leading-relaxed">
              Serviço completo de limpeza e higienização de ar-condicionado. 
              Elimine fungos, bactérias e ácaros. Respire um ar mais puro e saudável.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                asChild
                size="lg"
                className="bg-white text-slate-900 hover:bg-white/90 font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3"
                >
                  <Phone className="h-5 w-5" />
                  Solicitar Orçamento
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 font-semibold px-8 py-6 text-base rounded-full bg-transparent"
              >
                <a href="#como-funciona">Como Funciona</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 md:py-32 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Benefícios da Limpeza
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground max-w-2xl mx-auto leading-tight">
              Ar mais puro para você e sua família
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-card-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signs Section */}
      <section className="py-24 md:py-32 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
                Sinais de alerta
              </p>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 leading-tight">
                Quando fazer a limpeza do ar-condicionado?
              </h2>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                Seu ar-condicionado precisa de limpeza quando apresenta algum 
                destes sinais. Não espere o problema piorar - agende uma 
                higienização preventiva.
              </p>

              <div className="grid gap-4">
                {symptoms.map((symptom, index) => (
                  <div key={index} className="flex items-center gap-3 bg-card border border-border rounded-xl p-4">
                    <div className="w-6 h-6 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 bg-destructive rounded-full" />
                    </div>
                    <span className="text-sm text-foreground">{symptom}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-10 lg:p-14">
              <h3 className="text-2xl font-bold text-white mb-8">
                Recomendação de limpeza
              </h3>
              <div className="grid gap-6">
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="text-3xl font-bold text-cyan-400 mb-2">
                    A cada 3 meses
                  </div>
                  <div className="text-white/60 text-sm">
                    Para ambientes com uso frequente, fumantes ou animais de estimação
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="text-3xl font-bold text-cyan-400 mb-2">
                    A cada 6 meses
                  </div>
                  <div className="text-white/60 text-sm">
                    Para uso residencial moderado em ambientes limpos
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="text-3xl font-bold text-cyan-400 mb-2">
                    A cada 12 meses
                  </div>
                  <div className="text-white/60 text-sm">
                    Para equipamentos com uso esporádico ou sazonal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="como-funciona" className="py-24 md:py-32 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Processo de limpeza
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground max-w-2xl mx-auto leading-tight">
              Como funciona nossa higienização
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="bg-card border border-border rounded-2xl p-8">
                  <span className="text-6xl font-bold text-muted/30 mb-4 block">
                    {step.number}
                  </span>
                  <h3 className="text-lg font-bold text-card-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 md:py-32 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 bg-slate-900 rounded-3xl p-10 lg:p-14">
              <div className="grid gap-8">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Shield className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      99%
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Eliminação de Bactérias
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Clock className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      2h
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Tempo Médio de Serviço
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Award className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      30%
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Economia de Energia
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
                Resultados comprovados
              </p>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 leading-tight">
                Vantagens da higienização profissional
              </h2>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                A limpeza e higienização regular do seu ar-condicionado traz 
                benefícios imediatos para sua saúde, conforto e economia.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-10">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>

              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3"
                >
                  Agendar Limpeza
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 md:py-32 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Respire um ar
              <br />
              <span className="text-cyan-400">mais saudável</span>
            </h2>
            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-xl mx-auto">
              Agende agora a limpeza e higienização do seu ar-condicionado. 
              Orçamento sem compromisso para toda região de Araraquara.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-white text-slate-900 hover:bg-white/90 font-semibold px-10 py-6 text-base rounded-full"
            >
              <a
                href="https://wa.me/5516997369710"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3"
              >
                Falar pelo WhatsApp
                <ArrowRight className="h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  )
}
