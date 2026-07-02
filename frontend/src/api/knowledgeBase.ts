import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type KnowledgeManualUsedOut = {
  manual_id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
};

export type KnowledgeAskOut = {
  answer: string;
  manuals_used: KnowledgeManualUsedOut[];
  chunks_found: number;
  has_context: boolean;
};

export type KnowledgeAskPayload = {
  question: string;
  brand?: string | null;
  model?: string | null;
  equipment_id?: string | null;
};

export type KnowledgeIngestOut = {
  manual_id: string;
  ingestion_status: string;
  ingestion_error?: string | null;
  ingested_at?: string | null;
  chunks_count: number;
};

export type KnowledgeIngestAllOut = {
  scheduled: number;
  message: string;
};

function bearer(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    const err = record.error;
    if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
      return String((err as Record<string, unknown>).message);
    }
  }
  return fallback;
}

export async function askKnowledgeBase(payload: KnowledgeAskPayload): Promise<KnowledgeAskOut> {
  const response = await fetch(apiUrl("/api/v1/ai/ask"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...bearer(),
    },
    body: JSON.stringify({
      question: payload.question,
      brand: payload.brand ?? undefined,
      model: payload.model ?? undefined,
      equipment_id: payload.equipment_id ?? undefined,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível consultar os manuais."));
  }
  return body as KnowledgeAskOut;
}

export async function ingestKnowledgeManual(manualId: string): Promise<KnowledgeIngestOut> {
  const response = await fetch(apiUrl(`/api/v1/ai/knowledge/ingest/${manualId}`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível reindexar o manual."));
  }
  return body as KnowledgeIngestOut;
}

export async function ingestAllKnowledgeManuals(): Promise<KnowledgeIngestAllOut> {
  const response = await fetch(apiUrl("/api/v1/ai/knowledge/ingest-all"), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível iniciar a indexação em lote."));
  }
  return body as KnowledgeIngestAllOut;
}
