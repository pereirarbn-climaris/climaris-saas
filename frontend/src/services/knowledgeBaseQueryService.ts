import {
  askKnowledgeBase,
  type KnowledgeAskOut,
  type KnowledgeAskPayload,
} from "../api/knowledgeBase";

export type KnowledgeChatEquipmentContext = {
  equipmentId?: string | null;
  brand?: string | null;
  model?: string | null;
  label?: string | null;
};

export const KnowledgeBaseQueryService = {
  async ask(question: string, context?: KnowledgeChatEquipmentContext): Promise<KnowledgeAskOut> {
    const payload: KnowledgeAskPayload = {
      question: question.trim(),
      brand: context?.brand ?? undefined,
      model: context?.model ?? undefined,
      equipment_id: context?.equipmentId ?? undefined,
    };
    return askKnowledgeBase(payload);
  },
};
