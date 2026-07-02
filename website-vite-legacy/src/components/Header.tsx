import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { BrandMark } from "./BrandMark";

const navItems = [
  { to: "/", label: "Início", end: true },
  { to: "/funcionalidades", label: "Funcionalidades" },
  { to: "/contato", label: "Contato" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-btn px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface hover:text-text"
  }`;

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-surface-elevated/90 backdrop-blur-md">
      <div className="section-container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="shrink-0" onClick={() => setOpen(false)}>
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link to="/contato" className="btn-outline !min-h-10 !px-4 !py-2">
            Solicitar Orçamento
          </Link>
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
        <div className="border-t border-border bg-surface-elevated px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/contato"
              className="btn-outline mt-2 w-full"
              onClick={() => setOpen(false)}
            >
              Solicitar Orçamento
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
