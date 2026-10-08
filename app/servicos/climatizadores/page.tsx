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
  Building2,
  Home,
  Shield,
  Zap,
  Wind,
  Wrench,
  Sparkles,
  Clock,
  Thermometer,
  Factory,
  Users,
  Droplets,
  BadgeCheck,
  AlertTriangle,
  Calendar,
  Gauge,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Climatizadores Residenciais e Industriais | Ar Ideal Climatização",
  description:
    "Especialistas em climatizadores evaporativos residenciais e industriais em Araraquara. Serviços de instalação, limpeza e manutenção com garantia e atendimento profissional.",
  keywords:
    "climatizador evaporativo, climatizador industrial, climatizador residencial, limpeza climatizador, manutenção climatizador, Araraquara",
}

const climatizadorTypes = [
  {
    icon: Home,
    title: "Climatizadores Residenciais",
    description:
      "Soluções econômicas e eficientes para refrescar sua casa com baixo consumo de energia.",
    features: [
      "Economia de até 90% na conta de luz",
      "Umidificação natural do ambiente",
      "Ideal para áreas abertas e semi-abertas",
      "Fácil instalação e manutenção",
      "Renovação constante do ar",
    ],
    image: "residential",
  },
  {
    icon: Factory,
    title: "Climatizadores Industriais",
    description:
      "Climatização de grandes ambientes industriais, comerciais e galpões com máxima eficiência.",
    features: [
      "Cobertura de grandes áreas",
      "Redução de até 15°C na temperatura",
      "Exaustão de ar quente e poluído",
      "Custo operacional muito baixo",
      "Ideal para indústrias e galpões",
    ],
    image: "industrial",
  },
]

const services = [
  {
    icon: Wrench,
    title: "Instalação",
    description:
      "Instalação profissional de climatizadores evaporativos com dimensionamento adequado para seu ambiente.",
  },
  {
    icon: Sparkles,
    title: "Limpeza",
    description:
      "Higienização completa do sistema, limpeza de filtros, painel evaporativo e reservatório de água.",
  },
  {
    icon: Gauge,
    title: "Manutenção",
    description:
      "Manutenção preventiva e corretiva para garantir o funcionamento ideal e prolongar a vida útil.",
  },
]

const cleaningSteps = [
  {
    number: "01",
    title: "Desmontagem",
    description:
      "Desmontamos cuidadosamente o climatizador para acesso a todos os componentes internos.",
  },
  {
    number: "02",
    title: "Limpeza dos Filtros",
    description:
      "Lavagem profunda dos filtros e painéis evaporativos para remoção de sujeira e impurezas.",
  },
  {
    number: "03",
    title: "Higienização do Reservatório",
    description:
      "Limpeza e desinfecção do reservatório de água para eliminar algas, fungos e bactérias.",
  },
  {
    number: "04",
    title: "Verificação do Sistema",
    description:
      "Teste completo de funcionamento, bomba d&apos;água, motor e sistema elétrico.",
  },
]

const maintenanceItems = [
  {
    icon: Droplets,
    title: "Sistema de Água",
    items: [
      "Verificação da bomba d'água",
      "Limpeza da boia e válvulas",
      "Checagem de vazamentos",
      "Inspeção das tubulações",
    ],
  },
  {
    icon: Wind,
    title: "Sistema de Ventilação",
    items: [
      "Lubrificação do motor",
      "Verificação das pás",
      "Balanceamento do rotor",
      "Limpeza das grades",
    ],
  },
  {
    icon: Thermometer,
    title: "Sistema Evaporativo",
    items: [
      "Troca de painéis desgastados",
      "Limpeza dos distribuidores",
      "Verificação da umidificação",
      "Ajuste do fluxo de água",
    ],
  },
]

const warningSignals = [
  {
    icon: AlertTriangle,
    title: "Baixa Vazão de Ar",
    description: "O climatizador não está ventilando com a mesma força de antes.",
  },
  {
    icon: Droplets,
    title: "Mau Cheiro",
    description: "Odor desagradável vindo do climatizador, indicando acúmulo de sujeira.",
  },
  {
    icon: Wind,
    title: "Ruídos Estranhos",
    description: "Barulhos incomuns no motor ou nas pás do ventilador.",
  },
  {
    icon: Thermometer,
    title: "Pouca Refrigeração",
    description: "O ar não está saindo fresco como deveria, mesmo com água no reservatório.",
  },
]

const benefits = [
  {
    icon: Zap,
    title: "Economia de Energia",
    value: "90%",
    description: "Menos consumo comparado ao ar-condicionado convencional.",
  },
  {
    icon: Wind,
    title: "Ar Natural",
    value: "100%",
    description: "Ar renovado constantemente, sem recirculação.",
  },
  {
    icon: Shield,
    title: "Garantia",
    value: "12 meses",
    description: "Todos os serviços com garantia de qualidade.",
  },
  {
    icon: Users,
    title: "Experiência",
    value: "500+",
    description: "Clientes satisfeitos em toda região.",
  },
]

