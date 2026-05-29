import { Check } from "lucide-react";
import styles from "./stepper.module.css";

export type StepperStep = {
  id: number;
  label: string;
};

type StepperProps = {
  steps: StepperStep[];
  currentStep: number;
  className?: string;
};

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav className={`${styles.stepper} ${className ?? ""}`.trim()} aria-label="Etapas">
      {steps.map((step, idx) => {
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <div key={step.id} className={styles.stepItem}>
            <div
              className={`${styles.stepDot} ${active ? styles.stepDotActive : ""} ${done ? styles.stepDotDone : ""}`}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check size={12} aria-hidden /> : step.id}
            </div>
            <span className={`${styles.stepLabel} ${active || done ? styles.stepLabelActive : ""}`}>
              {step.label}
            </span>
            {idx < steps.length - 1 ? (
              <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ""}`} aria-hidden />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
