/**
 * Schemas Zod para validar payloads da Evolution API (`messages.upsert`)
 * relacionados à campanha de manutenção preventiva (botões).
 *
 * No backend, equivalentes Pydantic estão em `app/schemas_preventive.py`.
 * Validar no edge/gateway Node antes de encaminhar ao FastAPI evita filas travadas por payload gigante.
 */

import { z } from "zod";

export const evolutionMessageKeyZod = z
  .object({
    id: z.string().optional(),
    remoteJid: z.string().optional(),
    fromMe: z.boolean().optional(),
  })
  .passthrough();

export const evolutionButtonResponseZod = z
  .object({
    selectedButtonId: z.string().optional(),
    selectedDisplayText: z.string().optional(),
  })
  .passthrough();

export const evolutionIncomingMessageZod = z
  .object({
    conversation: z.string().optional(),
    extendedTextMessage: z.record(z.unknown()).optional(),
    buttonsResponseMessage: z.union([evolutionButtonResponseZod, z.record(z.unknown())]).optional(),
    buttonReply: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const evolutionUpsertDataZod = z
  .object({
    key: z.union([evolutionMessageKeyZod, z.record(z.unknown())]).optional(),
    message: z.union([evolutionIncomingMessageZod, z.record(z.unknown())]).optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const evolutionWebhookEnvelopeZod = z
  .object({
    event: z.string().optional(),
    type: z.string().optional(),
    instance: z.string().optional(),
    instanceName: z.string().optional(),
    data: evolutionUpsertDataZod.optional(),
  })
  .passthrough();

export type EvolutionWebhookEnvelope = z.infer<typeof evolutionWebhookEnvelopeZod>;
