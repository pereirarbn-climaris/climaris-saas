"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LeadCaptureDialog } from "@/components/LeadCaptureDialog";
import { demoSchedulingEnabled } from "@/lib/site-config";

export type LeadModalIntent = "demo" | "plan";

export type LeadModalOptions = {
  intent?: LeadModalIntent;
  planKey?: string;
  planLabel?: string;
};

type LeadModalContextValue = {
  openLeadModal: (options?: LeadModalOptions) => void;
  closeLeadModal: () => void;
};

const LeadModalContext = createContext<LeadModalContextValue | null>(null);

export function LeadModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LeadModalOptions>({ intent: "demo" });

  const openLeadModal = useCallback((opts?: LeadModalOptions) => {
    const intent = opts?.intent ?? "demo";
    // Demonstração oculta temporariamente — não abre o modal de agenda.
    if (intent === "demo" && !demoSchedulingEnabled) return;
    setOptions({ intent, planKey: opts?.planKey, planLabel: opts?.planLabel });
    setOpen(true);
  }, []);

  const closeLeadModal = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openLeadModal, closeLeadModal }),
    [openLeadModal, closeLeadModal],
  );

  return (
    <LeadModalContext.Provider value={value}>
      {children}
      <LeadCaptureDialog open={open} onOpenChange={setOpen} options={options} />
    </LeadModalContext.Provider>
  );
}

export function useLeadModal(): LeadModalContextValue {
  const ctx = useContext(LeadModalContext);
  if (!ctx) throw new Error("useLeadModal must be used within LeadModalProvider");
  return ctx;
}
