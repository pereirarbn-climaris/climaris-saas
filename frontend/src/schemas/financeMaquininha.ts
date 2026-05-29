import { z } from "zod";

export const PLANO_RECEBIMENTO_VALUES = ["D0", "D1", "PADRAO_30_DIAS"] as const;
export const PlanoRecebimentoSchema = z.enum(PLANO_RECEBIMENTO_VALUES);
export type PlanoRecebimento = z.infer<typeof PlanoRecebimentoSchema>;

const parcelaKeySchema = z.string().regex(/^(1[0-2]|[1-9])$/);

/** Taxa percentual 0–100 com até 2 casas decimais. */
export const taxaPercentualSchema = z
  .number({ invalid_type_error: "Informe um número válido." })
  .min(0, "A taxa não pode ser negativa.")
  .max(100, "A taxa não pode passar de 100%.")
  .transform((v) => Math.round(v * 100) / 100);

const PARCELAS_1_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));

export const PlanoTaxasSchema = z
  .object({
    taxaDebito: taxaPercentualSchema,
    taxasCredito: z.record(parcelaKeySchema, taxaPercentualSchema),
  })
  .transform((data) => {
    const taxasCredito: Record<string, number> = {};
    for (const key of PARCELAS_1_12) {
      taxasCredito[key] = data.taxasCredito[key] ?? 0;
    }
    return { taxaDebito: data.taxaDebito, taxasCredito };
  });

export const MaquininhaConfigSchema = z.object({
  nomeMaquininha: z.string().trim().min(1, "Informe o nome da maquininha."),
  planos: z.object({
    D0: PlanoTaxasSchema,
    D1: PlanoTaxasSchema,
    PADRAO_30_DIAS: PlanoTaxasSchema,
  }),
});

export type PlanoTaxas = z.infer<typeof PlanoTaxasSchema>;
export type MaquininhaConfig = z.infer<typeof MaquininhaConfigSchema>;
