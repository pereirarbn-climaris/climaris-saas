import { Activity, MessageCircle, Percent, Send } from "lucide-react";
import styles from "./CampaignDashboard.module.css";

type Metrics = {
  sent: number;
  total: number;
  running: number;
  avgConversion: number;
  count: number;
};

type Props = {
  metrics: Metrics;
  loading?: boolean;
};

export function CampaignMetricsCards({ metrics, loading }: Props) {
  const cards = [
    {
      icon: Send,
      label: "Total de envios",
      value: loading ? "—" : metrics.sent.toLocaleString("pt-BR"),
      hint: loading ? "" : `De ${metrics.total.toLocaleString("pt-BR")} destinatários`,
    },
    {
      icon: Percent,
      label: "Conversão global",
      value: loading ? "—" : `${metrics.avgConversion}%`,
      hint: "OS atribuídas (30 dias)",
    },
    {
      icon: Activity,
      label: "Campanhas ativas",
      value: loading ? "—" : String(metrics.running),
      hint: "Em disparo agora",
    },
    {
      icon: MessageCircle,
      label: "Campanhas",
      value: loading ? "—" : String(metrics.count),
      hint: "No histórico",
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
