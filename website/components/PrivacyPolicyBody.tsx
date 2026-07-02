"use client";

import { useEffect, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { buildLgpdSections, type LgpdSection } from "@/lib/lgpd-content";

export function PrivacyPolicyBody() {
  const { settings } = useSiteSettings();
  const [sections, setSections] = useState<LgpdSection[]>(() => buildLgpdSections(settings));

  useEffect(() => {
    setSections(
      buildLgpdSections({
        legal_name: settings.legal_name,
        trade_name: settings.trade_name,
        cnpj: settings.cnpj,
        address_street: settings.address_street,
        address_city: settings.address_city,
        address_state: settings.address_state,
        address_postal: settings.address_postal,
        contact_email: settings.contact_email,
        dpo_name: settings.dpo_name,
        dpo_email: settings.dpo_email,
      }),
    );
  }, [settings]);

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <article key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="mb-3 text-xl font-semibold text-text">{section.title}</h2>
          <div className="space-y-3 text-sm leading-relaxed text-text-muted sm:text-base">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.list ? (
              <ul className="list-disc space-y-2 pl-5">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.footer ? <p>{section.footer}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
