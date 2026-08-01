import { FormSwitch } from "../../ui/form-switch";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import type { ServiceFormErrors, ServiceFormValues } from "./serviceForm.types";
import styles from "./service-form.module.css";

type Props = {
  values: Pick<
    ServiceFormValues,
    "preventive_enabled" | "preventive_interval_type" | "preventive_interval_value"
  >;
  errors: Pick<ServiceFormErrors, "preventive_interval_value">;
  disabled?: boolean;
  onChange: <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => void;
};

export function PreventiveManagementCard({ values, errors, disabled, onChange }: Props) {
  return (
    <div className={styles.sectionBlock}>
      <h3 className={clientStyles.cardTitle}>Gestão preventiva</h3>
      <p className={clientStyles.cardHint}>
        Quando ativada, este serviço entra nos alertas da Gestão preventiva (com histórico de
        realização por cliente).
      </p>

      <div className={clientStyles.switchInlineRow}>
        <FormSwitch
          id="sf-preventive-enabled"
          checked={values.preventive_enabled}
          onChange={(checked) => onChange("preventive_enabled", checked)}
          disabled={disabled}
          ariaLabel="Ativar gestão preventiva"
        />
        <span className={clientStyles.switchInlineLabel} id="sf-preventive-enabled-label">
          Ativar gestão preventiva
        </span>
        <span className={clientStyles.statusRowLabel}>{values.preventive_enabled ? "Sim" : "Não"}</span>
      </div>

      {values.preventive_enabled ? (
        <div className={styles.preventiveFieldsRow}>
          <div className={clientStyles.field}>
            <label className={clientStyles.fieldLabel} htmlFor="sf-preventive-type">
              Unidade
            </label>
            <select
              id="sf-preventive-type"
              className={clientStyles.fieldSelect}
              value={values.preventive_interval_type}
              disabled={disabled}
              onChange={(e) => {
                const nextType = e.target.value as ServiceFormValues["preventive_interval_type"];
                onChange("preventive_interval_type", nextType);
                if (nextType === "days" && !values.preventive_interval_value) {
                  onChange("preventive_interval_value", "30");
                }
              }}
            >
              <option value="months">Meses</option>
              <option value="years">Anos</option>
              <option value="days">Dias</option>
            </select>
          </div>

          <div className={clientStyles.field}>
            <label
              className={`${clientStyles.fieldLabel} ${errors.preventive_interval_value ? clientStyles.fieldLabelError : ""}`}
              htmlFor="sf-preventive-value"
            >
              {values.preventive_interval_type === "days"
                ? "Quantidade de dias"
                : "Intervalo (1 a 12)"}
            </label>
            {values.preventive_interval_type === "days" ? (
              <input
                id="sf-preventive-value"
                className={`${clientStyles.fieldInput} ${errors.preventive_interval_value ? clientStyles.fieldInputError : ""}`}
                type="number"
                min={1}
                step={1}
                value={values.preventive_interval_value}
                disabled={disabled}
                onChange={(e) => onChange("preventive_interval_value", e.target.value)}
                placeholder="Ex.: 30"
                aria-invalid={Boolean(errors.preventive_interval_value)}
              />
            ) : (
              <select
                id="sf-preventive-value"
                className={`${clientStyles.fieldSelect} ${errors.preventive_interval_value ? clientStyles.fieldSelectError : ""}`}
                value={values.preventive_interval_value}
                disabled={disabled}
                onChange={(e) => onChange("preventive_interval_value", e.target.value)}
                aria-invalid={Boolean(errors.preventive_interval_value)}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
            {errors.preventive_interval_value ? (
              <p className={clientStyles.fieldError}>{errors.preventive_interval_value}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
