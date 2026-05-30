import wizardStyles from '../../../pages/integrations/CampaignDashboard.module.css';
import {
  WEEKDAY_OPTIONS,
  buildRecurringPreviewMessage,
  type RecurringFormState,
  type RecurringFrequencyOption,
} from '../recurringTransaction';
import styles from './TransactionWizardModal.module.css';

export type RecurringStepProps = {
  state: RecurringFormState;
  onChange: (patch: Partial<RecurringFormState>) => void;
  disabled?: boolean;
  disabledReason?: string;
  validationError?: string | null;
};

export function RecurringStep({
  state,
  onChange,
  disabled = false,
  disabledReason,
  validationError,
}: RecurringStepProps) {
  const preview = buildRecurringPreviewMessage(state);

  return (
    <div className={styles.recurringBlock}>
      <label className={wizardStyles.fieldLabel} htmlFor="recurring-frequency">
        Repetir esta transação?
      </label>
      <select
        id="recurring-frequency"
        className={wizardStyles.textInput}
        value={state.frequency}
        disabled={disabled}
        onChange={(e) => onChange({ frequency: e.target.value as RecurringFrequencyOption })}
      >
        <option value="none">Não</option>
        <option value="monthly">Mensalmente</option>
        <option value="weekly">Semanalmente</option>
      </select>

      {disabled && disabledReason ? (
        <p className={styles.hint}>{disabledReason}</p>
      ) : null}

      {state.frequency === 'monthly' && !disabled ? (
        <>
          <label className={wizardStyles.fieldLabel} htmlFor="recurring-dom">
            Dia do vencimento
          </label>
          <select
            id="recurring-dom"
            className={wizardStyles.textInput}
            value={state.dayOfMonth}
            onChange={(e) => onChange({ dayOfMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Dia {d}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {state.frequency === 'weekly' && !disabled ? (
        <>
          <label className={wizardStyles.fieldLabel} htmlFor="recurring-weekday">
            Dia da semana
          </label>
          <select
            id="recurring-weekday"
            className={wizardStyles.textInput}
            value={state.weekday}
            onChange={(e) => onChange({ weekday: Number(e.target.value) })}
          >
            {WEEKDAY_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {state.frequency !== 'none' && !disabled ? (
        <>
          <label className={wizardStyles.fieldLabel}>
            <input
              type="checkbox"
              checked={state.noEnd}
              onChange={(e) => onChange({ noEnd: e.target.checked })}
              style={{ marginRight: '0.5rem' }}
            />
            Sem data de encerramento (infinito)
          </label>
          {!state.noEnd ? (
            <>
              <label className={wizardStyles.fieldLabel} htmlFor="recurring-end">
                Data de encerramento
              </label>
              <input
                id="recurring-end"
                className={wizardStyles.textInput}
                type="date"
                value={state.endDate}
                min={toDateInput(new Date())}
                onChange={(e) => onChange({ endDate: e.target.value })}
                required
              />
            </>
          ) : null}
        </>
      ) : null}

      {preview ? (
        <p className={styles.recurringPreview} role="status">
          {preview}
        </p>
      ) : null}

      {validationError ? <p className={styles.invalidHint}>{validationError}</p> : null}
    </div>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
