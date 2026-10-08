import { useCallback, useEffect, useId, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  changeMyPassword,
  fetchCurrentTenant,
  fetchCurrentUser,
  logoutRevokeRefresh,
  patchCurrentUser,
  type TenantOut,
  type UserOut,
  type UserRole,
} from "../api/auth";
import { clearAccessToken, getAccessToken } from "../lib/authStorage";
import { digitsOnlyPhoneForApi, formatPhoneBrInput } from "../lib/brMask";
import {
  NavIconAirCompliance,
  NavIconBuilding,
  NavIconBox,
  NavIconCalendar,
  NavIconChevronDown,
  NavIconChevronLeft,
  NavIconChevronRight,
  NavIconClipboard,
  NavIconContact,
  NavIconFileQuote,
  NavIconHome,
  NavIconInventory,
  NavIconKey,
  NavIconLock,
  NavIconLogOut,
  NavIconPackage,
  NavIconPuzzle,
  NavIconSettings,
  NavIconUserCircle,
  NavIconUsers,
  NavIconWallet,
  NavIconWrench,
  NavIconX,
} from "../components/dashboard/NavIcons";
import type { DashboardOutletContext } from "./dashboardContext";
import { isPlatformOperatorUser } from "../lib/platformAdmin";
import styles from "./DashboardPage.module.css";

const SIDEBAR_COLLAPSED_KEY = "climaris.sidebarCollapsed";
const PREF_AUTOCOLLAPSE_KEY = "climaris.pref.autoCollapseSidebar";
const PREF_HIDE_HOME_WIDGETS_KEY = "climaris.pref.hideHomeWidgets";

function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "technician":
      return "Técnico";
    case "receptionist":
      return "Recepção";
    default:
      return role;
  }
}

function userInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

function tenantInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navId = useId();
  const [checkingTenant, setCheckingTenant] = useState(true);
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [user, setUser] = useState<UserOut | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileWhatsapp, setProfileWhatsapp] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState("");
  const [prefAutoCollapseSidebar, setPrefAutoCollapseSidebar] = useState(false);
  const [prefHideHomeWidgets, setPrefHideHomeWidgets] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const isAdminRoute = location.pathname.startsWith("/app/admin");
  const isClientsRoute = location.pathname.startsWith("/app/clients");
  const isProductsRoute = location.pathname.startsWith("/app/products");
  const isInventoryRoute = location.pathname.startsWith("/app/inventory");
  const isServicesRoute = location.pathname.startsWith("/app/services");
  const isServiceOrdersRoute = location.pathname.startsWith("/app/service-orders");
  const isBudgetsRoute = location.pathname.startsWith("/app/budgets");
  const isFinanceRoute = location.pathname.startsWith("/app/finance");
  const isAgendaRoute = location.pathname.startsWith("/app/agenda");
  const isPreventiveRoute = location.pathname.startsWith("/app/preventive-maintenance");
  const isFiscalRoute = location.pathname.startsWith("/app/fiscal");
  const isPmocRoute = location.pathname.startsWith("/app/pmoc");
  const isMarketplaceRoute = location.pathname.startsWith("/app/marketplace");
  const isWhatsappBotRoute = location.pathname.startsWith("/app/integrations/whatsapp-bot");
  const isWhatsappRoute = location.pathname.startsWith("/app/integrations/whatsapp");
  const isChatIaRoute = location.pathname.startsWith("/app/integrations/chat-ia");
  const isMercadoLivreRoute = location.pathname.startsWith("/app/integrations/mercado-livre");
  const pageTitle = isAdminRoute
    ? "Administração"
    : isClientsRoute
      ? "Clientes"
      : isProductsRoute
        ? "Produtos"
        : isInventoryRoute
          ? "Estoque"
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
            : isWhatsappBotRoute
              ? "Bot WhatsApp"
            : isWhatsappRoute
              ? "WhatsApp"
            : isMercadoLivreRoute
              ? "Mercado Livre"
          : "Painel";
  const unreadNotifications = (user?.must_change_password ? 1 : 0) + (prefAutoCollapseSidebar ? 0 : 1);

  const refreshWorkspace = useCallback(async () => {
    try {
      const t = await fetchCurrentTenant();
      if (!t.registration_complete) {
        navigate("/complete-registration", { replace: true });
        return;
      }
      setTenant(t);
      const u = await fetchCurrentUser();
      setUser(u);
    } catch {
      await logoutRevokeRefresh();
      clearAccessToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

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
        setTenant(t);
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
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    setWorkspaceDrawerOpen(false);
    setAccountDrawerOpen(false);
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setPreferencesOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accountDrawerOpen && !workspaceDrawerOpen && !globalSearchOpen && !notificationsOpen && !preferencesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAccountDrawerOpen(false);
        setWorkspaceDrawerOpen(false);
        setGlobalSearchOpen(false);
        setNotificationsOpen(false);
        setPreferencesOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountDrawerOpen, workspaceDrawerOpen, globalSearchOpen, notificationsOpen, preferencesOpen]);

  useEffect(() => {
    if (!accountDrawerOpen && !workspaceDrawerOpen && !globalSearchOpen && !notificationsOpen && !preferencesOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [accountDrawerOpen, workspaceDrawerOpen, globalSearchOpen, notificationsOpen, preferencesOpen]);

  async function logout() {
    await logoutRevokeRefresh();
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function openAccountFromMobileMenu() {
    closeSidebar();
    openAccountDrawer();
  }

  function openWorkspaceFromMobileMenu() {
    closeSidebar();
    openWorkspaceDrawer();
  }

  function toggleNavCollapsed() {
    setNavCollapsed((v) => !v);
  }

  function openWorkspaceDrawer() {
    setWorkspaceDrawerOpen(true);
    setAccountDrawerOpen(false);
  }

  function openAccountDrawer() {
    if (user) {
      setProfileFullName(user.full_name);
      setProfileEmail(user.email);
      setProfilePhone(user.phone ? formatPhoneBrInput(String(user.phone)) : "");
      setProfileWhatsapp(user.whatsapp ? formatPhoneBrInput(String(user.whatsapp)) : "");
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfileMsg(null);
    setPasswordMsg(null);
    setAccountDrawerOpen(true);
    setWorkspaceDrawerOpen(false);
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setPreferencesOpen(false);
  }

  function openGlobalSearchPanel() {
    setGlobalSearchOpen(true);
    setNotificationsOpen(false);
    setPreferencesOpen(false);
    setAccountDrawerOpen(false);
    setWorkspaceDrawerOpen(false);
  }

  function openNotificationsPanel() {
    setNotificationsOpen(true);
    setGlobalSearchOpen(false);
    setPreferencesOpen(false);
    setAccountDrawerOpen(false);
    setWorkspaceDrawerOpen(false);
  }

  function openPreferencesPanel() {
    setPreferencesOpen(true);
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setAccountDrawerOpen(false);
    setWorkspaceDrawerOpen(false);
  }

  function submitGlobalSearch() {
    const t = globalSearchText.trim().toLowerCase();
    if (!t) return;
    const rules: Array<[string, string]> = [
      ["cliente", "/app/clients"],
      ["produto", "/app/products"],
      ["estoque", "/app/inventory"],
      ["serviço", "/app/services"],
      ["servico", "/app/services"],
      ["ordem", "/app/service-orders"],
      ["agenda", "/app/agenda"],
      ["orcamento", "/app/budgets"],
      ["orçamento", "/app/budgets"],
      ["config financeiro", "/app/finance/settings"],
      ["configuração financeiro", "/app/finance/settings"],
      ["financeiro", "/app/finance"],
      ["nfs", "/app/fiscal/nfse"],
      ["nfse", "/app/fiscal/nfse"],
      ["nota fiscal", "/app/fiscal/nfse"],
      ["mercado livre", "/app/marketplace"],
      ["bot whatsapp", "/app/integrations/whatsapp-bot"],
      ["chatbot", "/app/integrations/whatsapp-bot"],
      ["whatsapp", "/app/integrations/whatsapp"],
      ["chat ia", "/app/integrations/chat-ia"],
      ["assistente", "/app/integrations/chat-ia"],
      ["claude", "/app/integrations/chat-ia"],
      ["integra", "/app/marketplace"],
      ["admin", "/app/admin"],
      ["inicio", "/app"],
      ["início", "/app"],
    ];
    const hit = rules.find(([k]) => t.includes(k));
    navigate(hit?.[1] ?? "/app");
    setGlobalSearchOpen(false);
    setGlobalSearchText("");
    if (prefAutoCollapseSidebar && !isMobileLayout) setNavCollapsed(true);
  }

  async function submitProfile() {
    const name = profileFullName.trim();
    const email = profileEmail.trim();
    if (!name || !email) {
      setProfileMsg({ kind: "err", text: "Nome e e-mail são obrigatórios." });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const phoneDigits = profilePhone.trim() ? digitsOnlyPhoneForApi(profilePhone) : "";
      const waDigits = profileWhatsapp.trim() ? digitsOnlyPhoneForApi(profileWhatsapp) : "";
      const updated = await patchCurrentUser({
        full_name: name,
        email: email,
        phone: phoneDigits || null,
        whatsapp: waDigits || null,
      });
      setUser(updated);
      setProfileMsg({ kind: "ok", text: "Perfil salvo com sucesso." });
    } catch (e) {
      setProfileMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível salvar o perfil." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPasswordChange() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ kind: "err", text: "Preencha todos os campos de senha." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: "err", text: "A confirmação da nova senha não confere." });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordMsg({ kind: "err", text: "A nova senha deve ser diferente da senha atual." });
      return;
    }
    setChangingPassword(true);
    setPasswordMsg(null);
    try {
      await changeMyPassword({ current_password: currentPassword, new_password: newPassword });
      setUser((prev: UserOut | null) => (prev ? { ...prev, must_change_password: false } : prev));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ kind: "ok", text: "Senha alterada com sucesso." });
    } catch (e) {
      setPasswordMsg({ kind: "err", text: e instanceof Error ? e.message : "Não foi possível alterar a senha." });
    } finally {
      setChangingPassword(false);
    }
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
    <div className={styles.shell}>
      <div
        className={`${styles.backdrop} ${sidebarOpen ? styles.backdropVisible : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
      />

      <aside
        id={navId}
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""} ${navCollapsed ? styles.sidebarCollapsed : ""}`}
        aria-label="Navegação principal"
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brandRow}>
            <span className={styles.logoMark} aria-hidden />
            <span className={styles.brandName}>Climaris</span>
          </div>
          <button
            type="button"
            className={styles.collapseDesktopBtn}
            onClick={toggleNavCollapsed}
            aria-pressed={navCollapsed}
            title={navCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            <span className={styles.collapseIcon} aria-hidden>
              {navCollapsed ? <NavIconChevronRight /> : <NavIconChevronLeft />}
            </span>
            <span className={styles.srOnly}>{navCollapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
        </div>

        <nav className={styles.nav} aria-label="Módulos">
          <p className={styles.navSection}>Principal</p>
          <ul className={styles.navList}>
            <li>
              <NavLink
                to="/app"
                end
                title="Início"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconHome className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Início</span>
              </NavLink>
            </li>
          </ul>

          <p className={styles.navSection}>Operação</p>
          <ul className={styles.navList}>
            <li>
              <NavLink
                to="/app/clients"
                title="Clientes"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconContact className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Clientes</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/products"
                title="Produtos"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconBox className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Produtos</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/inventory"
                title="Estoque"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconInventory className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Estoque</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/services"
                title="Serviços"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconWrench className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Serviços</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/service-orders"
                title="Ordens de serviço"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconClipboard className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Ordens de serviço</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/agenda"
                title="Agenda dos tecnicos"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconCalendar className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Agenda</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/preventive-maintenance"
                title="Gestão preventiva — manutenções a vencer"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconAirCompliance className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Gestão preventiva</span>
              </NavLink>
            </li>
          </ul>

          <p className={styles.navSection}>Comercial</p>
          <ul className={styles.navList}>
            <li>
              <NavLink
                to="/app/budgets"
                title="Orcamentos"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconFileQuote className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Orçamentos</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/finance"
                title="Financeiro"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconWallet className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Financeiro</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/fiscal/nfse"
                title="NFS-e"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconFileQuote className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>NFS-e</span>
              </NavLink>
            </li>
          </ul>

          <p className={styles.navSection}>Integrações</p>
          <ul className={styles.navList}>
            <li>
              <NavLink
                to="/app/marketplace"
                title="Loja de integrações"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconPuzzle className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Loja de integrações</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/integrations/whatsapp"
                title="WhatsApp"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconPackage className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>WhatsApp</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/integrations/chat-ia"
                title="Chat IA (Claude)"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconClipboard className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Chat IA</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app/integrations/whatsapp-bot"
                title="Bot WhatsApp"
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={closeSidebar}
              >
                <span className={styles.navIcon} aria-hidden>
                  <NavIconPackage className={styles.navSvg} />
                </span>
                <span className={styles.navLabel}>Bot WhatsApp</span>
              </NavLink>
            </li>
          </ul>

          <div className={styles.sidebarMobileOnly} role="region" aria-label="Conta e sessão">
            {user?.must_change_password ? (
              <p className={styles.sidebarMobilePwHint} role="status">
                Altere a senha temporária ao abrir Minha conta.
              </p>
            ) : null}
            <button type="button" className={styles.sidebarMobileRow} onClick={openAccountFromMobileMenu}>
              <span className={styles.sidebarMobileAvatar} aria-hidden>
                {user ? userInitial(user.full_name) : "—"}
              </span>
              <span className={styles.sidebarMobileRowLabel}>Minha conta</span>
              <span className={styles.sidebarMobileRowChevron} aria-hidden>
                <NavIconChevronRight />
              </span>
            </button>
            {user?.role === "admin" ? (
              <button type="button" className={styles.sidebarMobileRow} onClick={openWorkspaceFromMobileMenu}>
                <span className={styles.sidebarMobileRowIcon} aria-hidden>
                  <NavIconSettings className={styles.navSvg} />
                </span>
                <span className={styles.sidebarMobileRowLabel}>Administração</span>
                <span className={styles.sidebarMobileRowChevron} aria-hidden>
                  <NavIconChevronRight />
                </span>
              </button>
            ) : null}
            <button type="button" className={styles.sidebarMobileLogout} onClick={logout}>
              <NavIconLogOut className={styles.sidebarMobileLogoutIcon} />
              Sair
            </button>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <>
            <p className={styles.workspaceLabel}>Workspace</p>
            {user?.role === "admin" ? (
              <button
                type="button"
                className={styles.workspaceNameBtn}
                onClick={openWorkspaceDrawer}
                aria-expanded={workspaceDrawerOpen}
                aria-haspopup="dialog"
                title="Administração: empresa, usuários, API e fiscal"
              >
                <span className={styles.workspaceName}>{tenant?.name ?? "—"}</span>
                <span className={styles.workspaceChevron} aria-hidden>
                  <NavIconChevronDown />
                </span>
              </button>
            ) : (
              <p className={styles.workspaceName}>{tenant?.name ?? "—"}</p>
            )}
            <p className={styles.planLine}>
              Plano <span className={styles.planBadge}>{tenant?.active_plan ?? "—"}</span>
            </p>
            {user?.role === "admin" ? (
              <Link
                className={styles.footerIconLink}
                to="/app/admin?tab=empresa"
                title="Configurações do workspace"
                onClick={closeSidebar}
              >
                <NavIconSettings className={styles.footerIconSvg} />
              </Link>
            ) : null}
          </>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={`${styles.header} ${isMobileLayout ? styles.headerMobile : ""}`}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              aria-expanded={sidebarOpen}
              aria-controls={navId}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span className={styles.menuIcon} aria-hidden />
              <span className={styles.srOnly}>{sidebarOpen ? "Fechar menu" : "Abrir menu"}</span>
            </button>
            <div className={styles.headerTitles}>
              <h1 className={styles.headerCompanyName}>{tenant?.name?.trim() || "—"}</h1>
              <p className={styles.headerPageContext}>{pageTitle}</p>
            </div>
          </div>

          <div className={styles.headerRight}>
            {user?.must_change_password ? (
              <p className={styles.pwHint} role="status">
                Altere a senha temporária quando possível.
              </p>
            ) : null}
            <div className={styles.headerTools} aria-label="Atalhos rápidos">
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
            <button
              type="button"
              className={`${styles.userBlock} ${styles.userBlockBtn}`}
              onClick={openAccountDrawer}
              aria-haspopup="dialog"
              aria-expanded={accountDrawerOpen}
              title="Minha conta e configurações"
            >
              <div className={styles.avatar} aria-hidden>
                {user ? userInitial(user.full_name) : "—"}
              </div>
              <div className={styles.userMeta}>
                <span className={styles.userName}>{user?.full_name ?? "—"}</span>
                <span className={styles.userEmail}>{user?.email ?? ""}</span>
              </div>
            </button>
          </div>
        </header>

        <main className={styles.main} id="conteudo-principal">
          {user && tenant ? (
            <Outlet
              context={
                {
                  user,
                  tenant,
                  refreshWorkspace,
                } satisfies DashboardOutletContext
              }
            />
          ) : null}
        </main>
      </div>
      {accountDrawerOpen ? (
        <div className={styles.accountDrawerRoot} role="presentation">
          <button
            type="button"
            className={styles.accountDrawerBackdrop}
            aria-label="Fechar painel"
            onClick={() => setAccountDrawerOpen(false)}
          />
          <aside
            className={styles.accountDrawerPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-drawer-title"
          >
            <div className={styles.accountDrawerToolbar}>
              <h2 id="account-drawer-title" className={styles.accountDrawerTitle}>
                Conta
              </h2>
              <button
                type="button"
                className={styles.accountDrawerClose}
                onClick={() => setAccountDrawerOpen(false)}
                aria-label="Fechar"
              >
                <NavIconX className={styles.accountDrawerCloseIcon} />
              </button>
            </div>

            <div className={styles.accountDrawerProfile}>
              <div className={styles.accountDrawerAvatarLarge} aria-hidden>
                {user ? userInitial(user.full_name) : "—"}
              </div>
              <div className={styles.accountDrawerProfileText}>
                <span className={styles.accountDrawerProfileName}>{user?.full_name ?? "—"}</span>
                <span className={styles.accountDrawerProfileEmail}>{user?.email ?? ""}</span>
              </div>
            </div>

            <div className={styles.accountDrawerScroll}>
              <p className={styles.accountDrawerSectionLabel}>Conta</p>

              <div className={styles.accountDrawerSubhead}>
                <span className={styles.accountDrawerSubheadIcon} aria-hidden>
                  <NavIconUserCircle />
                </span>
                Perfil
              </div>
              {user ? (
                <p className={styles.accountDrawerRoleLine}>
                  Função: <strong>{roleLabel(user.role)}</strong>
                </p>
              ) : null}
              <label className={styles.accountDrawerLabel} htmlFor="profile-full-name">
                Nome completo
              </label>
              <input
                id="profile-full-name"
                className={styles.accountDrawerInput}
                type="text"
                value={profileFullName}
                onChange={(e) => setProfileFullName(e.target.value)}
                autoComplete="name"
              />
              <label className={styles.accountDrawerLabel} htmlFor="profile-email">
                E-mail
              </label>
              <input
                id="profile-email"
                className={styles.accountDrawerInput}
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                autoComplete="email"
              />
              <label className={styles.accountDrawerLabel} htmlFor="profile-phone">
                Telefone
              </label>
              <input
                id="profile-phone"
                className={styles.accountDrawerInput}
                type="tel"
                value={profilePhone}
                onChange={(e) => setProfilePhone(formatPhoneBrInput(e.target.value))}
                autoComplete="tel"
                placeholder="(00) 00000-0000"
              />
              <label className={styles.accountDrawerLabel} htmlFor="profile-whatsapp">
                WhatsApp
              </label>
              <input
                id="profile-whatsapp"
                className={styles.accountDrawerInput}
                type="tel"
                value={profileWhatsapp}
                onChange={(e) => setProfileWhatsapp(formatPhoneBrInput(e.target.value))}
                autoComplete="tel"
                placeholder="(00) 00000-0000"
              />
              {profileMsg ? (
                <p className={profileMsg.kind === "ok" ? styles.accountDrawerOk : styles.accountDrawerErr}>{profileMsg.text}</p>
              ) : null}
              <div className={styles.accountDrawerActions}>
                <button
                  type="button"
                  className={styles.accountDrawerBtnPrimary}
                  disabled={savingProfile}
                  onClick={() => void submitProfile()}
                >
                  {savingProfile ? "Salvando..." : "Salvar perfil"}
                </button>
              </div>

              <div className={styles.accountDrawerSubhead}>
                <span className={styles.accountDrawerSubheadIcon} aria-hidden>
                  <NavIconLock />
                </span>
                Segurança
              </div>
              <label className={styles.accountDrawerLabel} htmlFor="current-password">
                Senha atual
              </label>
              <input
                id="current-password"
                className={styles.accountDrawerInput}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
              <label className={styles.accountDrawerLabel} htmlFor="new-password">
                Nova senha
              </label>
              <input
                id="new-password"
                className={styles.accountDrawerInput}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label className={styles.accountDrawerLabel} htmlFor="confirm-password">
                Confirmar nova senha
              </label>
              <input
                id="confirm-password"
                className={styles.accountDrawerInput}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {passwordMsg ? (
                <p className={passwordMsg.kind === "ok" ? styles.accountDrawerOk : styles.accountDrawerErr}>{passwordMsg.text}</p>
              ) : null}
              <div className={styles.accountDrawerActions}>
                <button
                  type="button"
                  className={styles.accountDrawerBtnSecondary}
                  disabled={changingPassword}
                  onClick={() => void submitPasswordChange()}
                >
                  {changingPassword ? "Salvando..." : "Salvar senha"}
                </button>
              </div>
            </div>

            <div className={styles.accountDrawerFooter}>
              <button type="button" className={styles.accountDrawerLogout} onClick={logout}>
                <NavIconLogOut className={styles.accountDrawerLogoutIcon} />
                Sair
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
                  tenant ? tenantInitial(tenant.name) : "—"
                )}
              </div>
              <div className={styles.accountDrawerProfileText}>
                <span className={styles.accountDrawerProfileName}>{tenant?.name ?? "—"}</span>
                <span className={styles.accountDrawerProfileEmail}>
                  Plano <strong>{tenant?.active_plan ?? "—"}</strong>
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
                      closeSidebar();
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
                      closeSidebar();
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconUsers />
                    </span>
                    Usuários
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=api-keys"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                      closeSidebar();
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
                      closeSidebar();
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
                      closeSidebar();
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconWallet />
                    </span>
                    Financeiro
                  </Link>
                  <Link
                    className={styles.accountDrawerLinkRow}
                    to="/app/admin?tab=fiscal"
                    onClick={() => {
                      setWorkspaceDrawerOpen(false);
                      closeSidebar();
                    }}
                  >
                    <span className={styles.accountDrawerLinkRowIcon} aria-hidden>
                      <NavIconFileQuote />
                    </span>
                    Fiscal
                  </Link>
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
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/marketplace")}>
                Loja de integrações
              </button>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/whatsapp")}>
                WhatsApp
              </button>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/chat-ia")}>
                Chat IA
              </button>
              <button type="button" className={styles.toolPanelQuickBtn} onClick={() => navigate("/app/integrations/whatsapp-bot")}>
                Bot WhatsApp
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {notificationsOpen ? (
        <div className={styles.toolPanelRoot} role="presentation">
          <button type="button" className={styles.toolPanelBackdrop} aria-label="Fechar painel" onClick={() => setNotificationsOpen(false)} />
          <aside className={styles.toolPanel} role="dialog" aria-modal="true" aria-labelledby="notifications-title">
            <div className={styles.toolPanelTop}>
              <h2 id="notifications-title" className={styles.toolPanelTitle}>
                Notificações
              </h2>
              <button type="button" className={styles.toolPanelClose} onClick={() => setNotificationsOpen(false)} aria-label="Fechar">
                <NavIconX />
              </button>
            </div>
            <ul className={styles.notificationList}>
              {user?.must_change_password ? (
                <li className={styles.notificationItemWarn}>Altere sua senha temporária para reforçar a segurança da conta.</li>
              ) : null}
              {!prefAutoCollapseSidebar ? (
                <li className={styles.notificationItem}>Dica: ative o recolhimento automático da sidebar nas preferências.</li>
              ) : null}
              <li className={styles.notificationItem}>Seu workspace está pronto para novas integrações e módulos.</li>
            </ul>
          </aside>
        </div>
      ) : null}

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
  );
}
