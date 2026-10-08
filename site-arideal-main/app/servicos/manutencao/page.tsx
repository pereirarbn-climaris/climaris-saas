import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Button } from "@/components/ui/button"
import { 
  ArrowRight, 
  Phone, 
  CheckCircle2, 
  Settings, 
  Shield, 
  Zap, 
  ThermometerSnowflake,
  Wrench,
  AlertTriangle,
  Clock,
  TrendingDown,
  Volume2,
  Droplets,
  CircleDot,
  Calendar,
  BadgeCheck
} from "lucide-react"

export const metadata: Metadata = {
  title: "Manutenção de Ar-Condicionado em Araraquara | Ar Ideal Climatização",
  description:
    "Manutenção preventiva e corretiva de ar-condicionado em Araraquara. Prolongue a vida útil do seu equipamento, reduza o consumo de energia e evite reparos caros.",
  keywords:
    "manutenção ar condicionado, manutenção preventiva, manutenção corretiva, ar condicionado Araraquara, reparo ar condicionado",
}

const benefits = [
  {
    icon: Zap,
    title: "Economia de Energia",
    description: "Equipamentos bem mantidos consomem até 30% menos energia elétrica.",
  },
  {
    icon: Clock,
    title: "Maior Durabilidade",
    description: "A manutenção regular pode dobrar a vida útil do seu ar-condicionado.",
  },
  {
    icon: ThermometerSnowflake,
    title: "Desempenho Ideal",
    description: "Garanta que seu equipamento refrigere com máxima eficiência.",
  },
  {
    icon: Shield,
    title: "Prevenção de Problemas",
    description: "Evite reparos caros identificando problemas antes que se agravem.",
  },
]

const warningSignals = [
  {
    icon: TrendingDown,
    title: "Refrigeração Fraca",
    description: "O ar-condicionado não está gelando como antes",
  },
  {
    icon: Volume2,
    title: "Ruídos Estranhos",
    description: "Barulhos incomuns durante o funcionamento",
  },
  {
    icon: Droplets,
    title: "Vazamento de Água",
    description: "Gotejamento ou acúmulo de água no aparelho",
  },
  {
    icon: AlertTriangle,
    title: "Mau Cheiro",
    description: "Odores desagradáveis saindo do ar-condicionado",
  },
  {
    icon: Zap,
    title: "Conta de Luz Alta",
    description: "Aumento inexplicável no consumo de energia",
  },
  {
    icon: CircleDot,
    title: "Liga e Desliga",
    description: "Equipamento desligando sozinho frequentemente",
  },
]

const maintenanceTypes = [
  {
    title: "Manutenção Preventiva",
    description: "Realizada periodicamente para evitar problemas futuros e manter o equipamento funcionando perfeitamente.",
    items: [
      "Verificação completa do sistema",
      "Limpeza de filtros e componentes",
      "Checagem de gás refrigerante",
      "Inspeção elétrica",
      "Lubrificação de peças móveis",
      "Teste de funcionamento",
    ],
    recommended: true,
  },
  {
    title: "Manutenção Corretiva",
    description: "Quando o equipamento apresenta defeitos ou parou de funcionar e precisa de reparo imediato.",
    items: [
      "Diagnóstico do problema",
      "Reparo de componentes",
      "Troca de peças danificadas",
      "Recarga de gás refrigerante",
      "Correção de vazamentos",
      "Substituição de compressor",
    ],
    recommended: false,
  },
]

const processSteps = [
  {
    number: "01",
    title: "Diagnóstico",
    description: "Avaliação completa do equipamento para identificar problemas e necessidades.",
  },
  {
    number: "02",
    title: "Orçamento",
    description: "Apresentação detalhada dos serviços necessários e custos envolvidos.",
  },
  {
    number: "03",
    title: "Execução",
    description: "Realização dos serviços com técnicos qualificados e peças de qualidade.",
  },
  {
    number: "04",
    title: "Garantia",
    description: "Entrega com teste de funcionamento e garantia de 12 meses no serviço.",
  },
]

export default function ManutencaoPage() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-2 mb-6">
              <Settings className="h-4 w-4 text-cyan-400" />
              <span className="text-cyan-400 text-sm font-medium">
                Manutenção Especializada
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Manutenção de
              <br />
              <span className="text-cyan-400">Ar-Condicionado</span>
            </h1>

            <p className="text-lg md:text-xl text-white/70 mb-10 leading-relaxed max-w-2xl">
              Manutenção preventiva e corretiva para prolongar a vida útil do seu
              equipamento, garantir eficiência máxima e evitar gastos com reparos
              emergenciais.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                asChild
                size="lg"
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710?text=Olá! Gostaria de solicitar um orçamento para manutenção de ar-condicionado."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
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
                <a href="tel:+5516997369710">Ligar Agora</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Por que fazer manutenção?
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Benefícios da Manutenção Regular
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Warning Signals Section */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Fique atento
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Sinais de que seu Ar Precisa de Manutenção
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Se você notar algum desses sinais, é hora de chamar um técnico para
              avaliar seu ar-condicionado.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warningSignals.map((signal, index) => (
              <div
                key={index}
                className="flex items-start gap-4 bg-card border border-border rounded-xl p-5 hover:border-amber-500/30 transition-colors"
              >
                <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <signal.icon className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground mb-1">
                    {signal.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {signal.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Maintenance Types Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Nossos serviços
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Tipos de Manutenção
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {maintenanceTypes.map((type, index) => (
              <div
                key={index}
                className={`relative bg-card border rounded-2xl p-8 ${
                  type.recommended
                    ? "border-primary shadow-lg"
                    : "border-border"
                }`}
              >
                {type.recommended && (
                  <div className="absolute -top-3 left-6 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <BadgeCheck className="h-3 w-3" />
                    Recomendado
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  {type.recommended ? (
                    <Calendar className="h-6 w-6 text-primary" />
                  ) : (
                    <Wrench className="h-6 w-6 text-muted-foreground" />
                  )}
                  <h3 className="text-xl font-bold text-card-foreground">
                    {type.title}
                  </h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {type.description}
                </p>
                <ul className="space-y-3">
                  {type.items.map((item, itemIndex) => (
                    <li
                      key={itemIndex}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Como funciona
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Nosso Processo de Atendimento
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {processSteps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="relative mb-6">
                  <span className="text-6xl font-bold text-primary/20">
                    {step.number}
                  </span>
                  {index < processSteps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-border" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-slate-900 to-cyan-900">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl md:text-5xl font-bold text-white mb-2">
                12
              </p>
              <p className="text-white/60 text-sm">Meses de Garantia</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold text-cyan-400 mb-2">
                30%
              </p>
              <p className="text-white/60 text-sm">Economia de Energia</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold text-white mb-2">
                2x
              </p>
              <p className="text-white/60 text-sm">Mais Vida Útil</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold text-cyan-400 mb-2">
                500+
              </p>
              <p className="text-white/60 text-sm">Clientes Atendidos</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              Não espere quebrar para consertar
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              A manutenção preventiva é mais barata que o reparo. Agende agora
              uma visita técnica e mantenha seu ar-condicionado funcionando
              perfeitamente o ano todo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710?text=Olá! Gostaria de agendar uma manutenção do meu ar-condicionado."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Phone className="h-5 w-5" />
                  Agendar Manutenção
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="font-semibold px-8 py-6 text-base rounded-full"
              >
                <Link href="/">Voltar para Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  )
}
