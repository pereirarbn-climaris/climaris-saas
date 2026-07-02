"use client";

import Link from "next/link";

type Props = {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
};

export function LgpdConsentField({ id = "lgpd_consent", checked, onChange, compact = false }: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-2.5 rounded-btn border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-text-muted sm:text-sm ${
        compact ? "" : ""
      }`}
    >
      <input
        id={id}
        name="lgpd_consent"
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <span>
        Li e estou ciente da{" "}
        <Link href="/privacidade" className="font-medium text-primary hover:underline" target="_blank">
          Política de Privacidade e LGPD
        </Link>{" "}
        e autorizo o tratamento dos meus dados para contato comercial e agendamento de demonstração.
      </span>
    </label>
  );
}
