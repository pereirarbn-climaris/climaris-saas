import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages = [
    "/",
    "/funcionalidades",
    "/funcionalidades/gestao-empresarial",
    "/funcionalidades/agenda-comercial",
    "/planos",
    "/contato",
    "/privacidade",
  ];

  return pages.map((path) => ({
    url: `${siteConfig.url}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
