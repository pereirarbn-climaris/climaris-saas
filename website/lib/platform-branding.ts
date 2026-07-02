import { cache } from "react";
import brandingBuildSnapshot from "./platform-branding.build.json";
import { siteConfig } from "./site-config";

export type PlatformBrandingOut = {
  platform_name: string;
  has_logo: boolean;
  has_favicon: boolean;
  logo_url: string | null;
  favicon_url: string | null;
  logo_updated_at: string | null;
  favicon_updated_at: string | null;
};

const DEFAULT_BRANDING: PlatformBrandingOut = {
  platform_name: siteConfig.name,
  has_logo: false,
  has_favicon: false,
  logo_url: null,
  favicon_url: null,
  logo_updated_at: null,
  favicon_updated_at: null,
};

export function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

export function resolvePlatformBrandingAssetUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = apiBase();
  return base ? `${base}${url}` : url;
}

export function absoluteBrandingAssetUrl(url: string | null | undefined): string | undefined {
  const resolved = resolvePlatformBrandingAssetUrl(url);
  if (!resolved) return undefined;
  if (resolved.startsWith("http://") || resolved.startsWith("https://")) return resolved;
  return `${siteConfig.url}${resolved}`;
}

/** Caminho relativo para favicon no HTML estático (proxy /api no mesmo host). */
export function brandingFaviconHref(branding: PlatformBrandingOut): string {
  if (branding.has_favicon && branding.favicon_url) {
    return branding.favicon_url;
  }
  if (branding.has_logo && branding.logo_url) {
    return branding.logo_url;
  }
  return "/icon.svg";
}

export function brandingFaviconMime(branding: PlatformBrandingOut): string {
  if (branding.has_favicon) return "image/png";
  if (branding.has_logo) {
    const url = branding.logo_url ?? "";
    if (url.endsWith(".svg")) return "image/svg+xml";
    return "image/png";
  }
  return "image/svg+xml";
}

function buildTimeBranding(): PlatformBrandingOut {
  return { ...DEFAULT_BRANDING, ...(brandingBuildSnapshot as PlatformBrandingOut) };
}

export const fetchPlatformBranding = cache(async (): Promise<PlatformBrandingOut> => {
  const base = apiBase();
  const buildFallback =
    process.env.WEBSITE_BUILD_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    siteConfig.appUrl.replace(/\/$/, "");

  const endpoints: string[] = [];
  if (typeof window === "undefined") {
    endpoints.push("http://127.0.0.1:8000/api/v1/platform/branding");
  }
  if (typeof window !== "undefined") {
    endpoints.push("/api/v1/platform/branding");
  }
  if (base) {
    endpoints.push(`${base}/api/v1/platform/branding`);
  }
  if (buildFallback) {
    endpoints.push(`${buildFallback}/api/v1/platform/branding`);
  }

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) continue;
      const data = (await response.json()) as PlatformBrandingOut;
      return { ...DEFAULT_BRANDING, ...data };
    } catch {
      continue;
    }
  }

  return buildTimeBranding();
});
