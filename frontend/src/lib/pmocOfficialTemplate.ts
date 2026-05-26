import { createPmocActivity, type PmocFrequency, type PmocScheduledActivityOut } from "../api/pmoc";

/** Cronograma-tipo alinhado ao seed oficial (Lei 13.589 / operação padrão). */
export type OfficialPmocActivityTemplate = {
  title: string;
  frequency: PmocFrequency;
  description: string;
  task_code: string;
};

export const PMOC_OFFICIAL_ACTIVITY_TEMPLATE: OfficialPmocActivityTemplate[] = [
  {
    title: "Limpeza de filtros e grades de ar",
    frequency: "monthly",
    description: "Retirar, lavar ou aspirar filtros; verificar integridade das grades.",
    task_code: "filtros",
  },
  {
    title: "Verificação de drenos e bandejas",
    frequency: "monthly",
    description: "Conferir escoamento, ausência de obstruções e algas.",
    task_code: "dreno",
  },
  {
    title: "Inspeção visual de tubulações e isolamento",
    frequency: "quarterly",
    description: "Verificar condensação anormal, ruídos e estado do isolante.",
    task_code: "inspecao",
  },
  {
    title: "Higienização de serpentinas (evaporadora)",
    frequency: "semiannual",
    description: "Limpeza química/mecânica conforme fabricante e NR.",
    task_code: "higienizacao",
  },
  {
    title: "Verificação elétrica básica e dreno bomba d'água",
    frequency: "annual",
    description: "Conferir aperto de terminais acessíveis, tomada dedicada e eletroduto.",
    task_code: "eletrica",
  },
];

/**
 * Importa atividades do modelo oficial que ainda não existem no cronograma (por título).
 * Retorna quantidade de linhas criadas.
 */
export async function importOfficialPmocTemplateActivities(
  pmocId: number,
  existingActivities: PmocScheduledActivityOut[],
): Promise<number> {
  const existingTitles = new Set(existingActivities.map((a) => a.title.trim().toLowerCase()));
  let created = 0;
  for (const [idx, row] of PMOC_OFFICIAL_ACTIVITY_TEMPLATE.entries()) {
    if (existingTitles.has(row.title.toLowerCase())) continue;
    await createPmocActivity(pmocId, {
      title: row.title,
      frequency: row.frequency,
      description: row.description,
      task_code: row.task_code,
      equipment_id: null,
      sort_order: idx + 1,
    });
    created += 1;
  }
  return created;
}
