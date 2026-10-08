import { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Snowflake, ShieldCheck, Clock, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BTUCalculator } from "@/components/btu-calculator"
import { Footer } from "@/components/footer"
import { WhatsAppButton } from "@/components/whatsapp-button"

export const metadata: Metadata = {
  title: "Simulador de BTU - Calcule a Capacidade Ideal | Ar Ideal Climatização",
  description: "Descubra qual a capacidade térmica ideal para o seu ambiente. Simulador gratuito de BTU para ar-condicionado em Araraquara.",
  keywords: "calculadora BTU, simulador ar condicionado, capacidade térmica, ar condicionado Araraquara, dimensionamento ar condicionado",
}

export default function SimuladorPage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-slate-900">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link href="/" className="relative h-10 w-40">
              <Image
                src="/images/logo.png"
                alt="Ar Ideal Climatizacao"
                fill
                className="object-contain object-left"
                priority
              />
            </Link>
            <Button
              asChild
              variant="ghost"
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              <Link href="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-slate-900 to-slate-800 py-16 md:py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/20 text-cyan-400 text-sm font-medium mb-6">
              <Snowflake className="h-4 w-4" />
              Simulador Gratuito
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6 text-balance">
              Descubra a capacidade ideal para o seu ambiente
            </h1>
            <p className="text-lg text-white/60 leading-relaxed">
              Utilize nosso simulador para calcular quantos BTUs você precisa. 
              Basta informar as características do ambiente e receber uma recomendação personalizada.
            </p>
          </div>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <BTUCalculator />
        </div>
      </section>

      {/* Info Section */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
              Como funciona o cálculo de BTU?
            </h2>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="leading-relaxed">
                O BTU (British Thermal Unit) é a unidade de medida utilizada para definir 
                a capacidade de refrigeração de um ar-condicionado. O cálculo leva em 
                consideração diversos fatores que influenciam a temperatura do ambiente.
              </p>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-card p-6 rounded-xl border border-border">
                  <h3 className="font-semibold text-foreground mb-2">Área do Ambiente</h3>
                  <p className="text-sm">
                    O tamanho do espaço é o principal fator. Ambientes maiores precisam 
                    de mais capacidade de refrigeração.
                  </p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-border">
                  <h3 className="font-semibold text-foreground mb-2">Incidência Solar</h3>
                  <p className="text-sm">
                    Ambientes com muita exposição ao sol aquecem mais e precisam de 
                    maior capacidade térmica.
                  </p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-border">
                  <h3 className="font-semibold text-foreground mb-2">Quantidade de Pessoas</h3>
                  <p className="text-sm">
                    Cada pessoa libera calor corporal, aumentando a necessidade 
                    de refrigeração do ambiente.
                  </p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-border">
                  <h3 className="font-semibold text-foreground mb-2">Equipamentos</h3>
                  <p className="text-sm">
                    Computadores, TVs e outros eletrônicos geram calor e devem 
                    ser considerados no cálculo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-6">
              Precisa de ajuda com o dimensionamento?
            </h2>
            <p className="text-primary-foreground/80 mb-8 leading-relaxed">
              Nossa equipe técnica pode fazer uma avaliação presencial para garantir 
              o dimensionamento correto do seu ar-condicionado.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-white text-primary hover:bg-white/90 font-semibold px-8 py-6 rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Phone className="h-5 w-5" />
                  Falar com Especialista
                </a>
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-12 pt-12 border-t border-primary-foreground/20">
              <div className="flex flex-col items-center gap-2">
                <ShieldCheck className="h-8 w-8 text-primary-foreground" />
                <span className="text-sm text-primary-foreground/80">Garantia de 12 meses</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Clock className="h-8 w-8 text-primary-foreground" />
                <span className="text-sm text-primary-foreground/80">Atendimento Rápido</span>
              </div>
              <div className="hidden md:flex flex-col items-center gap-2">
                <Snowflake className="h-8 w-8 text-primary-foreground" />
                <span className="text-sm text-primary-foreground/80">Climatização Profissional</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  )
}
