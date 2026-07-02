import type { Metadata } from "next";
import { siteConfig } from "./site-config";

type PageMeta = {
  title: string;
  description: string;
  path: string;
};

export function buildPageMetadata({ title, description, path }: PageMeta): Metadata {
  const canonical = `${siteConfig.url}${path}`;
  const fullTitle = path === "/" ? siteConfig.title : `${title} | ${siteConfig.name}`;

  return {
    title: fullTitle,
    description,
    keywords: [...siteConfig.keywords, ...siteConfig.services],
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: canonical,
      siteName: siteConfig.name,
      title: fullTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
    other: {
      "geo.region": `BR-${siteConfig.address.state}`,
      "geo.placename": siteConfig.address.city,
      "geo.position": `${siteConfig.geo.latitude};${siteConfig.geo.longitude}`,
      ICBM: `${siteConfig.geo.latitude}, ${siteConfig.geo.longitude}`,
      "product:category": "Software B2B — Gestão para climatização",
      "product:keywords": siteConfig.keywords.slice(0, 5).join(", "),
    },
  };
}
