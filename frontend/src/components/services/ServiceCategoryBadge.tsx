import { formatCategoryLabel } from "./services.utils";
import tableStyles from "./ServicesListTable.module.css";

type Props = {
  label: string;
};

export function ServiceCategoryBadge({ label }: Props) {
  return <span className={tableStyles.categoryTag}>{formatCategoryLabel(label)}</span>;
}

type GroupProps = {
  categories: string[];
};

export function ServiceCategoryBadgeGroup({ categories }: GroupProps) {
  if (categories.length === 0) {
    return <ServiceCategoryBadge label="Sem categoria" />;
  }

  const first = categories[0];
  const extra = categories.length - 1;
  const tooltip = categories.slice(1).map(formatCategoryLabel).join(", ");

  return (
    <div className={tableStyles.categoryBadges}>
      <ServiceCategoryBadge label={first} />
      {extra > 0 ? (
        <span className={tableStyles.moreBadge} title={tooltip}>
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
