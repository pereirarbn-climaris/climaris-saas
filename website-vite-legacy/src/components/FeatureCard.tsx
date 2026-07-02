import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

export function FeatureCard({ icon: Icon, title, description, bullets }: Props) {
  return (
    <article className="group rounded-card border border-border bg-surface-elevated p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text">{title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-text-muted">{description}</p>
      <ul className="space-y-2 text-sm text-text-muted">
        {bullets.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-light" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
