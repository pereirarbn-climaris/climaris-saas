import { z } from 'zod';
import { PlanosSchema } from './plan.types';

export const TipoContaSchema = z.enum(['BANCO', 'MAQUININHA', 'GATEWAY_PIX', 'GATEWAY_BOLETO']);
export const ContaStatusSchema = z.enum(['ATIVA', 'INATIVA']);

export const ContaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  tipo: TipoContaSchema,
  status: ContaStatusSchema.default('ATIVA'),
  saldoAtual: z.number(),
  planoMinimo: PlanosSchema,
  /** ID numérico da API (conta bancária), quando aplicável. */
  bankAccountId: z.number().int().positive().optional(),
});

export type TipoConta = z.infer<typeof TipoContaSchema>;
export type ContaStatus = z.infer<typeof ContaStatusSchema>;
export type Conta = z.infer<typeof ContaSchema>;

export type AccountBalancePatch = {
  contaId: string;
  delta: number;
};
