import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import type { ServiceFormErrors, ServiceFormValues } from "./serviceForm.types";
import { DESCRIPTION_MAX, SERVICE_TYPE_OPTIONS } from "./serviceForm.types";
import { formatCategoryOptionLabel } from "./serviceForm.utils";
import { ServiceIconSelector } from "./ServiceIconSelector";
import { StatusSwitch } from "./StatusSwitch";
import { PhotoSwitch } from "./PhotoSwitch";
import { ServiceApplicationsCard } from "./ServiceApplicationsCard";
import { PreventiveManagementCard } from "./PreventiveManagementCard";
import { ObservationsField } from "./ObservationsField";
import styles from "./service-form.module.css";

type Props = {
  values: ServiceFormValues;
  errors: ServiceFormErrors;
  categories: string[];
  disabled?: boolean;
  onChange: <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => void;
};

export function GeneralInformationCard({ values, errors, categories, disabled, onChange }: Props) {
  return (
    <>
      <div className={clientStyles.cardHeadRow}>
        <div>
          <h3 className={clientStyles.cardTitle}>Informações Gerais</h3>
        </div>
        <StatusSwitch
          checked={values.is_active}
          onChange={(checked) => onChange("is_active", checked)}
          disabled={disabled}
        />
      </div>

      <div className={clientStyles.fieldGrid}>
        <div className={styles.nameCodeRow}>
          <div className={clientStyles.field}>
            <label
              className={`${clientStyles.fieldLabel} ${errors.name ? clientStyles.fieldLabelError : ""}`}
              htmlFor="sf-name"
            >
              Nome do Serviço<span className={clientStyles.fieldRequired}>*</span>
            </label>
            <input
              id="sf-name"
              className={`${clientStyles.fieldInput} ${errors.name ? clientStyles.fieldInputError : ""}`}
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Ex.: Limpeza Evaporadora"
              disabled={disabled}
              maxLength={150}
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p className={clientStyles.fieldError}>{errors.name}</p> : null}
          </div>

          <div className={clientStyles.field}>
            <label className={clientStyles.fieldLabel} htmlFor="sf-code">
              Código (Opcional)
            </label>
            <input
              id="sf-code"
              className={clientStyles.fieldInput}
              value={values.code}
              onChange={(e) => onChange("code", e.target.value)}
              placeholder="Ex.: LIM-001"
              disabled={disabled}
              maxLength={40}
              autoComplete="off"
            />
          </div>
        </div>

        <div className={`${clientStyles.field} ${clientStyles.fieldFull}`}>
          <label
            className={`${clientStyles.fieldLabel} ${errors.description ? clientStyles.fieldLabelError : ""}`}
            htmlFor="sf-description"
          >
            Descrição<span className={clientStyles.fieldRequired}>*</span>
          </label>
          <textarea
            id="sf-description"
            className={`${clientStyles.fieldTextarea} ${errors.description ? clientStyles.fieldTextareaError : ""}`}
            value={values.description}
            onChange={(e) => onChange("description", e.target.value.slice(0, DESCRIPTION_MAX))}
            placeholder="Descreva o serviço oferecido..."
            disabled={disabled}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={Boolean(errors.description)}
          />
          <span className={clientStyles.textareaCounter}>
            {values.description.length}/{DESCRIPTION_MAX}
          </span>
          {errors.description ? <p className={clientStyles.fieldError}>{errors.description}</p> : null}
        </div>

        <div className={clientStyles.field}>
          <label
            className={`${clientStyles.fieldLabel} ${errors.service_category ? clientStyles.fieldLabelError : ""}`}
            htmlFor="sf-category"
          >
            Categoria<span className={clientStyles.fieldRequired}>*</span>
          </label>
          <select
            id="sf-category"
            className={`${clientStyles.fieldSelect} ${errors.service_category ? clientStyles.fieldSelectError : ""}`}
            value={values.service_category}
            onChange={(e) => onChange("service_category", e.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(errors.service_category)}
          >
            <option value="">Selecione a categoria</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategoryOptionLabel(cat)}
              </option>
            ))}
          </select>
          {errors.service_category ? (
            <p className={clientStyles.fieldError}>{errors.service_category}</p>
          ) : null}
        </div>

        <div className={clientStyles.field}>
          <label
            className={`${clientStyles.fieldLabel} ${errors.service_type ? clientStyles.fieldLabelError : ""}`}
            htmlFor="sf-type"
          >
            Tipo<span className={clientStyles.fieldRequired}>*</span>
          </label>
          <select
            id="sf-type"
            className={`${clientStyles.fieldSelect} ${errors.service_type ? clientStyles.fieldSelectError : ""}`}
            value={values.service_type}
            onChange={(e) => onChange("service_type", e.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(errors.service_type)}
          >
            <option value="">Selecione o tipo</option>
            {SERVICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.service_type ? <p className={clientStyles.fieldError}>{errors.service_type}</p> : null}
        </div>

        <div className={clientStyles.field}>
          <label
            className={`${clientStyles.fieldLabel} ${errors.price ? clientStyles.fieldLabelError : ""}`}
            htmlFor="sf-price"
          >
            Valor do Serviço<span className={clientStyles.fieldRequired}>*</span>
          </label>
          <input
            id="sf-price"
            className={`${clientStyles.fieldInput} ${errors.price ? clientStyles.fieldInputError : ""}`}
            value={values.price}
            onChange={(e) => onChange("price", e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            placeholder="R$ 0,00"
            aria-invalid={Boolean(errors.price)}
          />
          {errors.price ? <p className={clientStyles.fieldError}>{errors.price}</p> : null}
        </div>

        <div className={clientStyles.field}>
          <label
            className={`${clientStyles.fieldLabel} ${errors.duration_minutes ? clientStyles.fieldLabelError : ""}`}
            htmlFor="sf-duration"
          >
            Duração (minutos)<span className={clientStyles.fieldRequired}>*</span>
          </label>
          <input
            id="sf-duration"
            className={`${clientStyles.fieldInput} ${errors.duration_minutes ? clientStyles.fieldInputError : ""}`}
            value={values.duration_minutes}
            onChange={(e) => onChange("duration_minutes", e.target.value)}
            placeholder="Ex.: 120"
            inputMode="numeric"
            disabled={disabled}
            autoComplete="off"
            maxLength={4}
            aria-invalid={Boolean(errors.duration_minutes)}
          />
          {errors.duration_minutes ? (
            <p className={clientStyles.fieldError}>{errors.duration_minutes}</p>
          ) : (
            <p className={clientStyles.cardHint}>Usado para calcular horários na agenda e outras funções.</p>
          )}
        </div>

        <PhotoSwitch
          checked={values.require_photo}
          onChange={(checked) => onChange("require_photo", checked)}
          disabled={disabled}
        />

        <div className={clientStyles.fieldFull}>
          <ServiceApplicationsCard values={values} disabled={disabled} onChange={onChange} />
        </div>

        <div className={clientStyles.fieldFull}>
          <PreventiveManagementCard values={values} errors={errors} disabled={disabled} onChange={onChange} />
        </div>

        <div className={clientStyles.fieldFull}>
          <ServiceIconSelector
            value={values.icon_key}
            onChange={(icon) => onChange("icon_key", icon)}
            disabled={disabled}
          />
        </div>

        <ObservationsField
          value={values.notes}
          disabled={disabled}
          onChange={(notes) => onChange("notes", notes)}
        />
      </div>
    </>
  );
}
