"use client";

import type { ReactNode } from "react";
import { LeadModalProvider } from "@/context/LeadModalContext";
import { PlatformBrandingProvider } from "@/context/PlatformBrandingContext";
import type { PlatformBrandingOut } from "@/lib/platform-branding";
import { BrandingHead } from "./BrandingHead";
import { SiteSettingsProvider } from "./SiteSettingsProvider";

type Props = {
  children: ReactNode;
  initialBranding?: PlatformBrandingOut;
};

export function Providers({ children, initialBranding }: Props) {
  return (
    <PlatformBrandingProvider initialBranding={initialBranding}>
      <SiteSettingsProvider>
        <BrandingHead />
        <LeadModalProvider>{children}</LeadModalProvider>
      </SiteSettingsProvider>
    </PlatformBrandingProvider>
  );
}
