/**
 * ServiceOrdersListView - Componente de listagem e gerenciamento de Ordens de Servico
 * 
 * Tela completa para visualizar, filtrar e gerenciar OS do sistema Climaris.
 * Utiliza o design system definido em index.css com CSS variables.
 */

import {
    type ReactNode,
    useState,
    useMemo,
  } from "react";
  
  /* ============================================================================
     TIPOS
  ============================================================================ */
  
  type ServiceOrderStatus = 
    | "pendente" 
    | "agendada" 
    | "em_andamento" 
    | "concluida" 
    | "cancelada"
    | "aguardando_pecas";
  
  type ServiceType = "preventiva" | "corretiva" | "instalacao" | "manutencao";
  
  interface Technician {
    id: string;
    name: string;
    avatar?: string;
  }
  
  interface ServiceOrder {
    id: string;
    number: string;
    clientName: string;
    clientId: string;
    technician: Technician | null;
    serviceType: ServiceType;
    status: ServiceOrderStatus;
    openedAt: string;
    scheduledAt?: string;
    totalValue: number;
    description?: string;
    priority?: "baixa" | "media" | "alta" | "urgente";
  }
  
  interface ServiceOrderMetrics {
    todayTotal: number;
    inExecution: number;
    awaitingParts: number;
    completedMonth: number;
  }
  
  interface ServiceOrdersListViewProps {
    /** Lista de ordens de servico */
    orders: ServiceOrder[];
    /** Metricas para os cards de resumo */
    metrics: ServiceOrderMetrics;
    /** Lista de tecnicos para o filtro */
    technicians: Technician[];
    /** Estado de carregamento */
    isLoading?: boolean;
    /** Callback ao criar nova OS */
    onNewOrder?: () => void;
    /** Callback ao visualizar OS */
    onView?: (order: ServiceOrder) => void;
    /** Callback ao editar OS */
    onEdit?: (order: ServiceOrder) => void;
    /** Callback ao imprimir laudo */
    onPrint?: (order: ServiceOrder) => void;
    /** Callback de busca */
    onSearch?: (query: string) => void;
    /** Callback de filtro por status */
    onFilterStatus?: (status: ServiceOrderStatus | null) => void;
    /** Callback de filtro por tecnico */
    onFilterTechnician?: (technicianId: string | null) => void;
    /** Paginacao */
    pagination?: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      onPageChange: (page: number) => void;
    };
  }
  
  /* ============================================================================
     CONSTANTES E UTILITARIOS
  ============================================================================ */
  
  const statusConfig: Record<ServiceOrderStatus, { label: string; color: string; bg: string }> = {
    pendente: {
      label: "Pendente",
      color: "var(--color-warning)",
      bg: "rgba(245, 158, 11, 0.1)",
    },
    agendada: {
      label: "Agendada",
      color: "var(--color-primary)",
      bg: "rgba(14, 165, 233, 0.1)",
    },
    em_andamento: {
      label: "Em Andamento",
      color: "var(--color-info)",
      bg: "rgba(59, 130, 246, 0.1)",
    },
    concluida: {
      label: "Concluída",
      color: "var(--color-success)",
      bg: "rgba(34, 197, 94, 0.1)",
    },
    cancelada: {
      label: "Cancelada",
      color: "var(--color-error)",
      bg: "rgba(239, 68, 68, 0.1)",
    },
    aguardando_pecas: {
      label: "Aguard. Peças",
      color: "var(--color-text-muted)",
      bg: "rgba(148, 163, 184, 0.1)",
    },
  };
  
  const serviceTypeLabels: Record<ServiceType, string> = {
    preventiva: "Preventiva",
    corretiva: "Corretiva",
    instalacao: "Instalação",
    manutencao: "Manutenção",
  };
  
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }
  
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  
  /* ============================================================================
     ICONES SVG
  ============================================================================ */
  
  function CalendarIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }
  
  function TruckIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 3h15v13H1z" />
        <path d="M16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    );
  }
  
  function PackageIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 9.4l-9-5.19" />
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    );
  }
  
  function CheckCircleIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }
  
  function SearchIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  
  function PlusIcon({ size = 20 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }
  
  function EyeIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  
  function PencilIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }
  
  function PrinterIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    );
  }
  
  function ChevronLeftIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    );
  }
  
  function ChevronRightIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    );
  }
  
  function ChevronDownIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    );
  }
  
  function FilterIcon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    );
  }
  
  function ClipboardListIcon({ size = 48 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <line x1="8" y1="10" x2="8" y2="10" />
        <line x1="12" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="8" y2="14" />
        <line x1="12" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="8" y2="18" />
        <line x1="12" y1="18" x2="16" y2="18" />
      </svg>
    );
  }
  
  /* ============================================================================
     COMPONENTES AUXILIARES
  ============================================================================ */
  
  /** Card de Metrica */
  function MetricCard({
    title,
    value,
    icon,
    variant = "default",
  }: {
    title: string;
    value: number;
    icon: ReactNode;
    variant?: "default" | "primary" | "success" | "warning" | "error";
  }) {
    const variantStyles: Record<string, { iconBg: string; iconColor: string }> = {
      default: { iconBg: "var(--color-surface)", iconColor: "var(--color-text)" },
      primary: { iconBg: "rgba(14, 165, 233, 0.1)", iconColor: "var(--color-primary)" },
      success: { iconBg: "rgba(34, 197, 94, 0.1)", iconColor: "var(--color-success)" },
      warning: { iconBg: "rgba(245, 158, 11, 0.1)", iconColor: "var(--color-warning)" },
      error: { iconBg: "rgba(239, 68, 68, 0.1)", iconColor: "var(--color-error)" },
    };
  
    const styles = variantStyles[variant];
  
    return (
      <div
        style={{
          background: "var(--color-surface-elevated)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
          padding: "var(--space-5)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          transition: "all 0.2s ease",
          cursor: "default",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-md)",
            background: styles.iconBg,
            color: styles.iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-1)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 500,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: "var(--font-size-2xl)",
              fontWeight: 700,
              color: "var(--color-text)",
              lineHeight: 1,
            }}
          >
            {value}
          </p>
        </div>
      </div>
    );
  }
  
  /** Badge de Status */
  function StatusBadge({ status }: { status: ServiceOrderStatus }) {
    const config = statusConfig[status];
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "var(--space-1) var(--space-2)",
          borderRadius: "var(--radius-full)",
          fontSize: "var(--font-size-xs)",
          fontWeight: 500,
          background: config.bg,
          color: config.color,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: config.color,
            marginRight: "var(--space-1)",
          }}
        />
        {config.label}
      </span>
    );
  }
  
  /** Avatar do Tecnico */
  function TechnicianAvatar({ technician }: { technician: Technician | null }) {
    if (!technician) {
      return (
        <span
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
            fontStyle: "italic",
          }}
        >
          Não alocado
        </span>
      );
    }
  
    const initials = technician.name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {technician.avatar ? (
          <img
            src={technician.avatar}
            alt={technician.name}
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-full)",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-full)",
              background: "var(--color-primary)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
        )}
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
          {technician.name}
        </span>
      </div>
    );
  }
  
  /** Botao de Acao da Linha */
  function ActionButton({
    icon,
    label,
    onClick,
  }: {
    icon: ReactNode;
    label: string;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "transparent",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-surface)";
          e.currentTarget.style.color = "var(--color-text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-text-muted)";
        }}
      >
        {icon}
      </button>
    );
  }
  
  /** Dropdown Select */
  function SelectDropdown({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder: string;
  }) {
    return (
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            appearance: "none",
            width: "100%",
            padding: "var(--space-2) var(--space-8) var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            outline: "none",
            minWidth: 140,
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div
          style={{
            position: "absolute",
            right: "var(--space-2)",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "var(--color-text-muted)",
          }}
        >
          <ChevronDownIcon size={14} />
        </div>
      </div>
    );
  }
  
  /** Skeleton de Linha */
  function TableRowSkeleton() {
    return (
      <tr>
        {[...Array(7)].map((_, i) => (
          <td
            key={i}
            style={{
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                height: 16,
                background: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                animation: "pulse 1.5s infinite",
                width: i === 6 ? 80 : i === 1 ? "80%" : "60%",
              }}
            />
          </td>
        ))}
      </tr>
    );
  }
  
  /** Estado Vazio */
  function EmptyState({ onNewOrder }: { onNewOrder?: () => void }) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-16) var(--space-6)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          <ClipboardListIcon size={40} />
        </div>
        <h3
          style={{
            fontSize: "var(--font-size-lg)",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "var(--space-2)",
          }}
        >
          Nenhuma ordem de servico encontrada
        </h3>
        <p
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
            maxWidth: 320,
            marginBottom: "var(--space-6)",
          }}
        >
          Comece criando uma nova ordem de servico para seus clientes.
        </p>
        {onNewOrder && (
          <button
            type="button"
            onClick={onNewOrder}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--font-size-sm)",
              fontWeight: 500,
              color: "white",
              background: "var(--color-primary)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <PlusIcon size={16} />
            Criar Nova OS
          </button>
        )}
      </div>
    );
  }
  
  /** Componente de Paginacao */
  function Pagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
  }) {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
    const pageNumbers = useMemo(() => {
      const pages: (number | string)[] = [];
      const maxVisible = 5;
  
      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        if (currentPage <= 3) {
          pages.push(1, 2, 3, 4, "...", totalPages);
        } else if (currentPage >= totalPages - 2) {
          pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
        } else {
          pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
        }
      }
      return pages;
    }, [currentPage, totalPages]);
  
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-4) var(--space-6)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface-elevated)",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        <p
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
          }}
        >
          Mostrando <strong style={{ color: "var(--color-text)" }}>{startItem}</strong> a{" "}
          <strong style={{ color: "var(--color-text)" }}>{endItem}</strong> de{" "}
          <strong style={{ color: "var(--color-text)" }}>{totalItems}</strong> resultados
        </p>
  
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: currentPage === 1 ? "var(--color-text-muted)" : "var(--color-text)",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              opacity: currentPage === 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeftIcon size={16} />
          </button>
  
          {pageNumbers.map((page, idx) =>
            page === "..." ? (
              <span
                key={`ellipsis-${idx}`}
                style={{
                  padding: "0 var(--space-2)",
                  color: "var(--color-text-muted)",
                }}
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page as number)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 32,
                  height: 32,
                  padding: "0 var(--space-2)",
                  borderRadius: "var(--radius-md)",
                  border:
                    currentPage === page
                      ? "1px solid var(--color-primary)"
                      : "1px solid transparent",
                  background:
                    currentPage === page ? "rgba(14, 165, 233, 0.1)" : "transparent",
                  color: currentPage === page ? "var(--color-primary)" : "var(--color-text)",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: currentPage === page ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {page}
              </button>
            )
          )}
  
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: currentPage === totalPages ? "var(--color-text-muted)" : "var(--color-text)",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              opacity: currentPage === totalPages ? 0.5 : 1,
            }}
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
    );
  }
  
  /* ============================================================================
     COMPONENTE PRINCIPAL
  ============================================================================ */
  
  export function ServiceOrdersListView({
    orders,
    metrics,
    technicians,
    isLoading = false,
    onNewOrder,
    onView,
    onEdit,
    onPrint,
    onSearch,
    onFilterStatus,
    onFilterTechnician,
    pagination,
  }: ServiceOrdersListViewProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [technicianFilter, setTechnicianFilter] = useState("");
  
    const handleSearch = (value: string) => {
      setSearchQuery(value);
      onSearch?.(value);
    };
  
    const handleStatusFilter = (value: string) => {
      setStatusFilter(value);
      onFilterStatus?.(value ? (value as ServiceOrderStatus) : null);
    };
  
    const handleTechnicianFilter = (value: string) => {
      setTechnicianFilter(value);
      onFilterTechnician?.(value || null);
    };
  
    const statusOptions = Object.entries(statusConfig).map(([key, config]) => ({
      value: key,
      label: config.label,
    }));
  
    const technicianOptions = technicians.map((t) => ({
      value: t.id,
      label: t.name,
    }));
  
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          maxWidth: 1400,
          margin: "0 auto",
          padding: "var(--space-6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-4)",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: 700,
                color: "var(--color-text)",
                marginBottom: "var(--space-1)",
              }}
            >
              Ordens de Servico
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-muted)",
              }}
            >
              Gerencie todas as OS da sua empresa
            </p>
          </div>
          <button
            type="button"
            onClick={onNewOrder}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--font-size-sm)",
              fontWeight: 600,
              color: "white",
              background: "var(--color-primary)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            }}
          >
            <PlusIcon size={18} />
            Nova OS
          </button>
        </div>
  
        {/* Cards de Metricas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <MetricCard
            title="OS Hoje"
            value={metrics.todayTotal}
            icon={<CalendarIcon size={24} />}
            variant="primary"
          />
          <MetricCard
            title="Em Execucao"
            value={metrics.inExecution}
            icon={<TruckIcon size={24} />}
            variant="warning"
          />
          <MetricCard
            title="Aguardando Pecas"
            value={metrics.awaitingParts}
            icon={<PackageIcon size={24} />}
            variant="error"
          />
          <MetricCard
            title="Concluidas (Mes)"
            value={metrics.completedMonth}
            icon={<CheckCircleIcon size={24} />}
            variant="success"
          />
        </div>
  
        {/* Filtros e Busca */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            background: "var(--color-surface-elevated)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Campo de Busca */}
          <div
            style={{
              position: "relative",
              flex: "1 1 280px",
              minWidth: 200,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "var(--space-3)",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
                pointerEvents: "none",
              }}
            >
              <SearchIcon size={18} />
            </div>
            <input
              type="text"
              placeholder="Buscar por numero da OS ou cliente..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3) var(--space-2) var(--space-10)",
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                outline: "none",
              }}
            />
          </div>
  
          {/* Separador Visual */}
          <div
            style={{
              width: 1,
              height: 24,
              background: "var(--color-border)",
              display: "none",
            }}
            className="hidden md:block"
          />
  
          {/* Filtros */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              color: "var(--color-text-muted)",
            }}
          >
            <FilterIcon size={16} />
            <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Filtros:</span>
          </div>
  
          <SelectDropdown
            value={statusFilter}
            onChange={handleStatusFilter}
            options={statusOptions}
            placeholder="Todos os status"
          />
  
          <SelectDropdown
            value={technicianFilter}
            onChange={handleTechnicianFilter}
            options={technicianOptions}
            placeholder="Todos os tecnicos"
          />
        </div>
  
        {/* Tabela */}
        <div
          style={{
            background: "var(--color-surface-elevated)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 800,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {[
                    { key: "number", label: "Numero", width: "10%" },
                    { key: "client", label: "Cliente", width: "20%" },
                    { key: "technician", label: "Tecnico", width: "18%" },
                    { key: "type", label: "Tipo", width: "12%" },
                    { key: "status", label: "Status", width: "12%" },
                    { key: "date", label: "Data", width: "12%" },
                    { key: "value", label: "Valor", width: "10%" },
                    { key: "actions", label: "", width: "6%" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: 600,
                        color: "var(--color-text-muted)",
                        textAlign: "left",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        width: col.width,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    {[...Array(5)].map((_, i) => (
                      <TableRowSkeleton key={i} />
                    ))}
                  </>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState onNewOrder={onNewOrder} />
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--color-surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Numero */}
                      <td
                        style={{
                          padding: "var(--space-4)",
                          fontSize: "var(--font-size-sm)",
                          fontWeight: 600,
                          color: "var(--color-primary)",
                        }}
                      >
                        #{order.number}
                      </td>
  
                      {/* Cliente */}
                      <td
                        style={{
                          padding: "var(--space-4)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-text)",
                          fontWeight: 500,
                        }}
                      >
                        {order.clientName}
                      </td>
  
                      {/* Tecnico */}
                      <td style={{ padding: "var(--space-4)" }}>
                        <TechnicianAvatar technician={order.technician} />
                      </td>
  
                      {/* Tipo */}
                      <td
                        style={{
                          padding: "var(--space-4)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {serviceTypeLabels[order.serviceType]}
                      </td>
  
                      {/* Status */}
                      <td style={{ padding: "var(--space-4)" }}>
                        <StatusBadge status={order.status} />
                      </td>
  
                      {/* Data */}
                      <td
                        style={{
                          padding: "var(--space-4)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {formatDate(order.scheduledAt || order.openedAt)}
                      </td>
  
                      {/* Valor */}
                      <td
                        style={{
                          padding: "var(--space-4)",
                          fontSize: "var(--font-size-sm)",
                          fontWeight: 600,
                          color: "var(--color-text)",
                        }}
                      >
                        {formatCurrency(order.totalValue)}
                      </td>
  
                      {/* Acoes */}
                      <td style={{ padding: "var(--space-4)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          <ActionButton
                            icon={<EyeIcon />}
                            label="Visualizar"
                            onClick={() => onView?.(order)}
                          />
                          <ActionButton
                            icon={<PencilIcon />}
                            label="Editar"
                            onClick={() => onEdit?.(order)}
                          />
                          <ActionButton
                            icon={<PrinterIcon />}
                            label="Imprimir"
                            onClick={() => onPrint?.(order)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
  
          {/* Paginacao */}
          {pagination && !isLoading && orders.length > 0 && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemsPerPage={pagination.itemsPerPage}
              onPageChange={pagination.onPageChange}
            />
          )}
        </div>
  
        {/* Estilos CSS para animacao */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }
  
  /* ============================================================================
     EXPORTS
  ============================================================================ */
  
  export type {
    ServiceOrder,
    ServiceOrderStatus,
    ServiceType,
    Technician,
    ServiceOrderMetrics,
    ServiceOrdersListViewProps,
  };
  
  export { statusConfig, serviceTypeLabels, formatCurrency, formatDate };
  