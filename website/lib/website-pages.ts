import { getFeaturePage, type FeaturePageContent } from "./feature-pages";
import { resolveAssetUrl } from "./public-settings";

export type WebsitePageSection = {
  key: string;
  title: string;
  description: string;
  bullets: string[];
};

export type PublicWebsitePage = {
  slug: string;
  title: string;
  subtitle: string;
  hero_description: string;
  seo_title: string;
  seo_description: string;
  sections: WebsitePageSection[];
  outcomes: string[];
  images: Record<string, string | null>;
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

function fallbackPage(slug: string): PublicWebsitePage | null {
  const page = getFeaturePage(slug);
  if (!page) return null;
  return featurePageToPublic(page);
}

export function featurePageToPublic(page: FeaturePageContent): PublicWebsitePage {
  return {
    slug: page.slug,
    title: page.title,
    subtitle: page.subtitle,
    hero_description: page.heroDescription,
    seo_title: `${page.title} — ERP para Climatização`,
    seo_description: page.heroDescription,
    sections: page.sections.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      bullets: [...s.bullets],
    })),
    outcomes: [...page.outcomes],
    images: {},
  };
}

export async function fetchPublicWebsitePage(slug: string): Promise<PublicWebsitePage | null> {
  const fallback = fallbackPage(slug);
  try {
    const response = await fetch(`${apiBase()}/api/v1/public/website/pages/${slug}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as PublicWebsitePage;
    return data;
  } catch {
    return fallback;
  }
}

export function pageImageUrl(images: Record<string, string | null>, slot: string): string | undefined {
  return resolveAssetUrl(images[slot] ?? null);
}
