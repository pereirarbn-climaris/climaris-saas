"use client";

import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useLeadModal } from "@/context/LeadModalContext";
import { cta, loginUrl, registerUrl } from "@/lib/site-config";

export function HeroCta() {
  const { openLeadModal } = useLeadModal();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link href={registerUrl()} className="btn-primary">
          {cta.freeTrial}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Link>
        <a href={loginUrl()} className="btn-secondary">
          {cta.login}
        </a>
        <button type="button" className="btn-secondary" onClick={() => openLeadModal({ intent: "demo" })}>
          {cta.primary}
        </button>
        <Link href="/contato" className="btn-secondary sm:ml-0">
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
          {cta.secondary}
        </Link>
      </div>
      <p className="text-sm text-white/75">
        {cta.loginHint}{" "}
        <a href={loginUrl()} className="font-semibold text-white underline-offset-2 hover:underline">
          {cta.login} na sua conta
        </a>
      </p>
    </div>
  );
}
