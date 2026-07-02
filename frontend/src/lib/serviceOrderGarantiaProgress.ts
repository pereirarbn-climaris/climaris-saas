import { resolveGarantiaSerial, type ServiceOrderGarantiaFields } from "./serviceOrderGarantia";

export type GarantiaProgress = {
  percent: number;
  filled: number;
  total: number;
  missingLabels: string[];
};

const REQUIRED: { label: string; done: (g: ServiceOrderGarantiaFields) => boolean }[] = [
  { label: "Marca / modelo", done: (g) => Boolean(g.marcaModelo.trim()) },
  { label: "Série do equipamento", done: (g) => Boolean(resolveGarantiaSerial(g)) },
  { label: "Local do aparelho", done: (g) => Boolean(g.equipmentTag.trim() || g.localInstalacao.trim()) },
  { label: "Data da instalação", done: (g) => Boolean(g.dataInstalacao.trim()) },
  { label: "Técnico responsável", done: (g) => Boolean(g.tecnicoResponsavelNome.trim()) },
];

export function computeGarantiaProgress(g: ServiceOrderGarantiaFields): GarantiaProgress {
  const missingLabels: string[] = [];
  let filled = 0;
  for (const item of REQUIRED) {
    if (item.done(g)) filled += 1;
    else missingLabels.push(item.label);
  }
  const total = REQUIRED.length;
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
  return { percent, filled, total, missingLabels };
}

export function formatGarantiaDateBr(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}
