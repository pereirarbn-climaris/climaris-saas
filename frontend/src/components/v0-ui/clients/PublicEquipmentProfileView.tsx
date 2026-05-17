"use client";

import React, { useState } from "react";

// ============================================================================
// TYPES
// ============================================================================

export type EquipmentStatus = "ativo" | "inativo";
export type EquipmentCategory = "ar_condicionado" | "climatizador" | "geladeira" | "bebedouro" | "freezer";
export type MaintenanceEventType = "registro" | "servico" | "instalacao" | "garantia";
export type ViewVariant = "public" | "embedded";

export interface TechnicalSpec {
  id: string;
  label: string;
  value: string;
  unit?: string;
  icon?: "capacity" | "voltage" | "power" | "gas" | "weight" | "dimension" | "efficiency" | "noise";
}

export interface MaintenanceEvent {
  id: string;
  date: string;
  osNumber?: string;
  title: string;
  description?: string;
  technicianName?: string;
  origin?: string;
  type: MaintenanceEventType;
}

export interface ProviderCompany {
  name: string;
  logoUrl?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
}

export interface EquipmentProfileData {
  id: string;
  tag: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
  category: EquipmentCategory;
  technicalSpecs: TechnicalSpec[];
  maintenanceHistory: MaintenanceEvent[];
  provider: ProviderCompany;
  publicUrl?: string;
  installationDate?: string;
  warrantyExpiration?: string;
}

export interface PublicEquipmentProfileViewProps {
  equipment: EquipmentProfileData;
  variant?: ViewVariant;
  onLoginClick?: () => void;
  onViewOrdersClick?: () => void;
  onClose?: () => void;
  className?: string;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const Icons = {
  // Technical spec icons
  capacity: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  voltage: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  power: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  gas: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 22h8M12 11v11M12 11a4 4 0 0 0 4-4c0-3-4-6-4-6s-4 3-4 6a4 4 0 0 0 4 4z" />
    </svg>
  ),
  weight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="5" r="3" />
      <path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.5 8h-11z" />
    </svg>
  ),
  dimension: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 3H3v18h18V3zM9 3v18M3 9h18M3 15h18M15 3v18" />
    </svg>
  ),
  efficiency: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  ),
  noise: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  // UI icons
  checkCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  ),
  xCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  ),
  building: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  ),
  phone: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  mail: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  globe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
    </svg>
  ),
  wrench: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  clipboard: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  ),
  shield: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  calendar: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  user: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  arrowRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  snowflake: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="m20 16-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4" />
    </svg>
  ),
  wind: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  ),
  mapPin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  qrCode: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1" />
    </svg>
  ),
  link: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  copy: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  ),
  externalLink: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  ),
  x: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
};

// ============================================================================
// HELPERS
// ============================================================================

const categoryLabels: Record<EquipmentCategory, string> = {
  ar_condicionado: "Ar-Condicionado",
  climatizador: "Climatizador",
  geladeira: "Geladeira",
  bebedouro: "Bebedouro",
  freezer: "Freezer",
};

const categoryColors: Record<EquipmentCategory, { bg: string; text: string }> = {
  ar_condicionado: { bg: "bg-sky-100", text: "text-sky-700" },
  climatizador: { bg: "bg-violet-100", text: "text-violet-700" },
  geladeira: { bg: "bg-emerald-100", text: "text-emerald-700" },
  bebedouro: { bg: "bg-cyan-100", text: "text-cyan-700" },
  freezer: { bg: "bg-indigo-100", text: "text-indigo-700" },
};

const eventTypeConfig: Record<MaintenanceEventType, { label: string; color: string; dotColor: string }> = {
  registro: { label: "REGISTRO", color: "bg-blue-100 text-blue-700", dotColor: "bg-blue-500" },
  servico: { label: "SERVIÇO", color: "bg-emerald-100 text-emerald-700", dotColor: "bg-emerald-500" },
  instalacao: { label: "INSTALAÇÃO", color: "bg-amber-100 text-amber-700", dotColor: "bg-amber-500" },
  garantia: { label: "GARANTIA", color: "bg-purple-100 text-purple-700", dotColor: "bg-purple-500" },
};

