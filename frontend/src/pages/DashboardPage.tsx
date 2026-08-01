import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SubscriptionGuard } from "../components/billing/SubscriptionGuard";
import { AppSidebar } from "../components/dashboard/AppSidebar";
import { UserMenu } from "../components/dashboard/UserMenu";
import { Sidebar } from "../components/v0-ui/Sidebar";
import {
  fetchCurrentTenant,
  fetchCurrentUser,
  logoutRevokeRefresh,
  type TenantOut,
  type UserOut,
} from "../api/auth";
import { financeQueryKeys } from "../features/finance/hooks/financeQueryKeys";
import { clearAccessToken, getAccessToken } from "../lib/authStorage";
import { isHiddenAppModule, isHiddenAppModulePath } from "../lib/hiddenAppModules";
import { isPurchasesEnabled } from "../lib/planProducts";
import { getPlanDisplayLabel } from "../lib/planRules";
import { getTenantDisplayName } from "../lib/tenantDisplay";
import {
  NavIconBox,
  NavIconBuilding,
  NavIconCalendar,
  NavIconChevronRight,
  NavIconClipboard,
  NavIconFileQuote,
  NavIconHome,
  NavIconKey,
  NavIconLock,
  NavIconLogOut,
  NavIconPackage,
  NavIconPmoc,
  NavIconPuzzle,
  NavIconUserCircle,
  NavIconUsers,
  NavIconWallet,
  NavIconWrench,
  NavIconX,
} from "../components/dashboard/NavIcons";
import type { DashboardOutletContext } from "./dashboardContext";
import { isPlatformOperatorUser } from "../lib/platformAdmin";
import { NotificationCenterPanel, type LocalNotificationItem } from "../components/notifications/NotificationCenterPanel";
import { NotificationAlertHost } from "../components/NotificationAlertHost";
import { useNotificationAlerts } from "../features/notifications/hooks/useNotificationAlerts";
import { KnowledgeChatProvider } from "../context/KnowledgeChatContext";
import { FloatingActionChat } from "../components/chat/FloatingActionChat";
import { useNotificationUnreadCount } from "../features/notifications/hooks/useNotifications";
import { PlatformBrandMark } from "../components/branding/PlatformBrandMark";
import styles from "./DashboardPage.module.css";

const SIDEBAR_COLLAPSED_KEY = "climaris.sidebarCollapsed";
const PREF_AUTOCOLLAPSE_KEY = "climaris.pref.autoCollapseSidebar";
const PREF_HIDE_HOME_WIDGETS_KEY = "climaris.pref.hideHomeWidgets";
const DISMISSED_LOCAL_NOTIFICATIONS_KEY = "climaris.dismissedLocalNotifications";

