import type { ReactNode } from "react";
import styles from "./ServiceOrderForceCloseAdmin.module.css";

type ServiceOrderForceCloseAdminProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ServiceOrderForceCloseAdmin({ checked, onChange }: ServiceOrderForceCloseAdminProps): ReactNode {
  return (
    <div className={styles.wrap}>
      <label className={styles.label}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        Forçar encerramento sem compliance
      </label>
      {checked ? (
        <p className={styles.warning}>Atenção: esta ação será registrada no log de auditoria.</p>
      ) : null}
    </div>
  );
}
