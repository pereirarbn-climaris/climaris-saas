import { FeatureCard } from "./FeatureCard";
import { productFeatures } from "@/lib/features";

export function FeaturesGrid({ limit }: { limit?: number }) {
  const items = limit ? productFeatures.slice(0, limit) : productFeatures;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </div>
  );
}
