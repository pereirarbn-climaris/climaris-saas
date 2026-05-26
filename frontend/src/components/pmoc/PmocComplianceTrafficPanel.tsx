import type { PmocComplianceIndicatorOut, PmocComplianceTrafficLight } from "../../api/pmoc";

const STATUS_META: Record<
  PmocComplianceTrafficLight,
  { dot: string; ring: string; label: string }
> = {
  green: { dot: "bg-emerald-500", ring: "ring-emerald-200", label: "Conforme" },
  yellow: { dot: "bg-amber-400", ring: "ring-amber-200", label: "Atenção" },
  red: { dot: "bg-red-500", ring: "ring-red-200", label: "Crítico" },
};

type Props = {
  indicators: PmocComplianceIndicatorOut[];
  overallStatus: PmocComplianceTrafficLight;
  openOccurrences: number;
};

export function PmocComplianceTrafficPanel({ indicators, overallStatus, openOccurrences }: Props) {
  const overall = STATUS_META[overallStatus];
  return (
    <div className="space-y-4">
      <div className={`rounded-xl bg-white p-5 shadow-sm ring-1 ${overall.ring}`}>
        <div className="flex items-center gap-3">
          <span className={`h-3.5 w-3.5 rounded-full ${overall.dot}`} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Status geral do PMOC</p>
            <p className="text-sm text-[#64748b]">{overall.label}</p>
          </div>
          {openOccurrences > 0 ? (
            <span className="ml-auto rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              {openOccurrences} ocorrência(s) aberta(s)
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {indicators.map((item) => {
          const meta = STATUS_META[item.status];
          return (
            <div key={item.key} className={`rounded-xl bg-white p-5 shadow-sm ring-1 ${meta.ring}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${meta.dot}`} aria-hidden />
                <p className="text-sm font-semibold text-[#0f172a]">{item.label}</p>
              </div>
              <p className="text-lg font-semibold text-[#0f172a]">{item.summary}</p>
              {item.detail ? <p className="mt-2 text-xs leading-relaxed text-[#64748b]">{item.detail}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
