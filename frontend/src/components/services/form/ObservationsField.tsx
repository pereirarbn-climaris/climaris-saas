import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import { NOTES_MAX } from "./serviceForm.types";

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function ObservationsField({ value, disabled, onChange }: Props) {
  return (
    <div className={`${clientStyles.field} ${clientStyles.fieldFull}`}>
      <label className={clientStyles.fieldLabel} htmlFor="sf-notes">
        Observações (Opcional)
      </label>
      <textarea
        id="sf-notes"
        className={clientStyles.fieldTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, NOTES_MAX))}
        placeholder="Informações adicionais sobre o serviço..."
        disabled={disabled}
        maxLength={NOTES_MAX}
      />
      <span className={clientStyles.textareaCounter}>
        {value.length}/{NOTES_MAX}
      </span>
    </div>
  );
}
