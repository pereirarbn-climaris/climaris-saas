import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { KnowledgeChatEquipmentContext } from "../services/knowledgeBaseQueryService";

export type KnowledgeChatContextValue = KnowledgeChatEquipmentContext & {
  source: "equipment_detail" | "route" | "none";
  setEquipmentDetail: (ctx: KnowledgeChatEquipmentContext | null) => void;
};

const KnowledgeChatContext = createContext<KnowledgeChatContextValue | null>(null);

const EMPTY: KnowledgeChatEquipmentContext = {
  equipmentId: null,
  brand: null,
  model: null,
  label: null,
};

export function KnowledgeChatProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [equipmentDetail, setEquipmentDetailState] = useState<KnowledgeChatEquipmentContext | null>(null);

  const setEquipmentDetail = useCallback((ctx: KnowledgeChatEquipmentContext | null) => {
    setEquipmentDetailState(ctx);
  }, []);

  const value = useMemo<KnowledgeChatContextValue>(() => {
    if (equipmentDetail?.equipmentId || equipmentDetail?.brand || equipmentDetail?.model) {
      return {
        equipmentId: equipmentDetail.equipmentId ?? null,
        brand: equipmentDetail.brand ?? null,
        model: equipmentDetail.model ?? null,
        label: equipmentDetail.label ?? null,
        source: "equipment_detail",
        setEquipmentDetail,
      };
    }

    const onClientRoute = /^\/app\/clients\/\d+/.test(location.pathname);
    if (onClientRoute) {
      return {
        ...EMPTY,
        source: "route",
        setEquipmentDetail,
      };
    }

    return {
      ...EMPTY,
      source: "none",
      setEquipmentDetail,
    };
  }, [equipmentDetail, location.pathname, setEquipmentDetail]);

  return <KnowledgeChatContext.Provider value={value}>{children}</KnowledgeChatContext.Provider>;
}

export function useKnowledgeChatContext(): KnowledgeChatContextValue {
  const ctx = useContext(KnowledgeChatContext);
  if (!ctx) {
    throw new Error("useKnowledgeChatContext deve ser usado dentro de KnowledgeChatProvider.");
  }
  return ctx;
}

export function useKnowledgeChatContextOptional(): KnowledgeChatContextValue | null {
  return useContext(KnowledgeChatContext);
}
