import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import createStyles from "../../pages/pmoc/PmocCreatePage.module.css";

type Props = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function PmocFormCard({ icon, title, subtitle, children }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className={createStyles.cardHeaderRow}>
          <div className={createStyles.cardIcon} aria-hidden>
            {icon}
          </div>
          <div className={createStyles.cardHeaderText}>
            <CardTitle>{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
