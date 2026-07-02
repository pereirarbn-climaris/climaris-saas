"use client";

import { useEffect, useState } from "react";
import { getFeaturePage, type FeaturePageContent } from "@/lib/feature-pages";
import { fetchPublicWebsitePage, type PublicWebsitePage } from "@/lib/website-pages";
import { FeatureDetailLayout } from "./FeatureDetailLayout";

type Props = {
  slug: string;
};

function toLayoutPage(api: PublicWebsitePage, fallback: FeaturePageContent): FeaturePageContent {
  const iconByKey = new Map(fallback.sections.map((s) => [s.key, s.icon]));
  return {
    slug: api.slug,
    title: api.title,
    subtitle: api.subtitle,
    heroDescription: api.hero_description,
    sections: api.sections.map((section, i) => ({
      key: section.key,
      icon: iconByKey.get(section.key) ?? fallback.sections[i]?.icon ?? fallback.sections[0].icon,
      title: section.title,
      description: section.description,
      bullets: section.bullets,
    })),
    outcomes: api.outcomes,
  };
}

export function FeatureDetailPageClient({ slug }: Props) {
  const fallback = getFeaturePage(slug);
  const [page, setPage] = useState<FeaturePageContent | null>(fallback ?? null);
  const [images, setImages] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!fallback) return;
    void fetchPublicWebsitePage(slug).then((api) => {
      if (!api) return;
      setPage(toLayoutPage(api, fallback));
      setImages(api.images);
      if (typeof document !== "undefined" && api.seo_title) {
        document.title = `${api.seo_title} | Climaris`;
      }
    });
  }, [slug, fallback]);

  if (!page) return null;

  return <FeatureDetailLayout page={page} images={images} />;
}
