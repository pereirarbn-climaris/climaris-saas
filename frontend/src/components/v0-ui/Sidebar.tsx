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
  import { NavLink } from "react-router-dom";
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
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
  }
  
  function SidebarRoot({
    children,
    defaultExpanded = true,
    expanded: expandedProp,
    onExpandedChange,
  }: SidebarRootProps) {
    const [expandedInternal, setExpandedInternal] = useState(defaultExpanded);
    const [mobileOpen, setMobileOpen] = useState(false);
    const isControlled = expandedProp !== undefined;
    const expanded = isControlled ? expandedProp : expandedInternal;
  
    const setExpanded = useCallback(
      (v: boolean | ((prev: boolean) => boolean)) => {
        const prev = isControlled ? expandedProp! : expandedInternal;
        const next = typeof v === "function" ? v(prev) : v;
        if (!isControlled) setExpandedInternal(next);
        onExpandedChange?.(next);
      },
      [isControlled, expandedProp, expandedInternal, onExpandedChange],
    );
  
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
  
  function SidebarTrigger({ children, className = "", style, ...props }: SidebarTriggerProps) {
    const { setMobileOpen } = useSidebarContext();
    const useDefaultChrome = !className;
  
    return (
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setMobileOpen(true)}
        className={className}
        style={{
          ...(useDefaultChrome
            ? {
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
              }
            : null),
          ...style,
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
      position: "relative",
      height: "100dvh",
      minHeight: "100vh",
      background: "var(--color-surface-elevated)",
      borderRight: "1px solid var(--color-border)",
      transition: "width var(--motion-duration-slow) var(--motion-easing)",
      overflow: "visible",
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
          @media (max-width: 900px) {
            .sidebar-desktop {
              display: none !important;
            }
          }
          @media (min-width: 901px) {
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
    showToggle?: boolean;
    toggleClassName?: string;
  }
  
  function SidebarHeader({
    children,
    showCloseOnMobile = true,
    showToggle = true,
    toggleClassName = "",
  }: SidebarHeaderProps) {
    const { expanded, mobileOpen, setMobileOpen } = useSidebarContext();
    const showFull = expanded || mobileOpen;
  
    return (
      <div
        data-collapsed={showFull ? "false" : "true"}
        className="sidebar-header"
        style={{
          display: "flex",
          flexDirection: showFull ? "row" : "column",
          alignItems: "center",
          justifyContent: showFull ? "space-between" : "center",
          gap: showFull ? "var(--space-2)" : "var(--space-3)",
          padding: showFull ? "var(--space-4)" : "var(--space-3) var(--space-2)",
          borderBottom: "1px solid var(--color-border)",
          minHeight: "4rem",
          flexShrink: 0,
        }}
      >
        <div
          className="sidebar-header-brand"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: showFull ? "flex-start" : "center",
            gap: "var(--space-3)",
            minWidth: 0,
            flex: showFull ? 1 : undefined,
            width: showFull ? undefined : "100%",
            overflow: "hidden",
          }}
        >
          {children}
        </div>
  
        <div
          className="sidebar-header-actions"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
            width: showFull ? undefined : "100%",
          }}
        >
          {showToggle ? <SidebarToggle className={toggleClassName} /> : null}
  
          {showCloseOnMobile ? (
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
          ) : null}
        </div>
  
        <style>{`
          @media (max-width: 900px) {
            .sidebar-close-mobile {
              display: flex !important;
            }
            .sidebar-header[data-collapsed="false"] {
              flex-direction: row !important;
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
    to?: string;
    end?: boolean;
    title?: string;
    onClick?: (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  }
  
  function itemStyles(
    showLabel: boolean,
    active: boolean,
  ): React.CSSProperties {
    return {
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
      transition:
        "background var(--motion-duration) var(--motion-easing), color var(--motion-duration) var(--motion-easing)",
    };
  }
  
  function SidebarItem({
    children,
    icon,
    active = false,
    href,
    to,
    end = false,
    title,
    onClick,
  }: SidebarItemProps) {
    const { expanded, mobileOpen, setMobileOpen } = useSidebarContext();
    const showLabel = expanded || mobileOpen;
  
    const handleClick = (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      onClick?.(e);
      if (mobileOpen) {
        setMobileOpen(false);
      }
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
  
    if (to) {
      return (
        <li>
          <NavLink
            to={to}
            end={end}
            title={title}
            onClick={handleClick}
            style={({ isActive }) => itemStyles(showLabel, isActive)}
            aria-current={undefined}
          >
            {content}
          </NavLink>
        </li>
      );
    }
  
    if (href) {
      return (
        <li>
          <a
            href={href}
            title={title}
            onClick={handleClick}
            style={itemStyles(showLabel, active)}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </a>
        </li>
      );
    }
  
    return (
      <li>
        <button type="button" title={title} onClick={handleClick} style={itemStyles(showLabel, active)}>
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
  
  interface SidebarToggleProps extends ComponentPropsWithoutRef<"button"> {}
  
  function SidebarToggle({ className = "", style, ...props }: SidebarToggleProps) {
    const { expanded, setExpanded } = useSidebarContext();
    const useDefaultChrome = !className;
  
    return (
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={expanded ? "Recolher sidebar" : "Expandir sidebar"}
        aria-expanded={expanded}
        title={expanded ? "Recolher menu lateral" : "Expandir menu lateral"}
        className={`sidebar-toggle-desktop ${className}`.trim()}
        style={{
          ...(useDefaultChrome
            ? {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1.75rem",
                height: "1.75rem",
                flexShrink: 0,
                padding: 0,
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                transition: "color var(--motion-duration) var(--motion-easing), border-color var(--motion-duration) var(--motion-easing), background var(--motion-duration) var(--motion-easing)",
              }
            : null),
          ...style,
        }}
        {...props}
      >
        {expanded ? <NavIconChevronLeft /> : <NavIconChevronRight />}
  
        <style>{`
          @media (max-width: 900px) {
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
  
