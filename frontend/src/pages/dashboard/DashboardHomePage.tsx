import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { DashboardTierBadge } from "../../components/dashboard/management/DashboardTierBadge";
import { hasDashboardTier } from "../../lib/dashboardEntitlements";
import type { DashboardOutletContext } from "../dashboardContext";
import { greetingByHour } from "./dashboardFormatters";
import { useDashboardHomeData } from "./useDashboardHomeData";
import { DashboardAdvancedView } from "./views/DashboardAdvancedView";
import { DashboardBasicView } from "./views/DashboardBasicView";
import { DashboardCompleteView } from "./views/DashboardCompleteView";
import styles from "./DashboardHomePage.module.css";

export function DashboardHomePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState(() => greetingByHour(new Date()));
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const canSeePmocIncidents =
    ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canUpgrade = ctx?.user.role === "admin";

  const data = useDashboardHomeData(canSeePmocIncidents);
  const mobileWelcomeName = useMemo(() => {
    const name = ctx?.user.full_name?.trim();
    if (!name) return "Usuário";
    const first = name.split(" ")[0]?.trim();
    return first && first.length > 0 ? first : "Usuário";
  }, [ctx?.user.full_name]);

  const userFirstName = ctx?.user.full_name?.split(" ")[0] ?? "usuário";

  useEffect(() => {
    const t = window.setInterval(() => setGreeting(greetingByHour(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function sync() {
      setIsMobileLayout(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const scrollToUpgradePreview = useCallback(() => {
    const el = document.getElementById("dashboard-upgrade-preview");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, []);

  const renderView = () => {
    if (hasDashboardTier(data.tier, "complete")) {
      return (
        <DashboardCompleteView
          data={data}
          userFirstName={userFirstName}
          onOpenReports={() => navigate("/app/finance/dashboard")}
        />
      );
    }
    if (hasDashboardTier(data.tier, "advanced")) {
      return (
        <DashboardAdvancedView
          data={data}
          userFirstName={userFirstName}
          onOpenReports={() => navigate("/app/finance/dashboard")}
          canUpgrade={canUpgrade}
        />
      );
    }
    return (
      <DashboardBasicView
        data={data}
        userFirstName={userFirstName}
        onOpenReports={() => navigate("/app/finance/dashboard")}
        canUpgrade={canUpgrade}
      />
    );
  };

  if (isMobileLayout) {
    return (
      <div className={`${styles.panel} ${styles.mobilePanel}`}>
        <section className={styles.mobileHero} aria-label="Painel mobile">
          <h2 className={styles.mobileTitle}>Painel de Controle</h2>
          <p className={styles.mobileLead}>Boas-vindas, {mobileWelcomeName}</p>
        </section>

        <div className={styles.mobileCardsGrid} role="navigation" aria-label="Módulos do sistema">
          <button type="button" className={`${styles.mobileCard} ${styles.mobileCardWide}`} onClick={() => navigate("/app/products")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              📦
            </span>
            <span className={styles.mobileCardTextWrap}>
              <span className={styles.mobileCardTitle}>Produtos</span>
              <span className={styles.mobileCardSubtitle}>Visualizar inventário</span>
            </span>
          </button>

          <button type="button" className={`${styles.mobileCard} ${styles.mobileCardWide}`} onClick={() => navigate("/app/service-orders")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              📋
            </span>
            <span className={styles.mobileCardTextWrap}>
              <span className={styles.mobileCardTitle}>Ordens de Serviço</span>
              <span className={styles.mobileCardSubtitle}>Gerenciar ordens ativas</span>
            </span>
          </button>

          <button type="button" className={styles.mobileCard} onClick={() => navigate("/app/agenda")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              📅
            </span>
            <span className={styles.mobileCardTextWrap}>
              <span className={styles.mobileCardTitle}>Agenda</span>
              <span className={styles.mobileCardSubtitle}>Próximos compromissos</span>
            </span>
          </button>

          <button type="button" className={styles.mobileCard} onClick={() => navigate("/app/finance/dashboard")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              💳
            </span>
            <span className={styles.mobileCardTextWrap}>
              <span className={styles.mobileCardTitle}>Financeiro</span>
              <span className={styles.mobileCardSubtitle}>Ver demonstrativos</span>
            </span>
          </button>

          <button type="button" className={`${styles.mobileCard} ${styles.mobileCardChip}`} onClick={() => navigate("/app/pmoc")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              ✅
            </span>
            <span className={styles.mobileCardTitle}>PMOC</span>
          </button>

          <button type="button" className={`${styles.mobileCard} ${styles.mobileCardChip}`} onClick={() => navigate("/app/qrcodes")}>
            <span className={styles.mobileCardIcon} aria-hidden>
              🔳
            </span>
            <span className={styles.mobileCardTitle}>Etiquetas QR</span>
          </button>
        </div>

        <div className={styles.mobileBottomGrid} role="navigation" aria-label="Atalhos rápidos">
          <button type="button" className={styles.mobileBottomCard} onClick={() => navigate("/app/services")}>
            <span className={styles.mobileBottomIcon} aria-hidden>
              🔧
            </span>
            <span className={styles.mobileBottomLabel}>Serviços</span>
          </button>
          <button type="button" className={styles.mobileBottomCard} onClick={() => navigate("/app/preventive-maintenance")}>
            <span className={styles.mobileBottomIcon} aria-hidden>
              ☀️
            </span>
            <span className={styles.mobileBottomLabel}>Gestão Preventiva</span>
          </button>
          <button type="button" className={styles.mobileBottomCard} onClick={() => navigate("/app/budgets")}>
            <span className={styles.mobileBottomIcon} aria-hidden>
              📄
            </span>
            <span className={styles.mobileBottomLabel}>Orçamentos</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <header className={styles.dashboardHeader}>
        <p className={styles.eyebrow} aria-hidden>
          {greeting}
        </p>
        <DashboardTierBadge
          tier={data.tier}
          onUpgradePreviewClick={
            hasDashboardTier(data.tier, "complete") ? undefined : scrollToUpgradePreview
          }
        />
      </header>

      {renderView()}
    </div>
  );
}
