import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { featurePagePath } from "@/lib/feature-pages";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
  slug?: string;
  href?: string;
};

export function FeatureCard({ icon: Icon, title, description, bullets, slug, href }: Props) {
  const link = href ?? (slug ? featurePagePath(slug) : undefined);

  const content = (
    <>
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text">{title}</h3>
      <p className="text-sm leading-relaxed text-text-muted">{description}</p>
      {bullets?.length ? (
        <ul className="mt-4 space-y-2 text-sm text-text-muted">
          {bullets.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-light" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {link ? (
        <p className="mt-5 inline-flex items-center text-sm font-semibold text-primary">
          Conhecer módulo
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </p>
      ) : null}
    </>
  );

  if (link) {
    return (
      <Link
        href={link}
        className="group block rounded-card border border-border bg-surface-elevated p-6 shadow-card transition hover:-translate-y-1 hover:border-primary/25 hover:shadow-card-hover"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rounded-card border border-border bg-surface-elevated p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
      {content}
    </article>
  );
}
