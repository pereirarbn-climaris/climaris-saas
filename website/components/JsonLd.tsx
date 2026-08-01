import { siteConfig } from "@/lib/site-config";
import {
  absoluteBrandingAssetUrl,
  fetchPlatformBranding,
} from "@/lib/platform-branding";

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export async function LocalBusinessJsonLd() {
  const branding = await fetchPlatformBranding();
  const cnpjFormatted = siteConfig.cnpj ? formatCnpj(siteConfig.cnpj) : null;
  const logo =
    (branding.has_logo && absoluteBrandingAssetUrl(branding.logo_url)) ||
    `${siteConfig.url}/icon.svg`;
  const orgName = branding.platform_name.trim() || siteConfig.name;

  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteConfig.url}/#organization`,
    name: orgName,
    legalName: siteConfig.legalName,
    url: siteConfig.url,
    email: siteConfig.email,
    description: siteConfig.description,
    logo,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.postalCode,
      addressCountry: siteConfig.address.country,
    },
  };

  if (siteConfig.phone) {
    organization.telephone = siteConfig.phone;
  }

  if (cnpjFormatted) {
    organization.taxID = cnpjFormatted;
  }

  const software: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteConfig.url}/#software`,
    name: orgName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    url: siteConfig.url,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
      description: "Contato comercial disponível mediante formulário",
    },
    provider: { "@id": `${siteConfig.url}/#organization` },
    featureList: siteConfig.productPillars,
    keywords: siteConfig.keywords.join(", "),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }}
      />
    </>
  );
}
