import { FormSwitch } from "../../ui/form-switch";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function StatusSwitch({ checked, onChange, disabled }: Props) {
  return (
    <div className={clientStyles.statusRow}>
      <div className={clientStyles.statusRowControl}>
        <span className={clientStyles.statusRowLabel}>{checked ? "Ativo" : "Inativo"}</span>
        <FormSwitch
          id="service-status-switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          ariaLabel="Status do serviço"
        />
      </div>
    </div>
  );
}
