"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-slate-900/95 backdrop-blur-md shadow-lg"
          : "bg-transparent"
      }`}
    >
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

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-10">
            <Link
              href="#servicos"
              className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase"
            >
              Serviços
            </Link>
            <Link
              href="/simulador"
              className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase"
            >
              Simulador BTU
            </Link>
            <Link
              href="#sobre"
              className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase"
            >
              Sobre
            </Link>
            <Link
              href="#contato"
              className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase"
            >
              Contato
            </Link>
            <Button
              asChild
              className="bg-white text-slate-900 hover:bg-white/90 font-semibold px-6 rounded-full"
            >
              <a
                href="https://wa.me/5516997369710"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                Orçamento
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-6 border-t border-white/10">
            <div className="flex flex-col gap-4">
              <Link
                href="#servicos"
                className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Serviços
              </Link>
              <Link
                href="/simulador"
                className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Simulador BTU
              </Link>
              <Link
                href="#sobre"
                className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Sobre
              </Link>
              <Link
                href="#contato"
                className="text-white/80 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Contato
              </Link>
              <Button
                asChild
                className="bg-white text-slate-900 hover:bg-white/90 font-semibold rounded-full mt-2"
              >
                <a
                  href="https://wa.me/5516997369710"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2"
                >
                  Orçamento
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
