import { useRef } from "react";
import { focusTextareaCursor, insertTextAtCursor } from "../../lib/agendaTemplateUtils";
import dashStyles from "./CampaignDashboard.module.css";

type Variable = { tag: string; label: string };

type Props = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  variables: readonly Variable[];
  disabled?: boolean;
  rows?: number;
  minHeight?: string;
};

export function AgendaVariableTextarea({
  id,
  label,
  hint,
  value,
  onChange,
  variables,
  disabled,
  rows = 8,
  minHeight,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insertVariable(tag: string) {
    const el = ref.current;
    if (!el || disabled) return;
    const { value: next, cursor } = insertTextAtCursor(el, tag, value);
    onChange(next);
    focusTextareaCursor(el, cursor);
  }

  return (
    <div>
      <label className={dashStyles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {variables.map((v) => (
          <button
            key={v.tag}
            type="button"
            disabled={disabled}
            className={`${dashStyles.badge} ${dashStyles.badgeInfo}`}
            style={{ cursor: disabled ? "not-allowed" : "pointer", border: "none" }}
            title={`Inserir ${v.tag}`}
            onClick={() => insertVariable(v.tag)}
          >
            {v.label}
            <span className="sr-only"> {v.tag}</span>
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        className={dashStyles.textarea}
        style={{ marginBottom: hint ? undefined : 0, minHeight }}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {hint ? <p className={dashStyles.hint}>{hint}</p> : null}
    </div>
  );
}
