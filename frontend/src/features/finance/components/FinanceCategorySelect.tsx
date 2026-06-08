import type { FinanceCategoryOut } from '../../../api/finance';
import { normalizeFinanceCategoryValue } from '../financeCategoryUtils';
import wizardStyles from '../../../pages/integrations/CampaignDashboard.module.css';

type Props = {
  value: string;
  onChange: (categoryName: string) => void;
  categories: FinanceCategoryOut[];
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  id?: string;
  emptyLabel?: string;
};

export function FinanceCategorySelect({
  value,
  onChange,
  categories,
  disabled,
  required,
  allowEmpty = true,
  id,
  emptyLabel = 'Sem categoria',
}: Props) {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const normalized = normalizeFinanceCategoryValue(value);
  const matched = normalized
    ? sorted.find((c) => c.name.trim().toLowerCase() === normalized.toLowerCase())
    : undefined;
  const selectValue = matched?.name ?? normalized;
  const showLegacyOption = Boolean(normalized && !matched);

  return (
    <select
      id={id}
      className={wizardStyles.textInput}
      value={selectValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required && !allowEmpty}
      aria-label="Categoria"
    >
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {showLegacyOption ? (
        <option value={normalized}>{normalized}</option>
      ) : null}
      {sorted.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