const getSpecIcon = (iconType?: TechnicalSpec["icon"]) => {
  const iconMap = {
    capacity: Icons.wind,
    voltage: Icons.voltage,
    power: Icons.power,
    gas: Icons.gas,
    weight: Icons.weight,
    dimension: Icons.dimension,
    efficiency: Icons.efficiency,
    noise: Icons.noise,
  };
  return iconType ? iconMap[iconType] : Icons.capacity;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateShort = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Status Badge
const StatusBadge: React.FC<{ status: EquipmentStatus }> = ({ status }) => {
  const isActive = status === "ativo";
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
        ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}
      `}
    >
      {isActive ? (
        <Icons.checkCircle className="w-3.5 h-3.5" />
      ) : (
        <Icons.xCircle className="w-3.5 h-3.5" />
      )}
      {isActive ? "Ativo" : "Inativo"}
    </span>
  );
};

// Category Badge
const CategoryBadge: React.FC<{ category: EquipmentCategory }> = ({ category }) => {
  const { bg, text } = categoryColors[category];
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
        ${bg} ${text}
      `}
    >
      {category === "ar_condicionado" || category === "climatizador" ? (
        <Icons.snowflake className="w-3.5 h-3.5" />
      ) : (
        <Icons.snowflake className="w-3.5 h-3.5" />
      )}
      {categoryLabels[category]}
    </span>
  );
};

// Technical Spec Card
const TechnicalSpecCard: React.FC<{ spec: TechnicalSpec }> = ({ spec }) => {
  const IconComponent = getSpecIcon(spec.icon);
  return (
    <div
      className="
        flex flex-col gap-2 p-4 rounded-xl 
        bg-white border border-slate-200
        shadow-[0_1px_2px_rgba(0,0,0,0.04)]
        hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        transition-shadow duration-200
      "
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
          <IconComponent className="w-4 h-4 text-slate-500" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {spec.label}
        </span>
      </div>
      <p className="text-lg font-bold text-slate-900">
        {spec.value}
        {spec.unit && (
          <span className="text-sm font-medium text-slate-500 ml-1">
            {spec.unit}
          </span>
        )}
      </p>
    </div>
  );
};

