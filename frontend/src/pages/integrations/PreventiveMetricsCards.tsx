import { CalendarCheck, ClipboardList, Percent } from "lucide-react";
import styles from "./CampaignDashboard.module.css";

export type PreventiveTabMetrics = {
  pendingLeads: number;
  activeEquipments: number;
  schedulingRate: number;
};

type Props = {
  metrics: PreventiveTabMetrics;
  loading?: boolean;
};

export function PreventiveMetricsCards({ metrics, loading }: Props) {
  const cards = [
    {
      icon: ClipboardList,
      label: "Preventivas pendentes",
      value: loading ? "—" : String(metrics.pendingLeads),
      hint: "Respostas aguardando follow-up",
    },
    {
      icon: CalendarCheck,
      label: "Contratos ativos",
      value: loading ? "—" : String(metrics.activeEquipments),
      hint: "Equipamentos no mês atual",
    },
    {
      icon: Percent,
      label: "Taxa de agendamento",
      value: loading ? "—" : `${metrics.schedulingRate}%`,
      hint: "Interessados que pediram agendar",
    },
  ];

  return (
    <div className={styles.kpiGrid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.kpiCard}>
          <div className={styles.kpiIconWrap}>
            <card.icon size={18} strokeWidth={2} />
          </div>
          <p className={styles.kpiLabel}>{card.label}</p>
          <p className={styles.kpiValue}>{card.value}</p>
          {card.hint ? <p className={styles.kpiHint}>{card.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