export default function ClimatizadoresPage() {
  return (
    <main className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-2 mb-6">
              <Wind className="h-4 w-4 text-cyan-400" />
              <span className="text-cyan-400 text-sm font-medium">
                Climatizadores Evaporativos
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Climatizadores
              <br />
              <span className="text-cyan-400">Residenciais e Industriais</span>
            </h1>

            <p className="text-lg md:text-xl text-white/70 mb-10 leading-relaxed max-w-2xl">
              Especialistas em instalação, limpeza e manutenção de climatizadores
              evaporativos. Soluções econômicas e sustentáveis para refrescar
              ambientes residenciais e industriais.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                asChild
                size="lg"
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710?text=Olá! Gostaria de solicitar um orçamento para serviço em climatizador."
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
                <a href="#servicos">Nossos Serviços</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Types Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Tipos de Climatizadores
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Soluções para Cada Necessidade
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {climatizadorTypes.map((type, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <type.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-card-foreground">
                    {type.title}
                  </h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {type.description}
                </p>
                <ul className="space-y-3">
                  {type.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicos" className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              O que oferecemos
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Nossos Serviços em Climatizadores
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 hover:shadow-lg transition-all duration-300 text-center"
              >
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <service.icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-card-foreground mb-4">
                  {service.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cleaning Process Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
                Processo de Limpeza
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6 leading-tight">
                Limpeza Completa do seu Climatizador
              </h2>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                Nosso processo de limpeza e higienização garante que seu
                climatizador funcione com máxima eficiência, proporcionando ar
                fresco e limpo para seu ambiente.
              </p>

              <div className="grid gap-6">
                {cleaningSteps.map((step, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <span className="text-3xl font-bold text-primary/30">
                        {step.number}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-10 lg:p-14">
              <h3 className="text-2xl font-bold text-white mb-8">
                Frequência Recomendada de Limpeza
              </h3>
              <div className="grid gap-6">
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Factory className="h-5 w-5 text-cyan-400" />
                    <span className="text-white font-semibold">
                      Uso Industrial
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-cyan-400 mb-1">
                    Mensal
                  </div>
                  <div className="text-white/60 text-sm">
                    Ambientes com alta circulação e poeira
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 className="h-5 w-5 text-cyan-400" />
                    <span className="text-white font-semibold">
                      Uso Comercial
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-cyan-400 mb-1">
                    Trimestral
                  </div>
                  <div className="text-white/60 text-sm">
                    Lojas, escritórios e estabelecimentos comerciais
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Home className="h-5 w-5 text-cyan-400" />
                    <span className="text-white font-semibold">
                      Uso Residencial
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-cyan-400 mb-1">
                    Semestral
                  </div>
                  <div className="text-white/60 text-sm">
                    Casas e apartamentos com uso regular
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Maintenance Section */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Manutenção Completa
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              O que Verificamos na Manutenção
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nossa manutenção preventiva abrange todos os sistemas do
              climatizador para garantir funcionamento perfeito.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {maintenanceItems.map((item, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-2xl p-8"
              >
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                  <item.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-card-foreground mb-4">
                  {item.title}
                </h3>
                <ul className="space-y-3">
                  {item.items.map((listItem, listIndex) => (
                    <li
                      key={listIndex}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm">{listItem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Warning Signals Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Fique atento
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Sinais de que seu Climatizador Precisa de Atenção
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Identifique esses sinais e agende uma visita técnica antes que
              pequenos problemas se tornem grandes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {warningSignals.map((signal, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-xl p-6 hover:border-amber-500/30 transition-colors"
              >
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4">
                  <signal.icon className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="font-semibold text-card-foreground mb-2">
                  {signal.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {signal.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Stats Section */}
      <section className="py-16 bg-gradient-to-r from-slate-900 to-cyan-900">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <p className="text-3xl md:text-4xl font-bold text-white mb-1">
                  {benefit.value}
                </p>
                <p className="text-cyan-400 font-semibold text-sm mb-1">
                  {benefit.title}
                </p>
                <p className="text-white/60 text-xs">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-4">
              Por que escolher climatizadores?
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Vantagens do Climatizador Evaporativo
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-card border border-primary rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <BadgeCheck className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-bold text-card-foreground">
                  Climatizador Evaporativo
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Consome até 90% menos energia",
                  "Não utiliza gás refrigerante",
                  "Ar 100% renovado constantemente",
                  "Umidifica o ar naturalmente",
                  "Baixo custo de manutenção",
                  "Ideal para áreas abertas",
                  "Instalação mais simples",
                  "Ecologicamente correto",
                ].map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 text-foreground"
                  >
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Thermometer className="h-6 w-6 text-muted-foreground" />
                <h3 className="text-xl font-bold text-card-foreground">
                  Ideal Para
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Galpões industriais",
                  "Fábricas e linhas de produção",
                  "Quadras e ginásios",
                  "Igrejas e salões de festas",
                  "Lojas e supermercados",
                  "Oficinas mecânicas",
                  "Varandas e áreas gourmet",
                  "Garagens e estacionamentos",
                ].map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 text-muted-foreground"
                  >
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              Mantenha seu Climatizador em Perfeito Estado
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Agende uma visita técnica para instalação, limpeza ou manutenção
              do seu climatizador. Atendemos toda região de Araraquara com
              garantia de qualidade.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base rounded-full"
              >
                <a
                  href="https://wa.me/5516997369710?text=Olá! Gostaria de agendar um serviço para meu climatizador."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Phone className="h-5 w-5" />
                  Agendar Serviço
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
