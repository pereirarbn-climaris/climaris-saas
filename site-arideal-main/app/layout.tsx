import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: 'Ar Ideal Climatização - Instalação, Limpeza e Manutenção de Ar-Condicionado em Araraquara',
  description: 'Ar Ideal Climatização oferece serviços de instalação, limpeza, higienização e manutenção de ar-condicionado em Araraquara. Garantia de 12 meses no serviço.',
  keywords: 'ar condicionado, climatização, instalação ar condicionado, limpeza ar condicionado, manutenção ar condicionado, Araraquara',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
