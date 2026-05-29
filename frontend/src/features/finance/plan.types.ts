import { z } from 'zod';

export const PlanosSchema = z.enum(['SIMPLES', 'PRO', 'ENTERPRISE']);
export type Planos = z.infer<typeof PlanosSchema>;
