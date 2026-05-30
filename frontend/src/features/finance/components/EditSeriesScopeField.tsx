import { useId } from 'react';
import {
  EDIT_SCOPE_LABELS,
  type EditSeriesKind,
  type EditSeriesScope,
  type ScopeOptionLabels,
  seriesKindLabel,
} from '../financeEntryEdit';
import styles from './EditSeriesScopeDialog.module.css';

const SCOPES: EditSeriesScope[] = ['single', 'following', 'all'];

export type EditSeriesScopeFieldProps = {
  seriesKind: EditSeriesKind;
  value: EditSeriesScope | null;
  onChange: (scope: EditSeriesScope) => void;
  /** Ex.: "Parcela 2 de 12" */
  hint?: string;
  invalid?: boolean;
  legend?: string;
  labels?: ScopeOptionLabels;
};

export function EditSeriesScopeField({
  seriesKind,
  value,
  onChange,
  hint,
  invalid = false,
  legend,
  labels = EDIT_SCOPE_LABELS,
}: EditSeriesScopeFieldProps) {
  const groupId = useId();
  const kindLabel = seriesKindLabel(seriesKind);
  const legendText =
    legend ?? `Alterar qual parte da série ${kindLabel}?`;

  return (
    <fieldset className={styles.scopeFieldset} aria-labelledby={groupId}>
      <legend id={groupId} className={styles.scopeLegend}>
        {legendText}
        <span className={styles.scopeRequired} aria-hidden>
          {' '}
          *
        </span>
      </legend>
      {hint ? <p className={styles.scopeHint}>{hint}</p> : null}
      <ul
        className={`${styles.scopeList} ${invalid ? styles.scopeListInvalid : ''}`}
        role="radiogroup"
        aria-label="Alcance da edição"
        aria-required="true"
      >
        {SCOPES.map((scope) => {
          const meta = labels[scope];
          const isSelected = value === scope;
          return (
            <li key={scope}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.scopeOption} ${isSelected ? styles.scopeOptionSelected : ''}`}
                onClick={() => onChange(scope)}
              >
                <span className={styles.scopeOptionTitle}>{meta.title}</span>
                <span className={styles.scopeOptionDesc}>{meta.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {invalid && value == null ? (
        <p className={styles.scopeError} role="alert">
          Selecione uma opção para continuar.
        </p>
      ) : null}
    </fieldset>
  );
}
