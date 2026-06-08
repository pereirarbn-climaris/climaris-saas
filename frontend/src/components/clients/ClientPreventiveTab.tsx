import { useCallback, useEffect, useMemo, useState } from "react";
import { listServiceOrdersAll } from "../../api/serviceOrders";
import {
  getPreventiveRuleByEquipment,
  upsertPreventiveRule,
  type EquipmentPreventiveRuleOut,
} from "../../api/preventiveMaintenance";
import {
  buildLastDoneServiceDateByEquipment,
  formatClientPreventiveNextDue,
  formatFriendlyDatePt,
} from "../../lib/preventiveLastService";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import {
  EquipmentPreventiveInlineRow,
} from "../v0-ui/preventive/EquipmentPreventiveInlineRow";
import type { PreventiveScheduleConfig } from "../v0-ui/preventive/EquipmentPreventiveForm";
import { FormSwitch } from "../ui/form-switch";
import styles from "./ClientPreventiveTab.module.css";

type Props = {
  clientId: number;
  equipments: EquipmentItem[];
  readOnly?: boolean;
  preventiveCampaignOptOut?: boolean;
  onPreventiveCampaignOptOutChange?: (value: boolean) => void;
};

type RowState = {
  rule: EquipmentPreventiveRuleOut | null;
  lastServiceAt: string | null;
  lastServiceLabel: string | null;
  canConfigure: boolean;
};

function ruleToConfig(rule: EquipmentPreventiveRuleOut | null): PreventiveScheduleConfig {
  if (!rule) {
    return { enabled: false, intervalValue: 3, intervalType: "months" };
  }
  return {
    enabled: rule.is_active,
    intervalValue: rule.interval_value,
    intervalType: rule.interval_type,
  };
}

function equipmentLabel(item: EquipmentItem): string {
  const title = item.tag?.trim() || item.location?.trim() || "Equipamento";
  const brandModel = [item.brandName, item.modelName].filter(Boolean).join(" ");
  return brandModel ? `${title} · ${brandModel}` : title;
}

