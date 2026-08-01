import {
  Snowflake,
  Wrench,
  Thermometer,
  Search,
  SprayCan,
  Droplet,
  Settings,
  Zap,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { ServiceOut } from "../../api/services";
import type { ServiceIconKey } from "./form/serviceForm.types";
import { SERVICE_ICON_OPTIONS } from "./form/serviceForm.types";

export type ServiceIconPalette = {
  background: string;
  color: string;
  shadow: string;
};

export const SERVICE_ICON_PALETTE: Record<ServiceIconKey, ServiceIconPalette> = {
  snowflake: {
    background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(2, 132, 199, 0.28)",
  },
  wrench: {
    background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(22, 163, 74, 0.28)",
  },
  thermometer: {
    background: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(234, 88, 12, 0.28)",
  },
  search: {
    background: "linear-gradient(135deg, #facc15 0%, #ca8a04 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(202, 138, 4, 0.28)",
  },
  spray: {
    background: "linear-gradient(135deg, #c084fc 0%, #9333ea 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(147, 51, 234, 0.28)",
  },
  droplet: {
    background: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(8, 145, 178, 0.28)",
  },
  settings: {
    background: "linear-gradient(135deg, #94a3b8 0%, #475569 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(71, 85, 105, 0.28)",
  },
  zap: {
    background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(217, 119, 6, 0.28)",
  },
  more: {
    background: "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(219, 39, 119, 0.28)",
  },
};

const ICON_COMPONENTS: Record<ServiceIconKey, LucideIcon> = {
  snowflake: Snowflake,
  wrench: Wrench,
  thermometer: Thermometer,
  search: Search,
  spray: SprayCan,
  droplet: Droplet,
  settings: Settings,
  zap: Zap,
  more: MoreHorizontal,
};

export function normalizeServiceIconKey(value: string | null | undefined): ServiceIconKey {
  const key = (value || "").trim().toLowerCase();
  if ((SERVICE_ICON_OPTIONS as string[]).includes(key)) return key as ServiceIconKey;
  return "wrench";
}

export function getServiceIconPalette(iconKey: string | null | undefined): ServiceIconPalette {
  return SERVICE_ICON_PALETTE[normalizeServiceIconKey(iconKey)];
}

export function getServiceIconInlineStyle(iconKey: string | null | undefined): CSSProperties {
  const palette = getServiceIconPalette(iconKey);
  return {
    background: palette.background,
    color: palette.color,
    boxShadow: palette.shadow,
  };
}

function IconGlyph({ iconKey }: { iconKey: ServiceIconKey }) {
  const Icon = ICON_COMPONENTS[iconKey];
  return <Icon />;
}

export function ServiceRowIcon({
  service,
  className,
  style,
}: {
  service: ServiceOut;
  className?: string;
  style?: CSSProperties;
}) {
  const iconKey = normalizeServiceIconKey(service.icon_key);
  const palette = getServiceIconPalette(iconKey);

  return (
    <span
      className={className}
      style={{
        background: palette.background,
        color: palette.color,
        boxShadow: palette.shadow,
        ...style,
      }}
      aria-hidden
    >
      <IconGlyph iconKey={iconKey} />
    </span>
  );
}

export function ServiceIconGlyph({ iconKey }: { iconKey: ServiceIconKey }) {
  return <IconGlyph iconKey={iconKey} />;
}
