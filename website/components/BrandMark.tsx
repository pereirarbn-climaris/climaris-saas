"use client";

import Link from "next/link";
import { usePlatformBranding } from "@/context/PlatformBrandingContext";
import { siteConfig } from "@/lib/site-config";

type Props = {
  onDark?: boolean;
  showName?: boolean;
};

function FallbackMark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-card ${
        onDark ? "bg-white/15" : "bg-hero"
      }`}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 ${onDark ? "text-white" : "text-white"}`}
      >
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    </span>
  );
}

export function BrandMark({ onDark = false, showName = false }: Props) {
  const { branding, logoSrc } = usePlatformBranding();
  const hasLogo = branding.has_logo && Boolean(logoSrc);
  const name = branding.platform_name.trim() || siteConfig.name;
  const logoSrcWithCache =
    logoSrc && branding.logo_updated_at
      ? `${logoSrc}${logoSrc.includes("?") ? "&" : "?"}t=${encodeURIComponent(branding.logo_updated_at)}`
      : logoSrc;

  return (
    <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label={name}>
      {hasLogo ? (
        <img
          src={logoSrcWithCache}
          alt=""
          className="h-10 w-auto max-w-[10rem] shrink-0 object-contain"
        />
      ) : (
        <FallbackMark onDark={onDark} />
      )}
      {showName && !hasLogo ? (
        <span className={`text-lg font-bold tracking-tight ${onDark ? "text-white" : "text-text"}`}>
          {name}
        </span>
      ) : null}
    </Link>
  );
}