function OptOutSection({
  preventiveCampaignOptOut,
  onPreventiveCampaignOptOutChange,
  readOnly,
}: {
  preventiveCampaignOptOut: boolean;
  onPreventiveCampaignOptOutChange?: (value: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <section className={styles.optOutCard}>
      <div className={styles.optOutText}>
        <h4 className={styles.optOutTitle}>Participação na gestão preventiva</h4>
        <p className={styles.optOutLead}>
          Com o interruptor ligado, os equipamentos deste cliente ficam fora da Gestão preventiva e das campanhas
          automáticas.
        </p>
      </div>
      <label htmlFor="client-preventive-opt-out" className={styles.optOutControl}>
        <span className={styles.optOutLabel}>Não participar de campanhas preventivas</span>
        <FormSwitch
          id="client-preventive-opt-out"
          checked={preventiveCampaignOptOut}
          onChange={(value) => onPreventiveCampaignOptOutChange?.(value)}
          disabled={readOnly || !onPreventiveCampaignOptOutChange}
          ariaLabel="Não participar de campanhas preventivas"
        />
      </label>
    </section>
  );
}

export function ClientPreventiveTab({
  clientId,
  equipments,
  readOnly = false,
  preventiveCampaignOptOut = false,
  onPreventiveCampaignOptOutChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [draftConfigByEquipment, setDraftConfigByEquipment] = useState<
    Record<string, PreventiveScheduleConfig>
  >({});

  const activeEquipments = useMemo(
    () => equipments.filter((e) => e.status === "ativo"),
    [equipments],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (preventiveCampaignOptOut) {
      setLoading(false);
      setLoadErr("");
      setRowState({});
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const doneOrders = (await listServiceOrdersAll({ status: "done" })).filter(
          (o) => o.client_id === clientId,
        );
        const lastByEquipment = buildLastDoneServiceDateByEquipment(doneOrders);

        const entries = await Promise.all(
          activeEquipments.map(async (item) => {
            const legacyId = item.legacyEquipmentId;
            const canConfigure = legacyId != null && legacyId > 0;
            let rule: EquipmentPreventiveRuleOut | null = null;
            if (canConfigure) {
              rule = await getPreventiveRuleByEquipment(legacyId);
            }
            const lastDate = legacyId ? lastByEquipment.get(legacyId) : undefined;
            return [
              item.id,
              {
                rule,
                canConfigure,
                lastServiceAt: lastDate ? lastDate.toISOString() : null,
                lastServiceLabel: lastDate ? formatFriendlyDatePt(lastDate) : null,
              } satisfies RowState,
            ] as const;
          }),
        );

        if (!cancelled) {
          setRowState(Object.fromEntries(entries));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(
            e instanceof Error ? e.message : "Não foi possível carregar a gestão preventiva.",
          );
          setRowState({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeEquipments, clientId, preventiveCampaignOptOut]);

  const handleSave = useCallback(
    async (equipment: EquipmentItem, config: PreventiveScheduleConfig) => {
      const legacyId = equipment.legacyEquipmentId;
      if (!legacyId) {
        setToast({
          kind: "err",
          text: "Este equipamento ainda não possui vínculo com o cadastro legado.",
        });
        return;
      }
      try {
        const saved = await upsertPreventiveRule({
          equipment_id: legacyId,
          interval_value: config.intervalValue,
          interval_type: config.intervalType,
          is_active: config.enabled,
        });
        setRowState((prev) => {
          const current = prev[equipment.id];
          return {
            ...prev,
            [equipment.id]: {
              canConfigure: current?.canConfigure ?? true,
              lastServiceAt: current?.lastServiceAt ?? null,
              lastServiceLabel: current?.lastServiceLabel ?? null,
              rule: saved,
            },
          };
        });
        setDraftConfigByEquipment((prev) => {
          const next = { ...prev };
          delete next[equipment.id];
          return next;
        });
        setToast({ kind: "ok", text: "Configuração preventiva atualizada com sucesso!" });
      } catch (e) {
        setToast({
          kind: "err",
          text: e instanceof Error ? e.message : "Não foi possível salvar a configuração.",
        });
      }
    },
    [],
  );

  if (preventiveCampaignOptOut) {
    return (
      <div className={styles.wrap}>
        <OptOutSection
          preventiveCampaignOptOut={preventiveCampaignOptOut}
          onPreventiveCampaignOptOutChange={onPreventiveCampaignOptOutChange}
          readOnly={readOnly}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <OptOutSection
          preventiveCampaignOptOut={preventiveCampaignOptOut}
          onPreventiveCampaignOptOutChange={onPreventiveCampaignOptOutChange}
          readOnly={readOnly}
        />
        <div className={styles.loading} aria-busy="true">
          Carregando cronogramas preventivos…
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className={styles.wrap}>
        <OptOutSection
          preventiveCampaignOptOut={preventiveCampaignOptOut}
          onPreventiveCampaignOptOutChange={onPreventiveCampaignOptOutChange}
          readOnly={readOnly}
        />
        <p className={styles.error}>{loadErr}</p>
      </div>
    );
  }

  if (activeEquipments.length === 0) {
    return (
      <div className={styles.wrap}>
        <OptOutSection
          preventiveCampaignOptOut={preventiveCampaignOptOut}
          onPreventiveCampaignOptOutChange={onPreventiveCampaignOptOutChange}
          readOnly={readOnly}
        />
        <div className={styles.empty}>
          <p>Nenhum equipamento ativo cadastrado para este cliente.</p>
          <p className={styles.emptyHint}>Cadastre aparelhos na aba Equipamentos para configurar a preventiva.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <OptOutSection
        preventiveCampaignOptOut={preventiveCampaignOptOut}
        onPreventiveCampaignOptOutChange={onPreventiveCampaignOptOutChange}
        readOnly={readOnly}
      />
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>Gestão preventiva por equipamento</h3>
          <p className={styles.lead}>
            Ative lembretes automáticos e defina o intervalo entre manutenções. A última higienização
            considera OS concluídas vinculadas ao aparelho.
          </p>
        </div>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Última manutenção (OS)</th>
              <th className={styles.thActions}>Cronograma e lembretes</th>
            </tr>
          </thead>
          <tbody>
            {activeEquipments.map((item) => {
              const state = rowState[item.id];
              const config = draftConfigByEquipment[item.id] ?? ruleToConfig(state?.rule ?? null);
              const nextDue = formatClientPreventiveNextDue({
                lastServiceAt: state?.lastServiceAt,
                lastPerformedFromRule: state?.rule?.last_performed_date ?? null,
                intervalValue: config.intervalValue,
                intervalType: config.intervalType,
                ruleNextDueDate: state?.rule?.next_due_date ?? null,
              });

              return (
                <tr key={item.id} className={styles.row}>
                  <td className={styles.cellEquip}>
                    <p className={styles.equipName}>{equipmentLabel(item)}</p>
                    {item.location ? <p className={styles.equipMeta}>{item.location}</p> : null}
                    {nextDue ? (
                      <p className={styles.equipMeta}>
                        Próximo vencimento: <strong>{nextDue}</strong>
                      </p>
                    ) : null}
                  </td>
                  <td className={styles.cellDate}>
                    {state?.lastServiceLabel ? (
                      <span className={styles.dateBadge}>{state.lastServiceLabel}</span>
                    ) : (
                      <span className={styles.dateMuted}>Sem OS concluída vinculada</span>
                    )}
                  </td>
                  <td className={styles.cellControls}>
                    {state?.canConfigure ? (
                      <EquipmentPreventiveInlineRow
                        equipmentKey={item.id}
                        disabled={readOnly}
                        initialConfig={ruleToConfig(state?.rule ?? null)}
                        onConfigChange={(cfg) =>
                          setDraftConfigByEquipment((prev) => ({ ...prev, [item.id]: cfg }))
                        }
                        onSave={(cfg) => handleSave(item, cfg)}
                      />
                    ) : (
                      <p className={styles.unavailable}>
                        Sincronize o equipamento com o cadastro HVAC para habilitar a preventiva.
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {toast ? (
        <p
          className={`${styles.toast} ${toast.kind === "ok" ? styles.toastOk : styles.toastErr}`}
          role={toast.kind === "ok" ? "status" : "alert"}
        >
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
