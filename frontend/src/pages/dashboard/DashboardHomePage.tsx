import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { listClients } from "../../api/clients";
import { listProducts } from "../../api/products";
import { listServices } from "../../api/services";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./DashboardHomePage.module.css";

type StatItem = {
  icon: "orders" | "calendar" | "clients" | "products" | "services";
  title: string;
  value: string;
  description: string;
  trend?: string;
  variant?: "default" | "primary" | "success";
};

function greetingByHour(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardHomePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [clientsCount, setClientsCount] = useState<string>("—");
  const [activeProductsCount, setActiveProductsCount] = useState<string>("—");
  const [activeServicesCount, setActiveServicesCount] = useState<string>("—");
  const [greeting, setGreeting] = useState(() => greetingByHour(new Date()));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [clients, products, services] = await Promise.all([
          listClients({ limit: 100 }),
          listProducts({ limit: 100 }),
          listServices({ limit: 100 }),
        ]);
        if (cancelled) return;
        setClientsCount(String(clients.length));
        setActiveProductsCount(String(products.filter((p) => p.is_active).length));
        setActiveServicesCount(String(services.filter((s) => s.is_active).length));
      } catch {
        if (cancelled) return;
        setClientsCount("—");
        setActiveProductsCount("—");
        setActiveServicesCount("—");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setGreeting(greetingByHour(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const stats: StatItem[] = useMemo(
    () => [
      {
        icon: "orders",
        title: "Ordens em aberto",
        value: "12",
        description: "4 aguardando aprovação",
        trend: "+8%",
        variant: "primary",
      },
      {
        icon: "calendar",
        title: "Agendamentos hoje",
        value: "5",
        description: "Calendário do tenant",
      },
      {
        icon: "clients",
        title: "Clientes ativos",
        value: clientsCount,
        description: "Base de clientes",
        trend: "+12%",
        variant: "success",
      },
      {
        icon: "products",
        title: "Produtos ativos",
        value: activeProductsCount,
        description: "Catálogo de produtos",
      },
      {
        icon: "services",
        title: "Serviços ativos",
        value: activeServicesCount,
        description: "Catálogo para agendamentos",
      },
    ],
    [clientsCount, activeProductsCount, activeServicesCount],
  );

  const onboardingSteps = [
    {
      id: "1",
      title: "Cadastre clientes e produtos",
      description: "Prepare a operação diária",
      href: "/app/clients",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 12h-4" />
          <path d="M20 10v4" />
        </svg>
      ),
    },
    {
      id: "2",
      title: "Cadastre serviços",
      description: "Monte ordens de serviço",
      href: "/app/services",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      ),
    },
    {
      id: "3",
      title: "Configure feriados e janelas",
      description: "Ajuste o calendário dos técnicos",
      href: "/app/agenda",
      icon: (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      ),
    },
    {
      id: "4",
      title: "Aprove uma OS",
      description: "Gere o agendamento automático",
      href: "/app/service-orders",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      ),
    },
  ];

  const activities = [
    {
      id: "1",
      type: "done" as const,
      title: "OS #1247 concluída",
      description: "Instalação de ar condicionado - Cliente João Silva",
      time: "Há 2 horas",
    },
    {
      id: "2",
      type: "calendar" as const,
      title: "Novo agendamento",
      description: "Manutenção preventiva - Empresa ABC Ltda",
      time: "Há 3 horas",
    },
    {
      id: "3",
      type: "client" as const,
      title: "Novo cliente cadastrado",
      description: "Maria Oliveira - Residencial",
      time: "Há 5 horas",
    },
  ];

  return (
    <div className={styles.panel}>
      {/* Welcome Hero */}
      <section className={styles.hero} aria-labelledby="dashboard-home-title">
        <div>
          <h2 id="dashboard-home-title" className={styles.heroTitle}>
            {greeting}, {ctx?.user.full_name?.split(" ")[0] ?? "usuário"}!
          </h2>
          <p className={styles.heroLead}>Aqui está o resumo das suas operações.</p>
        </div>
        <button type="button" className={styles.heroBtn}>
          <span className={styles.heroBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <polyline points="16 6 21 6 21 11" />
              <path d="m21 6-8 8-4-4-6 6" />
            </svg>
          </span>
          Ver relatórios
        </button>
      </section>

      {/* Stats Grid */}
      <section className={styles.stats} aria-label="Indicadores">
        <ul className={styles.statGrid}>
          {stats.map((s) => (
            <li 
              key={s.title} 
              className={`${styles.statCard} ${s.variant === "primary" ? styles.statCardPrimary : ""} ${s.variant === "success" ? styles.statCardSuccess : ""}`}
            >
              <div className={styles.statTop}>
                <div>
                  <p className={styles.statLabel}>{s.title}</p>
                </div>
                <span className={styles.statIcon} aria-hidden>
                  <svg viewBox="0 0 24 24">
                    {s.icon === "orders" ? (
                      <>
                        <rect x="6" y="4.5" width="12" height="15" rx="2.2" />
                        <path d="M9 9h6M9 12h6M9 15h4" />
                      </>
                    ) : s.icon === "calendar" ? (
                      <>
                        <rect x="4.5" y="6.5" width="15" height="12" rx="2.2" />
                        <path d="M8 4.8v3M16 4.8v3M4.5 10.5h15" />
                      </>
                    ) : s.icon === "clients" ? (
                      <>
                        <circle cx="9" cy="9" r="2.5" />
                        <circle cx="15.8" cy="10" r="2" />
                        <path d="M5.6 16.8c.7-2 2.4-3.2 4.4-3.2s3.6 1.2 4.3 3.2M13.2 16.8c.45-1.2 1.4-2 2.6-2.2" />
                      </>
                    ) : s.icon === "products" ? (
                      <>
                        <path d="M12 4.8 6 8v8l6 3.2 6-3.2V8z" />
                        <path d="M6 8l6 3.2L18 8M12 11.2V19" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19 12h1.6M3.4 12H5M12 5V3.4M12 20.6V19M17 7l1.1-1.1M5.9 18.1 7 17M17 17l1.1 1.1M5.9 5.9 7 7" />
                      </>
                    )}
                  </svg>
                </span>
              </div>
              <div className={styles.statValueRow}>
                <p className={styles.statValue}>{s.value}</p>
                {s.trend && <span className={styles.statDelta}>{s.trend}</span>}
              </div>
              <p className={styles.statHint}>{s.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Monthly KPI Highlight */}
      <section className={styles.highlight}>
        <div className={styles.highlightContent}>
          <div className={styles.highlightIconWrap} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <p className={styles.highlightLabel}>OS concluídas este mês</p>
            <div className={styles.highlightValueRow}>
              <span className={styles.highlightValue}>42</span>
              <span className={styles.highlightMeta}>+18% vs. mês anterior</span>
            </div>
          </div>
        </div>
        <button type="button" className={styles.highlightBtn}>
          <span>Ver detalhes</span>
          <span className={styles.highlightBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </span>
        </button>
      </section>

      {/* Bottom Split Cards */}
      <section className={styles.split} aria-labelledby="dash-next-title">
        {/* Onboarding Steps */}
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 id="dash-next-title" className={styles.cardTitle}>
              <span className={styles.titleCount}>4</span>
              Próximos passos
            </h3>
          </div>
          <div className={styles.progressRow}>
            <span>Progresso</span>
            <span>0 de 4 concluídos</span>
          </div>
          <div className={styles.progressTrack} aria-hidden>
            <span />
          </div>
          <ul className={styles.checklist}>
            {onboardingSteps.map((step) => (
              <li key={step.id} onClick={() => navigate(step.href)}>
                <div className={styles.itemIcon} aria-hidden>
                  {step.icon}
                </div>
                <div className={styles.itemContent}>
                  <strong>{step.title}</strong>
                  <span className={styles.itemDesc}>{step.description}</span>
                </div>
                <button type="button" className={styles.itemAction} aria-label="Abrir etapa">
                  <svg viewBox="0 0 24 24">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </article>

        {/* Activity Feed */}
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Atividade recente</h3>
            <button type="button" className={styles.linkBtn}>
              Ver tudo
            </button>
          </div>
          <ul className={styles.activityList}>
            {activities.map((activity) => (
              <li key={activity.id}>
                <div 
                  className={`${styles.activityIcon} ${
                    activity.type === "done" ? styles.activityDone : 
                    activity.type === "calendar" ? styles.activityCalendar : 
                    styles.activityClient
                  }`} 
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24">
                    {activity.type === "done" ? (
                      <path d="M20 6 9 17l-5-5" />
                    ) : activity.type === "calendar" ? (
                      <>
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <path d="M16 2v4" />
                        <path d="M8 2v4" />
                        <path d="M3 10h18" />
                      </>
                    ) : (
                      <>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                      </>
                    )}
                  </svg>
                </div>
                <div className={styles.activityContent}>
                  <strong>{activity.title}</strong>
                  <span className={styles.activityDesc}>{activity.description}</span>
                  <time>{activity.time}</time>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
