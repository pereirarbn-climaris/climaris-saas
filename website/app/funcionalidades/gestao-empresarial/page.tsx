import { notFound } from "next/navigation";

import { FeatureDetailPageClient } from "@/components/FeatureDetailPageClient";

import { getFeaturePage } from "@/lib/feature-pages";

import { buildPageMetadata } from "@/lib/metadata";



const SLUG = "gestao-empresarial";



export function generateMetadata() {

  const page = getFeaturePage(SLUG);

  if (!page) return {};

  return buildPageMetadata({

    title: `${page.title} — ERP para Climatização`,

    description: page.heroDescription,

    path: `/funcionalidades/${SLUG}`,

  });

}



export default function GestaoEmpresarialPage() {

  const page = getFeaturePage(SLUG);

  if (!page) notFound();

  return <FeatureDetailPageClient slug={SLUG} />;

}

