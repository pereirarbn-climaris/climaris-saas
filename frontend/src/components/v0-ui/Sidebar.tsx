/**
 * Sidebar modular para o Climaris SaaS
 * 
 * Utiliza o design system definido em index.css com CSS variables.
 * Suporta expansao/colapso, navegacao aninhada e responsividade mobile.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import {
  NavIconChevronLeft,
  NavIconChevronRight,
  NavIconChevronDown,
  NavIconX,
} from "../dashboard/NavIcons";

/* ============================================================================
   CONTEXTO
============================================================================ */

interface SidebarContextValue {
  expanded: boolean;
  setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("Sidebar.* components must be used within <Sidebar.Root>");
  }
  return ctx;
}

/* ============================================================================
   SIDEBAR ROOT
============================================================================ */

interface SidebarRootProps {
  children: ReactNode;
  defaultExpanded?: boolean;
}

function SidebarRoot({ children, defaultExpanded = true }: SidebarRootProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{ expanded, setExpanded, mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

/* ============================================================================
   SIDEBAR TRIGGER (MOBILE)
============================================================================ */

interface SidebarTriggerProps extends ComponentPropsWithoutRef<"button"> {
  children?: ReactNode;
}

function SidebarTrigger({ children, className = "", ...props }: SidebarTriggerProps) {
  const { setMobileOpen } = useSidebarContext();

  return (
    <button
      type="button"
      aria-label="Abrir menu"
      onClick={() => setMobileOpen(true)}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "var(--btn-height-base)",
        height: "var(--btn-height-base)",
        border: "none",
        background: "transparent",
        color: "var(--color-text)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "background var(--motion-duration) var(--motion-easing)",
      }}
      {...props}
    >
      {children || <HamburgerIcon />}
    </button>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/* ============================================================================
   SIDEBAR CONTAINER
============================================================================ */

interface SidebarContainerProps {
  children: ReactNode;
  width?: string;
  collapsedWidth?: string;
}

function SidebarContainer({
  children,
  width = "16rem",
  collapsedWidth = "4.5rem",
}: SidebarContainerProps) {
  const { expanded, mobileOpen, setMobileOpen } = useSidebarContext();

  const handleOverlayClick = useCallback(() => {
    setMobileOpen(false);
  }, [setMobileOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    },
    [setMobileOpen]
  );

  const baseStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    height: "100dvh",
    background: "var(--color-surface-elevated)",
    borderRight: "1px solid var(--color-border)",
    transition: "width var(--motion-duration-slow) var(--motion-easing)",
    overflow: "hidden",
    flexShrink: 0,
  };

  // Desktop
  const desktopStyles: React.CSSProperties = {
    ...baseStyles,
    width: expanded ? width : collapsedWidth,
  };

  // Mobile overlay
  const mobileOverlayStyles: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    background: "rgba(0, 0, 0, 0.5)",
    opacity: mobileOpen ? 1 : 0,
    visibility: mobileOpen ? "visible" : "hidden",
    transition: "opacity var(--motion-duration) var(--motion-easing), visibility var(--motion-duration) var(--motion-easing)",
  };

  const mobileSidebarStyles: React.CSSProperties = {
    ...baseStyles,
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 50,
    width,
    transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
    transition: "transform var(--motion-duration-slow) var(--motion-easing)",
    boxShadow: mobileOpen ? "var(--card-shadow-hover)" : "none",
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        style={desktopStyles}
        className="sidebar-desktop"
        onKeyDown={handleKeyDown}
      >
        {children}
      </aside>

      {/* Mobile overlay */}
      <div
        style={mobileOverlayStyles}
        className="sidebar-mobile-overlay"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Mobile sidebar */}
      <aside
        style={mobileSidebarStyles}
        className="sidebar-mobile"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegacao"
        onKeyDown={handleKeyDown}
      >
        {children}
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop {
            display: none !important;
          }
        }
        @media (min-width: 769px) {
          .sidebar-mobile-overlay,
          .sidebar-mobile {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

/* ============================================================================
   SIDEBAR HEADER
============================================================================ */

interface SidebarHeaderProps {
  children: ReactNode;
  showCloseOnMobile?: boolean;
}

function SidebarHeader({ children, showCloseOnMobile = true }: SidebarHeaderProps) {
  const { expanded, mobileOpen, setMobileOpen } = useSidebarContext();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: expanded || mobileOpen ? "space-between" : "center",
        padding: "var(--space-4)",
        borderBottom: "1px solid var(--color-border)",
        minHeight: "4rem",
      }}
    >
      <div
        style={{
          display: expanded || mobileOpen ? "flex" : "none",
          alignItems: "center",
          gap: "var(--space-3)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>

      {/* Botao de fechar no mobile */}
      {showCloseOnMobile && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="sidebar-close-mobile"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            width: "2rem",
            height: "2rem",
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          <NavIconX />
        </button>
      )}

      <style>{`
        @media (max-width: 768px) {
          .sidebar-close-mobile {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ============================================================================
   SIDEBAR CONTENT
============================================================================ */

interface SidebarContentProps {
  children: ReactNode;
}

function SidebarContent({ children }: SidebarContentProps) {
  return (
    <nav
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "var(--space-3)",
      }}
    >
      {children}
    </nav>
  );
}

/* ============================================================================
   SIDEBAR GROUP
============================================================================ */

interface SidebarGroupProps {
  children: ReactNode;
  label?: string;
}

function SidebarGroup({ children, label }: SidebarGroupProps) {
  const { expanded } = useSidebarContext();

  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      {label && expanded && (
        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ul>
    </div>
  );
}

/* ============================================================================
   SIDEBAR ITEM
============================================================================ */

interface SidebarItemProps {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
}

function SidebarItem({ children, icon, active = false, href, onClick }: SidebarItemProps) {
  const { expanded, mobileOpen, setMobileOpen } = useSidebarContext();
  const showLabel = expanded || mobileOpen;

  const handleClick = (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    onClick?.(e);
    if (mobileOpen) {
      setMobileOpen(false);
    }
  };

  const sharedStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: showLabel ? "flex-start" : "center",
    gap: "var(--space-3)",
    width: "100%",
    padding: showLabel ? "var(--space-3)" : "var(--space-3) 0",
    fontSize: "var(--font-size-base)",
    fontWeight: active ? "var(--font-weight-medium)" : "var(--font-weight-normal)",
    color: active ? "var(--color-primary)" : "var(--color-text)",
    background: active ? "var(--color-focus-ring)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "background var(--motion-duration) var(--motion-easing), color var(--motion-duration) var(--motion-easing)",
  };

  const content = (
    <>
      {icon && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--icon-size-md)",
            height: "var(--icon-size-md)",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      {showLabel && (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {children}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <li>
        <a
          href={href}
          onClick={handleClick}
          style={sharedStyles}
          aria-current={active ? "page" : undefined}
        >
          {content}
        </a>
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={handleClick} style={sharedStyles}>
        {content}
      </button>
    </li>
  );
}

/* ============================================================================
   SIDEBAR COLLAPSIBLE (SUBMENU)
============================================================================ */

interface SidebarCollapsibleProps {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
  defaultOpen?: boolean;
}

function SidebarCollapsible({
  children,
  icon,
  label,
  defaultOpen = false,
}: SidebarCollapsibleProps) {
  const { expanded, mobileOpen } = useSidebarContext();
  const [open, setOpen] = useState(defaultOpen);
  const showLabel = expanded || mobileOpen;

  if (!showLabel) {
    // Quando colapsado, mostra apenas o icone (sem submenu)
    return (
      <li>
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "var(--space-3) 0",
            background: "transparent",
            border: "none",
            color: "var(--color-text)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          {icon && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "var(--icon-size-md)",
                height: "var(--icon-size-md)",
              }}
            >
              {icon}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "var(--space-3)",
          background: "transparent",
          border: "none",
          color: "var(--color-text)",
          fontSize: "var(--font-size-base)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          transition: "background var(--motion-duration) var(--motion-easing)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {icon && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "var(--icon-size-md)",
                height: "var(--icon-size-md)",
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <span>{label}</span>
        </span>
        <NavIconChevronDown
          style={{
            width: "var(--icon-size-sm)",
            height: "var(--icon-size-sm)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform var(--motion-duration) var(--motion-easing)",
          }}
        />
      </button>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          paddingLeft: "var(--space-6)",
          maxHeight: open ? "500px" : "0",
          overflow: "hidden",
          transition: "max-height var(--motion-duration-slow) var(--motion-easing)",
        }}
      >
        {children}
      </ul>
    </li>
  );
}

/* ============================================================================
   SIDEBAR FOOTER
============================================================================ */

interface SidebarFooterProps {
  children: ReactNode;
}

function SidebarFooter({ children }: SidebarFooterProps) {
  return (
    <div
      style={{
        marginTop: "auto",
        padding: "var(--space-3)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================================
   SIDEBAR TOGGLE
============================================================================ */

function SidebarToggle() {
  const { expanded, setExpanded } = useSidebarContext();

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      aria-label={expanded ? "Recolher sidebar" : "Expandir sidebar"}
      className="sidebar-toggle-desktop"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.75rem",
        height: "1.75rem",
        position: "absolute",
        right: "-0.875rem",
        top: "1.125rem",
        background: "var(--color-surface-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "50%",
        color: "var(--color-text-muted)",
        cursor: "pointer",
        zIndex: 10,
        transition: "color var(--motion-duration) var(--motion-easing)",
      }}
    >
      {expanded ? <NavIconChevronLeft /> : <NavIconChevronRight />}

      <style>{`
        @media (max-width: 768px) {
          .sidebar-toggle-desktop {
            display: none !important;
          }
        }
      `}</style>
    </button>
  );
}

/* ============================================================================
   SIDEBAR SEPARATOR
============================================================================ */

function SidebarSeparator() {
  return (
    <div
      role="separator"
      style={{
        height: "1px",
        background: "var(--color-border)",
        margin: "var(--space-3) 0",
      }}
    />
  );
}

/* ============================================================================
   EXPORTS
============================================================================ */

export const Sidebar = {
  Root: SidebarRoot,
  Trigger: SidebarTrigger,
  Container: SidebarContainer,
  Header: SidebarHeader,
  Content: SidebarContent,
  Group: SidebarGroup,
  Item: SidebarItem,
  Collapsible: SidebarCollapsible,
  Footer: SidebarFooter,
  Toggle: SidebarToggle,
  Separator: SidebarSeparator,
};

export type { SidebarContextValue, SidebarRootProps, SidebarItemProps };
