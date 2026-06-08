import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchPlatformBranding,
  resolvePlatformBrandingAssetUrl,
  type PlatformBrandingOut,
} from "../api/platformBranding";

const DEFAULT_BRANDING: PlatformBrandingOut = {
  platform_name: "Climaris",
  has_logo: false,
  has_favicon: false,
  logo_url: null,
  favicon_url: null,
  logo_updated_at: null,
  favicon_updated_at: null,
};

type PlatformBrandingContextValue = {
  branding: PlatformBrandingOut;
  loading: boolean;
  logoSrc: string | undefined;
  faviconSrc: string | undefined;
  refreshBranding: () => Promise<void>;
  setBranding: (next: PlatformBrandingOut) => void;
};

const PlatformBrandingContext = createContext<PlatformBrandingContextValue | null>(null);

function applyDocumentBranding(branding: PlatformBrandingOut) {
  const title = branding.platform_name.trim() || "Climaris";
  if (document.title !== title) {
    document.title = title;
  }

  const faviconHref = resolvePlatformBrandingAssetUrl(branding.favicon_url);
  const linkId = "platform-favicon";
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (faviconHref) {
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (link.href !== faviconHref) {
      link.href = faviconHref;
      link.type = "image/png";
    }
  } else if (link) {
    link.remove();
  }
}

export function PlatformBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<PlatformBrandingOut>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const next = await fetchPlatformBranding();
      setBrandingState(next);
      applyDocumentBranding(next);
    } catch {
      setBrandingState(DEFAULT_BRANDING);
      applyDocumentBranding(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    applyDocumentBranding(branding);
  }, [branding]);

  const setBranding = useCallback((next: PlatformBrandingOut) => {
    setBrandingState(next);
    applyDocumentBranding(next);
  }, []);

  const value = useMemo(
    () => ({
      branding,
      loading,
      logoSrc: resolvePlatformBrandingAssetUrl(branding.logo_url),
      faviconSrc: resolvePlatformBrandingAssetUrl(branding.favicon_url),
      refreshBranding,
      setBranding,
    }),
    [branding, loading, refreshBranding, setBranding],
  );

  return <PlatformBrandingContext.Provider value={value}>{children}</PlatformBrandingContext.Provider>;
}

export function usePlatformBranding(): PlatformBrandingContextValue {
  const ctx = useContext(PlatformBrandingContext);
  if (!ctx) {
    throw new Error("usePlatformBranding deve ser usado dentro de PlatformBrandingProvider.");
  }
  return ctx;
}