// Maintenance Event Card
const MaintenanceEventCard: React.FC<{ event: MaintenanceEvent; isLast: boolean }> = ({ event, isLast }) => {
  const config = eventTypeConfig[event.type];
  return (
    <div className="relative flex gap-4">
      {/* Timeline line and dot */}
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full ${config.dotColor} ring-4 ring-white z-10`} />
        {!isLast && (
          <div className="w-0.5 flex-1 bg-slate-200 -mt-1" />
        )}
      </div>

      {/* Event content */}
      <div className="flex-1 pb-5">
        <div
          className="
            p-4 rounded-xl bg-white border border-slate-200
            shadow-[0_1px_2px_rgba(0,0,0,0.04)]
          "
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <time className="text-xs text-slate-500">
              {formatDate(event.date)}
            </time>
            <span
              className={`
                px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                ${config.color}
              `}
            >
              {config.label}
            </span>
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-slate-900 mb-1">
            {event.osNumber && (
              <span className="text-[var(--color-primary)]">OS #{event.osNumber}</span>
            )}
            {event.osNumber && " — "}
            {event.title}
          </h4>

          {/* Description */}
          {event.description && (
            <p className="text-xs text-slate-500 mb-2">
              {event.description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            {event.origin && (
              <span className="flex items-center gap-1">
                <Icons.clipboard className="w-3 h-3" />
                {event.origin}
              </span>
            )}
            {event.technicianName && (
              <span className="flex items-center gap-1">
                <Icons.user className="w-3 h-3" />
                Por: {event.technicianName}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Corporate Header - Baseado no layout de orçamentos
const CorporateHeader: React.FC<{ provider: ProviderCompany }> = ({ provider }) => (
  <div className="mb-0">
    {/* Header Content */}
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-5 sm:p-6">
      {/* Left Side - Logo + Company Info */}
      <div className="flex items-start gap-4">
        {/* Logo */}
        {provider.logoUrl ? (
          <img
            src={provider.logoUrl}
            alt={`Logo ${provider.name}`}
            className="w-14 h-14 object-contain rounded-full border-2 border-slate-200 bg-white flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl font-bold">
              {provider.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Company Details */}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {provider.name}
          </h2>
          <div className="grid grid-cols-1 gap-1 text-xs text-slate-600">
            {provider.cnpj && (
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-slate-500">CNPJ:</span>
                {provider.cnpj}
              </span>
            )}
            {provider.address && (
              <span className="flex items-start gap-1.5">
                <Icons.mapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                <span className="break-words">{provider.address}</span>
              </span>
            )}
            {(provider.city || provider.state) && (
              <span className="text-slate-500 pl-5">
                {provider.city}{provider.city && provider.state && " - "}{provider.state}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Contact Info */}
      <div className="flex flex-col items-start sm:items-end gap-1.5 text-xs text-slate-600 sm:text-right">
        {provider.phone && (
          <span className="flex items-center gap-1.5">
            <Icons.phone className="w-3.5 h-3.5 text-slate-400" />
            {provider.phone}
          </span>
        )}
        {provider.email && (
          <span className="flex items-center gap-1.5">
            <Icons.mail className="w-3.5 h-3.5 text-slate-400" />
            {provider.email}
          </span>
        )}
        {provider.website && (
          <a 
            href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--color-primary)] hover:underline"
          >
            <Icons.globe className="w-3.5 h-3.5" />
            {provider.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </div>

    {/* Blue Divider */}
    <div className="h-1 bg-[var(--color-primary)]" />
  </div>
);

// QR Code / Public Link Section
const QRCodeSection: React.FC<{ publicUrl?: string }> = ({ publicUrl }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!publicUrl) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
        <Icons.qrCode className="w-4 h-4 text-[var(--color-primary)]" />
        Link público (QR Code)
      </h4>
      <p className="text-xs text-slate-500 mb-4">
        O cliente acessa pelo celular para ver dados técnicos e histórico de manutenções.
      </p>
      
      {/* Public Link Preview */}
      <a 
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mb-4"
      >
        <Icons.externalLink className="w-3 h-3" />
        Abrir ficha pública
      </a>

      {/* Copy Button */}
      <button
        onClick={handleCopyLink}
        className="
          w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
          text-sm font-semibold text-white
          bg-[var(--color-primary)]
          hover:bg-[var(--color-primary-hover)]
          transition-colors duration-200
        "
      >
        {copied ? (
          <>
            <Icons.check className="w-4 h-4" />
            Link copiado!
          </>
        ) : (
          <>
            <Icons.copy className="w-4 h-4" />
            Copiar link
          </>
        )}
      </button>

      {/* URL Preview */}
      <div className="mt-3 p-2 bg-slate-50 rounded-lg">
        <p className="text-[10px] text-slate-400 font-mono truncate">
          {publicUrl}
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PublicEquipmentProfileView: React.FC<PublicEquipmentProfileViewProps> = ({
  equipment,
  variant = "public",
  onLoginClick,
  onViewOrdersClick,
  onClose,
  className = "",
}) => {
  const isEmbedded = variant === "embedded";

  // Container classes based on variant
  const containerClasses = isEmbedded
    ? "bg-white"
    : "min-h-screen bg-gradient-to-b from-slate-50 to-white";

  const maxWidthClasses = isEmbedded
    ? "max-w-5xl"
    : "max-w-2xl";

  return (
    <div className={`${containerClasses} ${className}`}>
      {/* Main Container */}
      <div className={`${maxWidthClasses} mx-auto ${isEmbedded ? '' : 'px-4 py-6 sm:px-6 sm:py-8'}`}>
        
        {/* Modal Header for Embedded */}
        {isEmbedded && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
              Ficha do Equipamento
            </h2>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Icons.x className="w-5 h-5 text-slate-500" />
              </button>
            )}
          </div>
        )}

        {/* Corporate Header Card */}
        <div
          className={`
            bg-white overflow-hidden
            ${isEmbedded ? '' : 'rounded-2xl border border-slate-200 shadow-sm mb-4'}
          `}
        >
          <CorporateHeader provider={equipment.provider} />

          {/* Two-column layout for embedded, single column for public */}
          <div className={`${isEmbedded ? 'flex flex-col lg:flex-row' : ''}`}>
            
            {/* Left Column - Equipment Info & Specs */}
            <div className={`${isEmbedded ? 'flex-1 lg:border-r lg:border-slate-200' : ''}`}>
              <div className="p-5 sm:p-6">
                {/* Equipment Identity */}
                <div className="mb-5">
                  <h1 className="text-2xl font-bold text-slate-900 mb-1 text-balance">
                    {equipment.tag}
                  </h1>
                  <p className="text-base text-slate-600 font-medium">
                    {equipment.brand} · {equipment.model}
                  </p>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <StatusBadge status={equipment.status} />
                  <CategoryBadge category={equipment.category} />
                </div>

                {/* Serial Number */}
                <div className="text-sm text-slate-600 mb-5">
                  <span className="font-medium">Nº de série:</span>{" "}
                  <span className="font-mono">{equipment.serialNumber}</span>
                </div>

                {/* Technical Specs */}
                {equipment.technicalSpecs.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Icons.wrench className="w-4 h-4 text-slate-400" />
                      Dados técnicos
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {equipment.technicalSpecs.map((spec) => (
                        <TechnicalSpecCard key={spec.id} spec={spec} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Installation and Warranty */}
                {(equipment.installationDate || equipment.warrantyExpiration) && (
                  <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-200">
                    {equipment.installationDate && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Icons.calendar className="w-4 h-4" />
                        <span>
                          <span className="font-medium">Instalação:</span>{" "}
                          {formatDateShort(equipment.installationDate)}
                        </span>
                      </div>
                    )}
                    {equipment.warrantyExpiration && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Icons.shield className="w-4 h-4" />
                        <span>
                          <span className="font-medium">Garantia até:</span>{" "}
                          {formatDateShort(equipment.warrantyExpiration)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Timeline & QR Code (only in embedded mode) */}
            {isEmbedded && (
              <div className="lg:w-[400px] p-5 sm:p-6 bg-slate-50">
                {/* Maintenance History */}
                {equipment.maintenanceHistory.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <Icons.clipboard className="w-4 h-4 text-slate-400" />
                      Histórico de manutenções
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Serviços registrados neste aparelho.
                    </p>

                    {/* Timeline */}
                    <div className="relative max-h-[300px] overflow-y-auto pr-2">
                      {equipment.maintenanceHistory.map((event, index) => (
                        <MaintenanceEventCard
                          key={event.id}
                          event={event}
                          isLast={index === equipment.maintenanceHistory.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* QR Code Section */}
                <QRCodeSection publicUrl={equipment.publicUrl} />
              </div>
            )}
          </div>
        </div>

        {/* Cards for Public variant only */}
        {!isEmbedded && (
          <>
            {/* Maintenance History Card */}
            {equipment.maintenanceHistory.length > 0 && (
              <div
                className="
                  bg-white rounded-2xl border border-slate-200
                  shadow-sm p-5 sm:p-6 mb-4
                "
              >
                <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Icons.clipboard className="w-5 h-5 text-[var(--color-primary)]" />
                  Histórico de manutenções
                </h3>
                <p className="text-xs text-slate-500 mb-5">
                  Serviços registrados neste aparelho. Não exibe dados pessoais do cliente.
                </p>

                {/* Timeline */}
                <div className="relative">
                  {equipment.maintenanceHistory.map((event, index) => (
                    <MaintenanceEventCard
                      key={event.id}
                      event={event}
                      isLast={index === equipment.maintenanceHistory.length - 1}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State for Maintenance */}
            {equipment.maintenanceHistory.length === 0 && (
              <div
                className="
                  bg-white rounded-2xl border border-slate-200
                  shadow-sm p-8 mb-4 text-center
                "
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                  <Icons.clipboard className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">
                  Nenhuma manutenção registrada
                </h3>
                <p className="text-sm text-slate-500">
                  Este equipamento ainda não possui histórico de serviços.
                </p>
              </div>
            )}

            {/* Technician Login CTA */}
            <div
              className="
                bg-white rounded-2xl border border-slate-200
                shadow-sm p-5 sm:p-6
              "
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
                  <Icons.user className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    É técnico da empresa?
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Após login, abra a OS do cliente e vincule cada serviço ao aparelho correspondente.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onLoginClick}
                      className="
                        inline-flex items-center gap-2 px-4 py-2 rounded-lg
                        text-sm font-semibold text-[var(--color-primary)]
                        bg-[var(--color-primary)]/10
                        hover:bg-[var(--color-primary)]/20
                        transition-colors duration-200
                      "
                    >
                      Entrar
                      <Icons.arrowRight className="w-4 h-4" />
                    </button>
                    {onViewOrdersClick && (
                      <button
                        onClick={onViewOrdersClick}
                        className="
                          inline-flex items-center gap-2 px-4 py-2 rounded-lg
                          text-sm font-semibold text-white
                          bg-[var(--color-primary)]
                          hover:bg-[var(--color-primary-hover)]
                          transition-colors duration-200
                        "
                      >
                        Abrir ordens de serviço
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 text-center">
              <p className="text-[11px] text-slate-400">
                Ficha pública do equipamento • Powered by{" "}
                <a
                  href="https://climaris.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  Climaris
                </a>
              </p>
            </footer>
          </>
        )}

        {/* Footer Actions for Embedded */}
        {isEmbedded && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
            {onClose && (
              <button
                onClick={onClose}
                className="
                  px-4 py-2 rounded-lg text-sm font-medium
                  text-slate-600 bg-white border border-slate-200
                  hover:bg-slate-50 transition-colors
                "
              >
                Fechar
              </button>
            )}
            {onViewOrdersClick && (
              <button
                onClick={onViewOrdersClick}
                className="
                  px-4 py-2 rounded-lg text-sm font-medium
                  text-white bg-[var(--color-primary)]
                  hover:bg-[var(--color-primary-hover)] transition-colors
                "
              >
                Ver ordens de serviço
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MOCK DATA FOR TESTING
// ============================================================================

export const mockEquipmentProfile: EquipmentProfileData = {
  id: "056fa1f7-5be5-4542-9965-a9fdcb1a5155",
  tag: "Entrada inferior",
  brand: "Ecobrisa",
  model: "MV60",
  serialNumber: "000000000",
  status: "ativo",
  category: "climatizador",
  installationDate: "2024-01-15T10:00:00Z",
  warrantyExpiration: "2026-01-15T10:00:00Z",
  provider: {
    name: "Ar Ideal Climatizadora",
    cnpj: "12.345.678/0001-90",
    phone: "(16) 99999-9999",
    email: "contato@arideal.com.br",
    website: "www.arideal.com.br",
    address: "Avenida Paulo Antonio Ribeiro Demarco, 413",
    city: "Araraquara",
    state: "SP",
  },
  technicalSpecs: [
    { id: "1", label: "Capacidade", value: "60000", unit: "m³/h", icon: "capacity" },
    { id: "2", label: "Tensão", value: "220", unit: "V", icon: "voltage" },
  ],
  maintenanceHistory: [
    {
      id: "1",
      date: "2026-05-16T19:15:00Z",
      osNumber: "19",
      title: "Higienização de Climatizador",
      origin: "Vinculação no app",
      technicianName: "Robson Pereira",
      type: "registro",
    },
    {
      id: "2",
      date: "2026-05-14T14:40:00Z",
      osNumber: "19",
      title: "OS #19 concluída — Higienização de Climatizador",
      type: "servico",
    },
  ],
  publicUrl: "https://app.climaris.com.br/p/e/056fa1f7-5be5-4542-9965-a9fdcb1a5155",
};

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*
// Public page (acessível via QR Code)
import { PublicEquipmentProfileView, mockEquipmentProfile } from '@/components/v0-ui/clients';

export default function PublicEquipmentPage() {
  return (
    <PublicEquipmentProfileView
      equipment={mockEquipmentProfile}
      variant="public"
      onLoginClick={() => router.push('/login')}
      onViewOrdersClick={() => router.push('/app/service-orders')}
    />
  );
}

// Embedded in modal (dentro do painel administrativo)
<PublicEquipmentProfileView
  equipment={selectedEquipment}
  variant="embedded"
  onClose={() => setShowModal(false)}
  onViewOrdersClick={() => router.push(`/app/service-orders?equipment=${selectedEquipment.id}`)}
/>
*/
