import Link from "next/link"
import Image from "next/image"
import { Phone, MapPin, Clock, ArrowUpRight } from "lucide-react"

export function Footer() {
  return (
    <footer id="contato" className="bg-slate-950 text-white">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Main Footer */}
        <div className="py-16 md:py-20 grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Logo and Description */}
          <div className="lg:col-span-2">
            <div className="relative h-10 w-44 mb-6">
              <Image
                src="/images/logo.png"
                alt="Ar Ideal Climatizacao"
                fill
                className="object-contain object-left"
              />
            </div>
            <p className="text-white/50 leading-relaxed max-w-md mb-6">
              Instalação, limpeza, higienização e manutenção de ar-condicionado 
              em Araraquara. Qualidade e compromisso com garantia de 12 meses 
              em todos os serviços.
            </p>
            <a
              href="https://wa.me/5516997369710"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              Fale conosco
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold tracking-widest uppercase mb-6">
              Contato
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-white/50 hover:text-white transition-colors"
                >
                  <Phone className="h-4 w-4 text-cyan-400" />
                  (16) 99736-9710
                </a>
              </li>
              <li className="flex items-center gap-3 text-white/50">
                <MapPin className="h-4 w-4 text-cyan-400" />
                Araraquara - SP
              </li>
              <li className="flex items-center gap-3 text-white/50">
                <Clock className="h-4 w-4 text-cyan-400" />
                Seg - Sáb: 8h às 18h
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold tracking-widest uppercase mb-6">
              Links
            </h3>
            <ul className="space-y-4">
              <li>
                <Link
                  href="#servicos"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  Serviços
                </Link>
              </li>
              <li>
                <Link
                  href="/simulador"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  Simulador BTU
                </Link>
              </li>
              <li>
                <Link
                  href="#sobre"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  Sobre Nós
                </Link>
              </li>
              <li>
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="border-t border-white/10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} Ar Ideal Climatizacao. Todos os direitos reservados.
          </p>
          <p className="text-white/40 text-sm">
            Araraquara - SP
          </p>
        </div>
      </div>
    </footer>
  )
}
