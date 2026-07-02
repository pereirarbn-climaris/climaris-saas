"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { useLeadModal } from "@/context/LeadModalContext";
import { cta, loginUrl, registerUrl, routes } from "@/lib/site-config";

const extraRoutes = [{ path: "/planos", label: "Planos" }] as const;

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { openLeadModal } = useLeadModal();

  const navItems = [...routes.slice(0, 2), ...extraRoutes, routes[2]];

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-surface-elevated/90 backdrop-blur-md">
      <div className="section-container flex h-16 items-center justify-between gap-4">
        <BrandMark />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {navItems.map((item) => {
            const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`rounded-btn px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface hover:text-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={loginUrl()}
            className="rounded-btn px-3 py-2 text-sm font-semibold text-text-muted transition hover:text-primary"
          >
            {cta.login}
          </a>
          <Link href={registerUrl()} className="btn-outline !min-h-10 !px-4">
            {cta.freeTrial}
          </Link>
          <button
            type="button"
            className="btn-solid !min-h-10 !px-4"
            onClick={() => openLeadModal({ intent: "demo" })}
          >
            {cta.primary}
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-btn border border-border text-text md:hidden"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className="rounded-btn px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={loginUrl()}
              className="rounded-btn px-3 py-2 text-center text-sm font-semibold text-primary"
              onClick={() => setOpen(false)}
            >
              {cta.login}
            </a>
            <Link
              href={registerUrl()}
              className="btn-outline mt-2 w-full"
              onClick={() => setOpen(false)}
            >
              {cta.freeTrial}
            </Link>
            <button
              type="button"
              className="btn-solid mt-2 w-full"
              onClick={() => {
                setOpen(false);
                openLeadModal({ intent: "demo" });
              }}
            >
              {cta.primary}
            </button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
