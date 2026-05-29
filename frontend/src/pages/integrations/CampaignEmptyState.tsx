import type { ReactNode } from "react";
import styles from "./CampaignDashboard.module.css";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function CampaignEmptyState({ icon, title, description, action }: Props) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}
