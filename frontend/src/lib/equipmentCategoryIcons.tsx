import type React from "react";

export type CategoryIconKey =
  | "ar_condicionado"
  | "climatizador"
  | "geladeira"
  | "bebedouro"
  | "outros";

export const CATEGORY_ICON_KEYS: CategoryIconKey[] = [
  "ar_condicionado",
  "climatizador",
  "geladeira",
  "bebedouro",
  "outros",
];

export const CATEGORY_ICON_LABELS: Record<CategoryIconKey, string> = {
  ar_condicionado: "Ar-condicionado",
  climatizador: "Climatizador",
  geladeira: "Geladeira",
  bebedouro: "Bebedouro",
  outros: "Outros / genérico",
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconSnowflake: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className,
}) => (
  <svg width={size} height={size} className={className} {...iconProps}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M20 16l-4-4 4-4" />
    <path d="M4 8l4 4-4 4" />
    <path d="M16 4l-4 4-4-4" />
    <path d="M8 20l4-4 4 4" />
  </svg>
);

export const IconWind: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} {...iconProps}>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
    <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
    <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
  </svg>
);

export const IconFridge: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} {...iconProps}>
    <path d="M4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M3 10h18" />
    <path d="M8 6v2" />
    <path d="M8 14v4" />
  </svg>
);

export const IconDroplet: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} {...iconProps}>
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />
  </svg>
);

export const IconBox: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} {...iconProps}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export type CategoryVisualStyle = "sky" | "indigo" | "cyan" | "violet" | "slate";

export type CategoryVisual = {
  iconKey: CategoryIconKey;
  label: string;
  Icon: React.FC<{ size?: number; className?: string }>;
  style: CategoryVisualStyle;
  accentColor: string;
};

const VISUALS: Record<CategoryIconKey, Omit<CategoryVisual, "iconKey">> = {
  ar_condicionado: {
    label: "Ar-condicionado",
    Icon: IconSnowflake,
    style: "sky",
    accentColor: "#0284c7",
  },
  climatizador: {
    label: "Climatizador",
    Icon: IconWind,
    style: "violet",
    accentColor: "#7c3aed",
  },
  geladeira: {
    label: "Geladeira",
    Icon: IconFridge,
    style: "indigo",
    accentColor: "#4f46e5",
  },
  bebedouro: {
    label: "Bebedouro",
    Icon: IconDroplet,
    style: "cyan",
    accentColor: "#0891b2",
  },
  outros: {
    label: "Outros",
    Icon: IconBox,
    style: "slate",
    accentColor: "#64748b",
  },
};

export function iconKeyFromCategoryName(name: string): CategoryIconKey {
  const n = name.toLowerCase();
  if (n.includes("geladeira")) return "geladeira";
  if (n.includes("bebedouro")) return "bebedouro";
  if (n.includes("climatizador")) return "climatizador";
  if (n.includes("ar-condicionado") || n.includes("split")) return "ar_condicionado";
  return "outros";
}

export function normalizeCategoryIconKey(
  iconKey: string | null | undefined,
  categoryName?: string,
): CategoryIconKey {
  const key = (iconKey || "").trim().toLowerCase();
  if (CATEGORY_ICON_KEYS.includes(key as CategoryIconKey)) {
    return key as CategoryIconKey;
  }
  if (categoryName) return iconKeyFromCategoryName(categoryName);
  return "outros";
}

export function getCategoryVisual(
  iconKey: string | null | undefined,
  categoryName?: string,
): CategoryVisual {
  const normalized = normalizeCategoryIconKey(iconKey, categoryName);
  return { iconKey: normalized, ...VISUALS[normalized] };
}

export function isAcLikeIconKey(iconKey: CategoryIconKey): boolean {
  return iconKey === "ar_condicionado" || iconKey === "climatizador";
}

/** Multi-Split (condensadora + evaporadoras) só faz sentido em ar-condicionado. */
export function supportsMultiSplitCategory(iconKey: CategoryIconKey): boolean {
  return iconKey === "ar_condicionado";
}
