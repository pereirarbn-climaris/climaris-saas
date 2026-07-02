"use client";

import { useEffect } from "react";
import { usePlatformBranding } from "@/context/PlatformBrandingContext";
import {
  brandingFaviconHref,
  brandingFaviconMime,
  resolvePlatformBrandingAssetUrl,
} from "@/lib/platform-branding";

function syncIconLink(rel: string, href: string, type: string) {
  const selector = `link[rel="${rel}"]`;
  let link = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  link.type = type;
}

export function BrandingHead() {
  const { branding } = usePlatformBranding();

  useEffect(() => {
    const relativeHref = brandingFaviconHref(branding);
    const resolved = resolvePlatformBrandingAssetUrl(relativeHref) ?? relativeHref;
    const href = resolved.startsWith("http") ? resolved : `${window.location.origin}${resolved}`;
    const type = brandingFaviconMime(branding);

    syncIconLink("icon", href, type);
    syncIconLink("shortcut icon", href, type);
    syncIconLink("apple-touch-icon", href, type);
  }, [branding]);

  return null;
}
