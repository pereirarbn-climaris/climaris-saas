import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LocalBusinessJsonLd } from "@/components/JsonLd";
import { Providers } from "@/components/Providers";
import { buildPageMetadata } from "@/lib/metadata";
import {
  absoluteBrandingAssetUrl,
  brandingFaviconHref,
  brandingFaviconMime,
  fetchPlatformBranding,
} from "@/lib/platform-branding";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await fetchPlatformBranding();
  const favicon = absoluteBrandingAssetUrl(brandingFaviconHref(branding)) ?? "/icon.svg";
  const appName = branding.platform_name.trim() || siteConfig.name;

  return {
    ...buildPageMetadata({
      title: siteConfig.title,
      description: siteConfig.description,
      path: "/",
    }),
    metadataBase: new URL(siteConfig.url),
    applicationName: appName,
    authors: [{ name: appName, url: siteConfig.url }],
    creator: appName,
    publisher: appName,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    icons: {
      icon: favicon,
      shortcut: favicon,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await fetchPlatformBranding();
  const faviconHref = brandingFaviconHref(branding);
  const faviconType = brandingFaviconMime(branding);

  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <head>
        <link rel="icon" href={faviconHref} type={faviconType} />
        <link rel="shortcut icon" href={faviconHref} type={faviconType} />
        <link rel="apple-touch-icon" href={faviconHref} />
      </head>
      <body className="min-h-full flex flex-col">
        <LocalBusinessJsonLd />
        <Providers initialBranding={branding}>{children}</Providers>
      </body>
    </html>
  );
}
