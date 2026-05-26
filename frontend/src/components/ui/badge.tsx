import * as React from "react";
import { cn } from "../../lib/utils";
import styles from "./badge.module.css";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "warning" | "success";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cn(styles.badge, styles[variant], className)} {...props} />;
}
