"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  defaultPublicSettings,
  fetchPublicWebsiteSettings,
  type PublicWebsiteSettings,
} from "@/lib/public-settings";

type Ctx = {
  settings: PublicWebsiteSettings;
  loading: boolean;
};

const SiteSettingsContext = createContext<Ctx>({
  settings: defaultPublicSettings,
  loading: true,
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicWebsiteSettings>(defaultPublicSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicWebsiteSettings().then((row) => {
      if (!cancelled) {
        setSettings(row);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
