import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Button } from "@/components/ui/button"
import { Check, ArrowRight, Shield, Clock, Award, Wrench, ThermometerSnowflake, Zap, Phone } from "lucide-react"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Instalação de Ar-Condicionado em Araraquara | Ar Ideal Climatização",
  description: "Instalação profissional de ar-condicionado em Araraquara com garantia de 12 meses. Atendemos residências e empresas com qualidade e segurança.",
  keywords: "instalação ar condicionado, instalação ar condicionado Araraquara, instalar ar condicionado, técnico ar condicionado",
}

const features = [
  {
    icon: Shield,
    title: "Garantia de 12 Meses",
    description: "Todos os nossos serviços de instalação possuem garantia completa de 12 meses.",
  },
  {
    icon: Wrench,
    title: "Profissionais Qualificados",
    description: "Equipe técnica especializada e com anos de experiência no mercado.",
  },
  {
    icon: ThermometerSnowflake,
    title: "Todas as Marcas",
    description: "Instalamos ar-condicionado de qualquer marca e modelo disponível no mercado.",
  },
  {
    icon: Zap,
    title: "Eficiência Energética",
    description: "Instalação seguindo as melhores práticas para máxima eficiência energética.",
  },
]

const steps = [
  {
    number: "01",
    title: "Avaliação Técnica",
    description: "Analisamos o ambiente para definir a melhor posição e capacidade do equipamento.",
  },
  {
    number: "02",
    title: "Orçamento Detalhado",
    description: "Apresentamos um orçamento completo sem compromisso e com todos os detalhes.",
  },
  {
    number: "03",
    title: "Instalação Profissional",
    description: "Realizamos a instalação com materiais de qualidade e seguindo normas técnicas.",
  },
  {
    number: "04",
    title: "Testes e Validação",
    description: "Testamos todo o sistema para garantir o funcionamento perfeito do equipamento.",
  },
]

const benefits = [
  "Instalação residencial e comercial",
  "Split, Multi-split, Cassete e Piso Teto",
  "Materiais de primeira qualidade",
  "Acabamento impecável",
  "Atendimento rápido e pontual",
  "Suporte pós-instalação",
]

export default function InstalacaoPage() {
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
              Serviço de Instalação
            </p>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight">
              Instalação de
              <br />
              <span className="text-cyan-400">Ar-Condicionado</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-12 leading-relaxed">
              Instalação profissional com garantia de 12 meses. Atendemos residências 
              e empresas em Araraquara e região com qualidade e segurança.
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
              Por que nos escolher
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground max-w-2xl mx-auto leading-tight">
              Qualidade e confiança em cada instalação
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

      {/* How it Works Section */}
      <section id="como-funciona" className="py-24 md:py-32 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Processo de instalação
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground max-w-2xl mx-auto leading-tight">
              Como funciona nossa instalação
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
      <section className="py-24 md:py-32 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
                Nossos diferenciais
              </p>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 leading-tight">
                O que está incluso na instalação
              </h2>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                Oferecemos um serviço completo de instalação de ar-condicionado, 
                incluindo avaliação técnica, materiais de qualidade e garantia 
                de 12 meses em todo o serviço.
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
                  Solicitar Orçamento
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
            </div>

            <div className="bg-slate-900 rounded-3xl p-10 lg:p-14">
              <div className="grid gap-8">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Shield className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      12
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Meses de Garantia
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Clock className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      24h
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Resposta ao Orçamento
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Award className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-4xl md:text-5xl font-bold text-white mb-1">
                      100%
                    </div>
                    <div className="text-white/60 text-sm font-medium tracking-wide">
                      Clientes Satisfeitos
                    </div>
                  </div>
                </div>
              </div>
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
              Pronto para instalar seu
              <br />
              <span className="text-cyan-400">ar-condicionado?</span>
            </h2>
            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-xl mx-auto">
              Entre em contato agora mesmo e solicite um orçamento sem compromisso. 
              Atendemos toda a região de Araraquara.
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
