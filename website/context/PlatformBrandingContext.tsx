"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchPlatformBranding,
  resolvePlatformBrandingAssetUrl,
  type PlatformBrandingOut,
} from "@/lib/platform-branding";
import { siteConfig } from "@/lib/site-config";

const DEFAULT_BRANDING: PlatformBrandingOut = {
  platform_name: siteConfig.name,
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
};

const PlatformBrandingContext = createContext<PlatformBrandingContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  initialBranding?: PlatformBrandingOut;
};

export function PlatformBrandingProvider({ children, initialBranding }: ProviderProps) {
  const [branding, setBranding] = useState<PlatformBrandingOut>(initialBranding ?? DEFAULT_BRANDING);
  const [loading, setLoading] = useState(!initialBranding);

  const refreshBranding = useCallback(async () => {
    try {
      const next = await fetchPlatformBranding();
      setBranding(next);
    } catch {
      setBranding(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  const value = useMemo(
    () => ({
      branding,
      loading,
      logoSrc: resolvePlatformBrandingAssetUrl(branding.logo_url),
      faviconSrc: resolvePlatformBrandingAssetUrl(branding.favicon_url),
      refreshBranding,
    }),
    [branding, loading, refreshBranding],
  );

  return (
    <PlatformBrandingContext.Provider value={value}>{children}</PlatformBrandingContext.Provider>
  );
}

export function usePlatformBranding(): PlatformBrandingContextValue {
  const ctx = useContext(PlatformBrandingContext);
  if (!ctx) {
    throw new Error("usePlatformBranding deve ser usado dentro de PlatformBrandingProvider.");
  }
  return ctx;
}
