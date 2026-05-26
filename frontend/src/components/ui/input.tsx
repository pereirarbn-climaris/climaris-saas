import * as React from "react";
import { cn } from "../../lib/utils";
import styles from "./input.module.css";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} className={cn(styles.input, className)} {...props} />
));
Input.displayName = "Input";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(styles.input, styles.select, className)} {...props} />
));
Select.displayName = "Select";
