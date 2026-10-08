import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowRight, Phone } from "lucide-react"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-bg.png"
          alt="Ar condicionado moderno em sala de estar"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 lg:px-8 pt-32 pb-20">
        <div className="max-w-4xl">
          <p className="text-sm md:text-base font-medium tracking-widest uppercase text-cyan-400 mb-6">
            Climatização Profissional em Araraquara
          </p>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight">
            Conforto térmico
            <br />
            <span className="text-cyan-400">para seu ambiente</span>
          </h1>
          
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-12 leading-relaxed">
            Instalação, limpeza e manutenção de ar-condicionado com garantia de 12 meses. 
            Soluções personalizadas para residências e empresas.
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
              <a href="#servicos">Conhecer Serviços</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  )
}
