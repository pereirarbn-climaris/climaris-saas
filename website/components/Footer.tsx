"use client";

import Link from "next/link";
import { Building2, MapPin, Mail, Phone } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useSiteSettings } from "./SiteSettingsProvider";
import { cta, loginUrl, publicCtaLabel, registerUrl, siteConfig } from "@/lib/site-config";

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function Footer() {
  const { settings } = useSiteSettings();
  const cnpj = settings.cnpj || siteConfig.cnpj;
  const phone = settings.contact_phone || siteConfig.phone;

  return (
    <footer className="border-t border-border bg-surface-elevated">
      <div className="section-container grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <BrandMark />
          <p className="max-w-sm text-sm leading-relaxed text-text-muted">
            <strong className="font-medium text-text">{settings.legal_name}</strong> — software B2B
            de gestão para empresas de climatização e refrigeração. ERP com controle de ordens de
            serviço, financeiro automatizado e conformidade PMOC.
          </p>
          {cnpj ? (
            <p className="flex items-center gap-2 text-sm text-text-subtle">
              <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              CNPJ {formatCnpj(cnpj)}
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-text">Produto</h2>
          <ul className="space-y-2 text-sm text-text-muted">
            <li>
              <Link href="/funcionalidades" className="hover:text-primary">
                Funcionalidades
              </Link>
            </li>
            <li>
              <Link href="/planos" className="hover:text-primary">
                Planos e preços
              </Link>
            </li>
            <li>
              <a href={registerUrl()} className="font-medium text-primary hover:underline">
                {cta.freeTrial} — {siteConfig.name}
              </a>
            </li>
            <li>
              <Link href="/contato" className="hover:text-primary">
                {publicCtaLabel()}
              </Link>
            </li>
            <li>
              <a href={loginUrl()} className="font-medium text-primary hover:underline">
                {cta.login} na conta
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-text">Legal</h2>
          <ul className="space-y-2 text-sm text-text-muted">
            <li>
              <Link href="/privacidade" className="hover:text-primary">
                Política de Privacidade e LGPD
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-text">Contato corporativo</h2>
          <ul className="space-y-3 text-sm text-text-muted">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                {settings.address_street}
                <br />
                {settings.address_city} — {settings.address_state}
                <br />
                CEP {settings.address_postal} • Brasil
              </span>
            </li>
            <li className="flex gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <a href={`mailto:${settings.contact_email}`} className="hover:text-primary">
                {settings.contact_email}
              </a>
            </li>
            {phone ? (
              <li className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <a href={`tel:${phone.replace(/\D/g, "")}`} className="hover:text-primary">
                  {phone}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="section-container flex flex-col gap-2 py-6 text-xs text-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {settings.legal_name}. Todos os direitos reservados.
          </span>
          <span>ERP climatização • Sistema de gestão B2B • PMOC e laudos técnicos</span>
        </div>
      </div>
    </footer>
  );
}
