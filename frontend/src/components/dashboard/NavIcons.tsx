import type { SVGProps } from "react";

type NavSvgProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function NavIconHome(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M19 10v9a1 1 0 0 1-1 1h-4v-5H10v5H6a1 1 0 0 1-1-1v-9" />
    </svg>
  );
}

/** Painel / grade — atalho para hub de administração do SaaS */
export function NavIconLayoutDashboard(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.25" />
      <rect x="14" y="3" width="7" height="7" rx="1.25" />
      <rect x="3" y="14" width="7" height="7" rx="1.25" />
      <rect x="14" y="14" width="7" height="7" rx="1.25" />
    </svg>
  );
}

export function NavIconBuilding(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6h4" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9h-4" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function NavIconUsers(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function NavIconContact(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 12h-4" />
      <path d="M20 10v4" />
    </svg>
  );
}

export function NavIconClipboard(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function NavIconBox(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

/** Pilhas / estoque (prateleiras) */
export function NavIconInventory(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4 10v10a1 1 0 0 0 1 1h5V9H5a1 1 0 0 0-1 1Z" />
      <path d="M14 13h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-5V13Z" />
      <path d="M14 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5V4Z" />
      <path d="M4 5a1 1 0 0 1 1-1h5v8H5a1 1 0 0 1-1-1V5Z" />
    </svg>
  );
}

export function NavIconCalendar(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function NavIconFileQuote(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h4" />
      <path d="M8 17h4" />
    </svg>
  );
}

export function NavIconWallet(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

/** Chave inglesa — catálogo de serviços (menu v0) */
export function NavIconWrench(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/** Quebra-cabeça — loja de integrações (menu v0) */
export function NavIconPuzzle(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915z" />
    </svg>
  );
}

/** Sacola — Mercado Livre (menu v0) */
export function NavIconShoppingBag(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export function NavIconSettings(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

/** Chave — integrações / API */
export function NavIconKey(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78L21 2" />
      <path d="M15 7l3 3" />
    </svg>
  );
}

export function NavIconChevronLeft(props: NavSvgProps) {
  return (
    <svg {...base} width={18} height={18} aria-hidden {...props}>
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

export function NavIconChevronRight(props: NavSvgProps) {
  return (
    <svg {...base} width={18} height={18} aria-hidden {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function NavIconChevronDown(props: NavSvgProps) {
  return (
    <svg {...base} width={16} height={16} aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Perfil / usuário */
export function NavIconUserCircle(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

/** Senha / segurança */
export function NavIconLock(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Sair */
export function NavIconLogOut(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** Pacote / integração (ex.: marketplace) */
export function NavIconPackage(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M16.5 9.4 7.5 4.2" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/** Loja de apps / integrações */
export function NavIconStore(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

/** PMOC / qualidade do ar (Lei 13.589) */
export function NavIconAirCompliance(props: NavSvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Fechar painel */
export function NavIconX(props: NavSvgProps) {
  return (
    <svg {...base} width={18} height={18} aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
