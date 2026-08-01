import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import type { ServiceFormValues } from "./serviceForm.types";
import styles from "./service-form.module.css";

type Props = {
  values: Pick<
    ServiceFormValues,
    "visible_in_service_order" | "visible_in_pmoc" | "visible_in_contract"
  >;
  disabled?: boolean;
  onChange: <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => void;
};

function CheckboxChip({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`${styles.checkboxChip} ${checked ? styles.checkboxChipChecked : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function ServiceApplicationsCard({ values, disabled, onChange }: Props) {
  return (
    <div className={styles.sectionBlock}>
      <h3 className={clientStyles.cardTitle}>Onde este serviço aparece</h3>
      <p className={clientStyles.cardHint}>
        Selecione em quais módulos o serviço ficará disponível para seleção.
      </p>
      <div className={styles.checkboxGrid}>
        <CheckboxChip
          checked={values.visible_in_service_order}
          label="Ordem de Serviço"
          disabled={disabled}
          onChange={(checked) => onChange("visible_in_service_order", checked)}
        />
        <CheckboxChip
          checked={values.visible_in_pmoc}
          label="PMOC"
          disabled={disabled}
          onChange={(checked) => onChange("visible_in_pmoc", checked)}
        />
        <CheckboxChip
          checked={values.visible_in_contract}
          label="Contrato"
          disabled={disabled}
          onChange={(checked) => onChange("visible_in_contract", checked)}
        />
      </div>
    </div>
  );
}