function loadDismissedLocalNotifications(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_LOCAL_NOTIFICATIONS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function tenantInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navId = useId();
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const tenantPlanKeyRef = useRef<string | null>(null);
  const [checkingTenant, setCheckingTenant] = useState(true);
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [user, setUser] = useState<UserOut | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [mobileNavMenuOpen, setMobileNavMenuOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState("");
  const [prefAutoCollapseSidebar, setPrefAutoCollapseSidebar] = useState(false);
  const [prefHideHomeWidgets, setPrefHideHomeWidgets] = useState(false);
  const [dismissedLocalNotificationIds, setDismissedLocalNotificationIds] = useState<Set<string>>(
    () => loadDismissedLocalNotifications(),
  );
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const isAccountRoute = location.pathname.startsWith("/app/conta");
  const isNotificationsRoute = location.pathname.startsWith("/app/notifications");
  const isPlanosRoute = location.pathname.startsWith("/app/planos");
  const isAdminRoute = location.pathname.startsWith("/app/admin");
  const isClientsRoute = location.pathname.startsWith("/app/clients");
  const MODERN_SHELL_LIST_ROUTES = [
    "/app/clients",
    "/app/products",
    "/app/services",
    "/app/pmoc",
    "/app/service-orders",
    "/app/budgets",
  ];
  const isProductsRoute = location.pathname.startsWith("/app/products");
  const isServicesRoute = location.pathname.startsWith("/app/services");
  const isClientsListRoute =
    isClientsRoute ||
    isProductsRoute ||
    isServicesRoute ||
    MODERN_SHELL_LIST_ROUTES.some((route) => location.pathname === route || location.pathname === `${route}/`);
  const isServiceOrdersRoute = location.pathname.startsWith("/app/service-orders");
  const isBudgetsRoute = location.pathname.startsWith("/app/budgets");
  const isFinanceRoute = location.pathname.startsWith("/app/finance");
  const isAgendaRoute = location.pathname.startsWith("/app/agenda");
  const isPreventiveRoute = location.pathname.startsWith("/app/preventive-maintenance");
  const isFiscalRoute = !isHiddenAppModule("nfse") && location.pathname.startsWith("/app/fiscal");
  const isPmocRoute = location.pathname.startsWith("/app/pmoc");
  const isDashboardHomeRoute = location.pathname === "/app";
  const isMarketplaceRoute = !isHiddenAppModule("marketplace") && location.pathname.startsWith("/app/marketplace");
  const isWhatsappBotRoute =
    !isHiddenAppModule("whatsappBot") && location.pathname.startsWith("/app/integrations/whatsapp-bot");
  const isWhatsappCampanhasRoute =
    !isHiddenAppModule("whatsappCampanhas") &&
    location.pathname.startsWith("/app/integrations/whatsapp-campanhas");
  const isWhatsappRoute = location.pathname.startsWith("/app/integrations/whatsapp");
  const isChatIaRoute =
    !isHiddenAppModule("chatIa") && location.pathname.startsWith("/app/integrations/chat-ia");
  const isMercadoLivreRoute =
    !isHiddenAppModule("mercadoLivre") && location.pathname.startsWith("/app/integrations/mercado-livre");
  const purchasesEnabled = isPurchasesEnabled(tenant);
  const showClientModule = user?.role !== "technician";
  const useCompactMobileHeader = isMobileLayout;
  const pageTitle = isDashboardHomeRoute && isMobileLayout
    ? "Painel de Controle"
    : isAccountRoute
    ? "Minha conta"
    : isNotificationsRoute
      ? "Notificações"
    : isPlanosRoute
      ? "Plano e assinatura"
    : isAdminRoute
    ? "Administração"
    : isClientsRoute
      ? "Clientes"
      : isProductsRoute
        ? "Produtos"
        : isServicesRoute
          ? "Serviços"
          : isServiceOrdersRoute
            ? "Ordens de serviço"
            : isBudgetsRoute
              ? "Orcamentos"
            : isFinanceRoute
              ? "Financeiro"
            : isAgendaRoute
              ? "Agenda"
            : isPreventiveRoute
              ? "Gestão preventiva"
            : isFiscalRoute
              ? "Fiscal"
            : isPmocRoute
              ? "PMOC"
            : isMarketplaceRoute
              ? "Loja de integrações"
            : isChatIaRoute
              ? "Chat IA"
            : isWhatsappCampanhasRoute
              ? "Campanhas WhatsApp"
            : isWhatsappBotRoute
              ? "Bot WhatsApp"
            : isWhatsappRoute
              ? "WhatsApp"
            : isMercadoLivreRoute
              ? "Mercado Livre"
          : "Painel";
  const { data: apiUnreadCount = 0 } = useNotificationUnreadCount(Boolean(user));
  useNotificationAlerts(Boolean(user));
  const dismissLocalNotification = useCallback((id: string) => {
    setDismissedLocalNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(DISMISSED_LOCAL_NOTIFICATIONS_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const localNotificationItems = useMemo((): LocalNotificationItem[] => {
    const items: LocalNotificationItem[] = [];
    if (user?.must_change_password && !dismissedLocalNotificationIds.has("local-password")) {
      items.push({
        id: "local-password",
        variant: "warn",
        body: "Altere sua senha temporária em Minha conta → Segurança.",
        href: "/app/conta?secao=seguranca",
      });
    }
    if (!prefAutoCollapseSidebar && !dismissedLocalNotificationIds.has("local-sidebar")) {
      items.push({
        id: "local-sidebar",
        variant: "local",
        body: "Dica: ative o recolhimento automático da sidebar nas preferências.",
      });
    }
    return items;
  }, [user?.must_change_password, prefAutoCollapseSidebar, dismissedLocalNotificationIds]);
  const unreadNotifications = apiUnreadCount + localNotificationItems.length;

  const applyTenantUpdate = useCallback(
    (t: TenantOut) => {
      const prevPlan = tenantPlanKeyRef.current;
      const nextPlan = t.active_plan;
      tenantPlanKeyRef.current = nextPlan;
      setTenant(t);
      if (prevPlan != null && prevPlan !== nextPlan) {
        void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all });
      }
    },
    [queryClient],
  );

  const refreshWorkspace = useCallback(async () => {
    try {
      const t = await fetchCurrentTenant();
      if (!t.registration_complete) {
        navigate("/complete-registration", { replace: true });
        return;
      }
      applyTenantUpdate(t);
      const u = await fetchCurrentUser();
      setUser(u);
    } catch {
      await logoutRevokeRefresh();
      clearAccessToken();
      navigate("/login", { replace: true });
    }
  }, [applyTenantUpdate, navigate]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && getAccessToken()) {
        void refreshWorkspace();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshWorkspace]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (v === "1") setNavCollapsed(true);
      setPrefAutoCollapseSidebar(localStorage.getItem(PREF_AUTOCOLLAPSE_KEY) === "1");
      setPrefHideHomeWidgets(localStorage.getItem(PREF_HIDE_HOME_WIDGETS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [navCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_AUTOCOLLAPSE_KEY, prefAutoCollapseSidebar ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [prefAutoCollapseSidebar]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_HIDE_HOME_WIDGETS_KEY, prefHideHomeWidgets ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [prefHideHomeWidgets]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function sync() {
      setIsMobileLayout(mq.matches);
      if (mq.matches) setNavCollapsed(false);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const u = await fetchCurrentUser();
        if (cancelled) return;
        if (isPlatformOperatorUser(u)) {
          navigate("/operacao", { replace: true });
          return;
        }
        const t = await fetchCurrentTenant();
        if (cancelled) return;
        if (!t.registration_complete) {
          navigate("/complete-registration", { replace: true });
          return;
        }
        tenantPlanKeyRef.current = t.active_plan;
        applyTenantUpdate(t);
        setUser(u);
      } catch {
        if (!cancelled) {
          void logoutRevokeRefresh();
          clearAccessToken();
          navigate("/login", { replace: true });
        }
        return;
      }
      if (!cancelled) setCheckingTenant(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    setWorkspaceDrawerOpen(false);
    setMobileNavMenuOpen(false);
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setPreferencesOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    // Sempre que mudar de rota dentro do app, começa no topo da página.
    const frame = window.requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!user?.must_change_password || checkingTenant) return;
    if (location.pathname.startsWith("/app/conta")) return;
    navigate("/app/conta?secao=seguranca", { replace: true });
  }, [user?.must_change_password, checkingTenant, location.pathname, navigate]);

  useEffect(() => {
    if (!workspaceDrawerOpen && !mobileNavMenuOpen && !globalSearchOpen && !notificationsOpen && !preferencesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setWorkspaceDrawerOpen(false);
        setMobileNavMenuOpen(false);
        setGlobalSearchOpen(false);
        setNotificationsOpen(false);
        setPreferencesOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workspaceDrawerOpen, mobileNavMenuOpen, globalSearchOpen, notificationsOpen, preferencesOpen]);

  useEffect(() => {
    if (!workspaceDrawerOpen && !mobileNavMenuOpen && !globalSearchOpen && !notificationsOpen && !preferencesOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [workspaceDrawerOpen, mobileNavMenuOpen, globalSearchOpen, notificationsOpen, preferencesOpen]);

  async function logout() {
    await logoutRevokeRefresh();
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  function openWorkspaceFromMobileMenu() {
    openWorkspaceDrawer();
  }

  function openWorkspaceDrawer() {
    setWorkspaceDrawerOpen(true);
  }

  const updateUser = useCallback((next: UserOut) => {
    setUser(next);
  }, []);

  function openGlobalSearchPanel() {
    setGlobalSearchOpen(true);
    setNotificationsOpen(false);
    setPreferencesOpen(false);
    setWorkspaceDrawerOpen(false);
    setMobileNavMenuOpen(false);
  }

  function openNotificationsPanel() {
    setNotificationsOpen(true);
    setGlobalSearchOpen(false);
    setPreferencesOpen(false);
    setWorkspaceDrawerOpen(false);
    setMobileNavMenuOpen(false);
  }

  function openPreferencesPanel() {
    setPreferencesOpen(true);
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setWorkspaceDrawerOpen(false);
    setMobileNavMenuOpen(false);
  }

  function submitGlobalSearch() {
    const t = globalSearchText.trim().toLowerCase();
    if (!t) return;
    const purchasesOn = tenant?.products_purchases_enabled === true;
    const inventoryOn = tenant?.products_inventory_allowed === true && tenant?.inventory_enabled !== false;
    const rules: Array<[string, string]> = [
      ["cliente", "/app/clients"],
      ["produto", "/app/products"],
      ...(inventoryOn ? ([["estoque", "/app/products"]] as Array<[string, string]>) : []),
      ...(purchasesOn ? ([["compra", "/app/purchases"], ["compras", "/app/purchases"]] as Array<[string, string]>) : []),
      ["serviço", "/app/services"],
      ["servico", "/app/services"],
      ["ordem", "/app/service-orders"],
      ["agenda", "/app/agenda"],
      ["orcamento", "/app/budgets"],
      ["orçamento", "/app/budgets"],
      ["config financeiro", "/app/finance/settings"],
      ["configuração financeiro", "/app/finance/settings"],
      ["financeiro", "/app/finance/dashboard"],
      ["nfs", "/app/fiscal/nfse"],
      ["nfse", "/app/fiscal/nfse"],
      ["nota fiscal", "/app/fiscal/nfse"],
      ["mercado livre", "/app/marketplace"],
      ["campanhas whatsapp", "/app/integrations/whatsapp-campanhas"],
      ["reativação whatsapp", "/app/integrations/whatsapp-campanhas"],
      ["bot whatsapp", "/app/integrations/whatsapp-bot"],
      ["chatbot", "/app/integrations/whatsapp-bot"],
      ["whatsapp", "/app/integrations/whatsapp"],
      ["chat ia", "/app/integrations/chat-ia"],
      ["assistente", "/app/integrations/chat-ia"],
      ["claude", "/app/integrations/chat-ia"],
      ["integra", "/app/marketplace"],
      ["pagar me", "/app/admin?tab=pagamentos"],
      ["pagarme", "/app/admin?tab=pagamentos"],
      ["admin", "/app/admin"],
      ["conta", "/app/conta"],
      ["perfil", "/app/conta"],
      ["minha conta", "/app/conta"],
      ["senha", "/app/conta?secao=seguranca"],
      ["segurança", "/app/conta?secao=seguranca"],
      ["inicio", "/app"],
      ["início", "/app"],
    ].filter((entry): entry is [string, string] => !isHiddenAppModulePath(entry[1]));
    const hit = rules.find(([k]) => t.includes(k));
    navigate(hit?.[1] ?? "/app");
    setGlobalSearchOpen(false);
    setGlobalSearchText("");
    if (prefAutoCollapseSidebar && !isMobileLayout) setNavCollapsed(true);
  }

  if (checkingTenant) {
    return (
      <div className={styles.shell}>
        <div className={styles.loading} role="status" aria-live="polite">
          <div className={styles.loadingCard}>
            <div className={styles.loadingShimmer} />
            <p className={styles.loadingText}>Carregando o painel…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <KnowledgeChatProvider>
    <Sidebar.Root
      expanded={!navCollapsed}
      onExpandedChange={(expanded) => setNavCollapsed(!expanded)}
    >
      <div className={`${styles.shell} ${navCollapsed ? styles.sidebarCollapsed : ""}`}>
        {!isMobileLayout ? (
          <AppSidebar
            navId={navId}
            user={user}
            tenant={tenant}
            onOpenWorkspaceFromMobile={openWorkspaceFromMobileMenu}
            onLogout={logout}
          />
        ) : null}

        <div className={styles.mainColumn}>
        <header
          className={`${styles.header} ${isMobileLayout ? styles.headerMobile : ""} ${isDashboardHomeRoute && isMobileLayout ? styles.headerMobileHome : ""} ${isClientsListRoute && !isMobileLayout ? styles.headerClientsModern : ""}`}
        >
          {!isMobileLayout ? <Sidebar.Toggle className={styles.headerSidebarToggle} /> : null}
          {isClientsListRoute && !isMobileLayout ? (
            <form
              className={styles.headerGlobalSearch}
              onSubmit={(e) => {
                e.preventDefault();
                openGlobalSearchPanel();
              }}
            >
              <span className={styles.headerGlobalSearchIcon} aria-hidden>
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                className={styles.headerGlobalSearchInput}
                value={globalSearchText}
                onChange={(e) => setGlobalSearchText(e.target.value)}
                onFocus={openGlobalSearchPanel}
                placeholder="Buscar no sistema..."
                aria-label="Buscar no sistema"
              />
            </form>
          ) : (
          <div className={styles.headerLeft}>
            {useCompactMobileHeader ? (
              <Link to="/app" className={styles.headerCompactBrandLink}>
                <PlatformBrandMark variant="operacao" showName={false} className={styles.headerCompactBrand} />
              </Link>
            ) : (
              <div className={styles.headerTitles}>
                <h1 className={styles.headerCompanyName}>{getTenantDisplayName(tenant)}</h1>
                <p className={styles.headerPageContext}>
                  {isDashboardHomeRoute && isMobileLayout ? `Boas-vindas, ${user?.full_name ?? "[Usuário]"}` : pageTitle}
                </p>
              </div>
            )}
          </div>
          )}

          <div className={styles.headerRight}>
            {user?.must_change_password ? (
              <Link className={styles.pwHint} to="/app/conta?secao=seguranca" role="status">
                Defina uma nova senha em Minha conta → Segurança
              </Link>
            ) : null}
            {useCompactMobileHeader ? (
              <div className={styles.headerTools} aria-label="Atalhos rápidos">
                <button
                  type="button"
                  className={`${styles.headerToolBtn} ${notificationsOpen ? styles.headerToolBtnActive : ""}`}
                  title="Notificações"
                  onClick={openNotificationsPanel}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                    <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                  </svg>
                  {unreadNotifications > 0 ? <span className={styles.headerToolDot} aria-hidden /> : null}
                </button>
                <Link className={`${styles.headerToolBtn} ${styles.headerMobileProfileBtn}`} to="/app/conta" title="Minha conta">
                  <NavIconUserCircle />
                </Link>
              </div>
            ) : (
              <>
                <div className={styles.headerTools} aria-label="Atalhos rápidos">
                  {!isClientsListRoute ? (
                  <button
                    type="button"
                    className={`${styles.headerToolBtn} ${globalSearchOpen ? styles.headerToolBtnActive : ""}`}
                    title="Pesquisar"
                    onClick={openGlobalSearchPanel}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </button>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.headerToolBtn} ${notificationsOpen ? styles.headerToolBtnActive : ""}`}
                    title="Notificações"
                    onClick={openNotificationsPanel}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                    </svg>
                    {unreadNotifications > 0 ? <span className={styles.headerToolDot} aria-hidden /> : null}
                  </button>
                  <button
                    type="button"
                    className={`${styles.headerToolBtn} ${preferencesOpen ? styles.headerToolBtnActive : ""}`}
                    title="Preferências"
                    onClick={openPreferencesPanel}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <circle cx="12" cy="12" r="3.2" />
                      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z" />
                    </svg>
                  </button>
                </div>
                {user ? (
                  <UserMenu
                    user={user}
                    isAdmin={user.role === "admin"}
                    onLogout={() => void logout()}
                    onOpenWorkspace={openWorkspaceDrawer}
                    subtitleMode={isClientsListRoute ? "role" : "email"}
                  />
                ) : null}
              </>
            )}
          </div>
        </header>

        <main ref={mainScrollRef} className={`${styles.main} ${isMobileLayout ? styles.mainMobile : ""} ${isClientsListRoute ? styles.mainClientsModern : ""}`} id="conteudo-principal">
          {isMobileLayout ? (
            <div className={styles.mobileScreenIntro}>
              <Link to="/app" className={styles.mobileScreenBrandLink}>
                <PlatformBrandMark variant="operacao" showName={false} className={styles.mobileScreenBrand} />
              </Link>
              {!isDashboardHomeRoute && !isServiceOrdersRoute && !isProductsRoute ? (
                <p className={styles.mobileScreenName}>{pageTitle}</p>
              ) : null}
            </div>
          ) : null}
          {tenant?.is_on_free_trial &&
          !tenant.subscription_access_blocked &&
          tenant.trial_days_remaining != null &&
          tenant.trial_days_remaining <= 7 ? (
            <p className={styles.trialBanner} role="status">
              Teste gratuito: faltam {tenant.trial_days_remaining} dia(s).{" "}
              <Link to="/app/planos">Assine um plano</Link> para não perder o acesso.
            </p>
          ) : null}
          {user && tenant ? (
            <SubscriptionGuard tenant={tenant}>
              <Outlet
                context={
                  {
                    user,
                    tenant,
                    refreshWorkspace,
                    updateUser,
                  } satisfies DashboardOutletContext
                }
              />
            </SubscriptionGuard>
          ) : null}
        </main>
        {isMobileLayout ? (
          <nav className={styles.mobileBottomNav} aria-label="Navegação principal mobile">
            <Link to="/app" className={`${styles.mobileBottomNavItem} ${isDashboardHomeRoute ? styles.mobileBottomNavItemActive : ""}`}>
              <NavIconHome className={styles.mobileBottomNavIcon} />
              <span>Início</span>
            </Link>
            <Link
              to="/app/service-orders"
              className={`${styles.mobileBottomNavItem} ${isServiceOrdersRoute ? styles.mobileBottomNavItemActive : ""}`}
            >
              <NavIconClipboard className={styles.mobileBottomNavIcon} />
              <span>OS</span>
            </Link>
            <Link to="/app/agenda" className={`${styles.mobileBottomNavItem} ${isAgendaRoute ? styles.mobileBottomNavItemActive : ""}`}>
              <NavIconCalendar className={styles.mobileBottomNavIcon} />
              <span>Agenda</span>
            </Link>
            <Link
              to="/app/finance/dashboard"
              className={`${styles.mobileBottomNavItem} ${isFinanceRoute ? styles.mobileBottomNavItemActive : ""}`}
            >
              <NavIconWallet className={styles.mobileBottomNavIcon} />
              <span>Financeiro</span>
            </Link>
            <button
              type="button"
              className={`${styles.mobileBottomNavItem} ${mobileNavMenuOpen ? styles.mobileBottomNavItemActive : ""}`}
              onClick={() => setMobileNavMenuOpen(true)}
            >
              <NavIconPackage className={styles.mobileBottomNavIcon} />
              <span>Menu</span>
            </button>
          </nav>
        ) : null}
      </div>
      {mobileNavMenuOpen && isMobileLayout ? (
        <div className={styles.mobileMenuRoot} role="presentation">
          <button
            type="button"
            className={styles.mobileMenuBackdrop}
            aria-label="Fechar menu"
            onClick={() => setMobileNavMenuOpen(false)}
          />
          <aside
            className={styles.mobileMenuPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            onClick={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest("a")) setMobileNavMenuOpen(false);
            }}
          >
            <div className={styles.mobileMenuTop}>
              <h2 id="mobile-menu-title" className={styles.mobileMenuTitle}>
                Menu completo
              </h2>
              <button type="button" className={styles.mobileMenuClose} onClick={() => setMobileNavMenuOpen(false)} aria-label="Fechar">
                <NavIconX />
              </button>
            </div>

            <div className={styles.mobileMenuSection}>
              <p className={styles.mobileMenuSectionLabel}>Operação</p>
              {showClientModule ? (
                <Link className={styles.mobileMenuLink} to="/app/clients">
                  <span className={styles.mobileMenuLinkStart}><NavIconUsers /> Clientes</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              <Link className={styles.mobileMenuLink} to="/app/products">
                <span className={styles.mobileMenuLinkStart}><NavIconBox /> Produtos</span>
                <NavIconChevronRight />
              </Link>
              {showClientModule && purchasesEnabled ? (
                <Link className={styles.mobileMenuLink} to="/app/purchases">
                  <span className={styles.mobileMenuLinkStart}><NavIconPackage /> Compras</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              <Link className={styles.mobileMenuLink} to="/app/services">
                <span className={styles.mobileMenuLinkStart}><NavIconWrench /> Serviços</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/service-orders">
                <span className={styles.mobileMenuLinkStart}><NavIconClipboard /> Ordens de serviço</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/agenda">
                <span className={styles.mobileMenuLinkStart}><NavIconCalendar /> Agenda</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/preventive-maintenance">
                <span className={styles.mobileMenuLinkStart}><NavIconWrench /> Gestão preventiva</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/pmoc">
                <span className={styles.mobileMenuLinkStart}><NavIconPmoc /> PMOC</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/qrcodes">
                <span className={styles.mobileMenuLinkStart}><NavIconClipboard /> Etiquetas QR</span>
                <NavIconChevronRight />
              </Link>
            </div>

            <div className={styles.mobileMenuSection}>
              <p className={styles.mobileMenuSectionLabel}>Comercial</p>
              <Link className={styles.mobileMenuLink} to="/app/budgets">
                <span className={styles.mobileMenuLinkStart}><NavIconFileQuote /> Orçamentos</span>
                <NavIconChevronRight />
              </Link>
              <Link className={styles.mobileMenuLink} to="/app/finance/dashboard">
                <span className={styles.mobileMenuLinkStart}><NavIconWallet /> Financeiro</span>
                <NavIconChevronRight />
              </Link>
              {!isHiddenAppModule("nfse") ? (
                <Link className={styles.mobileMenuLink} to="/app/fiscal/nfse">
                  <span className={styles.mobileMenuLinkStart}><NavIconFileQuote /> NFS-e</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
            </div>

            <div className={styles.mobileMenuSection}>
              <p className={styles.mobileMenuSectionLabel}>Integrações</p>
              {!isHiddenAppModule("marketplace") ? (
                <Link className={styles.mobileMenuLink} to="/app/marketplace">
                  <span className={styles.mobileMenuLinkStart}><NavIconPuzzle /> Loja de integrações</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              <Link className={styles.mobileMenuLink} to="/app/integrations/whatsapp">
                <span className={styles.mobileMenuLinkStart}><NavIconPackage /> WhatsApp</span>
                <NavIconChevronRight />
              </Link>
              {!isHiddenAppModule("whatsappCampanhas") ? (
                <Link className={styles.mobileMenuLink} to="/app/integrations/whatsapp-campanhas">
                  <span className={styles.mobileMenuLinkStart}><NavIconPackage /> Campanhas WhatsApp</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              {!isHiddenAppModule("whatsappBot") ? (
                <Link className={styles.mobileMenuLink} to="/app/integrations/whatsapp-bot">
                  <span className={styles.mobileMenuLinkStart}><NavIconPackage /> Bot WhatsApp</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              {!isHiddenAppModule("chatIa") ? (
                <Link className={styles.mobileMenuLink} to="/app/integrations/chat-ia">
                  <span className={styles.mobileMenuLinkStart}><NavIconClipboard /> Chat IA</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
            </div>

            <div className={styles.mobileMenuSection}>
              <p className={styles.mobileMenuSectionLabel}>Conta</p>
              <Link className={styles.mobileMenuLink} to="/app/conta">
                <span className={styles.mobileMenuLinkStart}><NavIconUsers /> Minha conta</span>
                <NavIconChevronRight />
              </Link>
              {user?.role === "admin" ? (
                <Link className={styles.mobileMenuLink} to="/app/admin">
                  <span className={styles.mobileMenuLinkStart}><NavIconBuilding /> Administração</span>
                  <NavIconChevronRight />
                </Link>
              ) : null}
              <button type="button" className={`${styles.mobileMenuLink} ${styles.mobileMenuLogout}`} onClick={() => void logout()}>
                <span className={styles.mobileMenuLinkStart}><NavIconLogOut /> Sair</span>
              </button>
            </div>
          </aside>
        </div>
      ) : null}
      {workspaceDrawerOpen ? (
        <div className={styles.accountDrawerRoot} role="presentation">
          <button
            type="button"
            className={styles.accountDrawerBackdrop}
            aria-label="Fechar painel"
            onClick={() => setWorkspaceDrawerOpen(false)}
          />
          <aside
            className={styles.accountDrawerPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-drawer-title"
          >
            <div className={styles.accountDrawerToolbar}>
              <h2 id="workspace-drawer-title" className={styles.accountDrawerTitle}>
                Administração
              </h2>
              <button
                type="button"
                className={styles.accountDrawerClose}
                onClick={() => setWorkspaceDrawerOpen(false)}
                aria-label="Fechar"
              >
                <NavIconX className={styles.accountDrawerCloseIcon} />
              </button>
            </div>

            <div className={styles.accountDrawerProfile}>
              <div className={`${styles.accountDrawerAvatarLarge} ${styles.accountDrawerAvatarTenant}`} aria-hidden>
                {tenant?.logo_url ? (
                  <img
                    src={`${tenant.logo_url}${tenant.logo_url.includes("?") ? "&" : "?"}t=${encodeURIComponent(tenant.logo_updated_at ?? "")}`}
                    alt=""
                    className={styles.accountDrawerTenantLogo}
                  />
                ) : (
                  tenant ? tenantInitial(getTenantDisplayName(tenant)) : "—"
                )}
              </div>
              <div className={styles.accountDrawerProfileText}>
                <span className={styles.accountDrawerProfileName}>{getTenantDisplayName(tenant)}</span>
                <span className={styles.accountDrawerProfileEmail}>
                  Plano{" "}
                  <strong>
                    {tenant
                      ? getPlanDisplayLabel(tenant.active_plan, tenant.active_plan_label)
                      : "—"}
                  </strong>
                </span>
              </div>
            </div>

            <div className={styles.accountDrawerScroll}>
              {user?.role === "admin" ? (
                <>
                  <p className={styles.accountDrawerSectionLabel}>Configurações</p>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=empresa"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconBuilding />
                    </span>
                    Empresa
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=usuarios"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconUsers />
                    </span>
                    Usuários
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=pagamentos"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconWallet />
                    </span>
                    Pagamentos (Pagar.me)
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=api-keys"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconKey />
                    </span>
                    Chaves de API
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/security/trusted-devices"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconLock />
                    </span>
                    Dispositivos confiáveis (2FA)
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/finance/settings"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconWallet />
                    </span>
                    Financeiro
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=orcamentos"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconFileQuote />
                    </span>
                    Modelos de orçamento
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/pmoc/settings"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconPmoc />
                    </span>
                    Configurações do PMOC
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=garantia"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconFileQuote />
                    </span>
                    Configurações da Garantia
                  </Link>
                  {!isHiddenAppModule("nfse") ? (
                    <Link
                      className={styles.accountDrawerLinkRow}
                      to="/app/admin?tab=fiscal"
                      onClick={() => {
                        setWorkspaceDrawerOpen(false);
                      }}
                    >
                      <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                        <NavIconFileQuote />
                      </span>
                      Fiscal
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className={styles.accountDrawerNonAdmin}>Disponível para administradores do workspace.</p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {globalSearchOpen ? (
        <div className={styles.toolPanelRoot} role="presentation">
          <button type="button" className={styles.toolPanelBackdrop} aria-label="Fechar painel" onClick={() => setGlobalSearchOpen(false)} />
          <aside className={styles.toolPanel} role="dialog" aria-modal="true" aria-labelledby="global-search-title">
            <div className={styles.toolPanelTop}>
              <h2 id="global-search-title" className={styles.toolPanelTitle}>
                Busca global
              </h2>
              <button type="button" className={styles.toolPanelClose} onClick={() => setGlobalSearchOpen(false)} aria-label="Fechar">
                <NavIconX />
              </button>
            </div>
            <p className={styles.toolPanelLead}>Digite um módulo, cliente, produto ou ação para abrir rapidamente.</p>
            <form
              className={styles.toolPanelSearchRow}
              onSubmit={(e) => {
                e.preventDefault();
                submitGlobalSearch();
              }}
            >
              <input
                className={styles.toolPanelInput}
                value={globalSearchText}
                onChange={(e) => setGlobalSearchText(e.target.value)}
                placeholder="Ex.: clientes, ordens de serviço, financeiro, loja de integrações..."
                autoFocus
              />
              <button type="submit" className={styles.toolPanelBtn}>
                Ir
              </button>
            </form>
            <div className={styles.toolPanelQuick}>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/clients")}>
                Clientes
              </button>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/service-orders")}>
                Ordens de serviço
              </button>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/budgets")}>
                Orçamentos
              </button>
              {!isHiddenAppModule("marketplace") ? (
                <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/marketplace")}>
                  Loja de integrações
                </button>
              ) : null}
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/whatsapp")}>
                WhatsApp
              </button>
              {!isHiddenAppModule("chatIa") ? (
                <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/chat-ia")}>
                  Chat IA
                </button>
              ) : null}
              {!isHiddenAppModule("whatsappBot") ? (
                <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/whatsapp-bot")}>
                  Bot WhatsApp
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      <NotificationAlertHost />

      <NotificationCenterPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        localItems={localNotificationItems}
        onDismissLocal={dismissLocalNotification}
      />

      {preferencesOpen ? (
        <div className={styles.toolPanelRoot} role="presentation">
          <button type="button" className={styles.toolPanelBackdrop} aria-label="Fechar painel" onClick={() => setPreferencesOpen(false)} />
          <aside className={styles.toolPanel} role="dialog" aria-modal="true" aria-labelledby="preferences-title">
            <div className={styles.toolPanelTop}>
              <h2 id="preferences-title" className={styles.toolPanelTitle}>
                Preferências
              </h2>
              <button type="button" className={styles.toolPanelClose} onClick={() => setPreferencesOpen(false)} aria-label="Fechar">
                <NavIconX />
              </button>
            </div>
            <label className={styles.prefRow}>
              <input
                type="checkbox"
                checked={prefAutoCollapseSidebar}
                onChange={(e) => setPrefAutoCollapseSidebar(e.target.checked)}
              />
              Recolher sidebar automaticamente após usar busca global
            </label>
            <label className={styles.prefRow}>
              <input
                type="checkbox"
                checked={prefHideHomeWidgets}
                onChange={(e) => setPrefHideHomeWidgets(e.target.checked)}
              />
              Ocultar widgets extras do painel inicial (aplicação futura)
            </label>
            <p className={styles.toolPanelLead}>Essas preferências são salvas só neste navegador.</p>
          </aside>
        </div>
      ) : null}
    </div>
    <FloatingActionChat />
    </Sidebar.Root>
    </KnowledgeChatProvider>
  );
}
