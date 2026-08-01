import { FormSwitch } from "../../ui/form-switch";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function PhotoSwitch({ checked, onChange, disabled }: Props) {
  return (
    <div className={clientStyles.field}>
      <div className={clientStyles.switchInlineRow}>
        <FormSwitch
          id="service-photo-switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          ariaLabel="Exigir foto na execução"
        />
        <span className={clientStyles.switchInlineLabel}>Exigir Foto</span>
        <span className={clientStyles.statusRowLabel}>{checked ? "Sim" : "Não"}</span>
      </div>
      <p className={clientStyles.cardHint}>Marque se o serviço exigir foto na execução.</p>
    </div>
  );
}
