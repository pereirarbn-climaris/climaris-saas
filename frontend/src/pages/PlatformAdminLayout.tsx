import { useCallback, useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { changeMyPassword, fetchCurrentTenant, fetchCurrentUser, logoutRevokeRefresh, type TenantOut, type UserOut } from "../api/auth";
import { NavIconChevronDown, NavIconKey, NavIconLayoutDashboard, NavIconPuzzle } from "../components/dashboard/NavIcons";
import { clearAccessToken, getAccessToken } from "../lib/authStorage";
import { PLATFORM_ADMIN_EMAIL, isPlatformOperatorUser } from "../lib/platformAdmin";
import type { PlatformAdminOutletContext } from "./platformAdminContext";
import dash from "./DashboardPage.module.css";
import styles from "./PlatformAdminLayout.module.css";

function userInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

export function PlatformAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const navId = useId();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<UserOut | null>(null);
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isApiKeysRoute = location.pathname.startsWith("/operacao/chaves-api");
  const isTenantsRoute = location.pathname.startsWith("/operacao/clientes");
  const isPlansRoute = location.pathname.startsWith("/operacao/planos");
  const isSecurityRoute = location.pathname.startsWith("/operacao/seguranca");
  const isMarketplaceRoute = location.pathname.startsWith("/operacao/loja");
  const isBanksRoute = location.pathname.startsWith("/operacao/bancos");
  const isPagarmeRoute = location.pathname.startsWith("/operacao/pagar-me");
  const pageTitle = isApiKeysRoute
    ? "Chaves APIs"
    : isTenantsRoute
      ? "Clientes SaaS"
      : isPlansRoute
        ? "Planos SaaS"
        : isSecurityRoute
          ? "Segurança"
          : isMarketplaceRoute
            ? "Loja e liberações"
            : isBanksRoute
              ? "Bancos (wizard de contas)"
              : isPagarmeRoute
                ? "Pagar.me (referência)"
                : location.pathname === "/operacao"
                  ? "Painel de operação"
                  : "Operação Climaris";

  const refreshWorkspace = useCallback(async () => {
    const u = await fetchCurrentUser();
    setUser(u);
    try {
      setTenant(await fetchCurrentTenant());
    } catch {
      setTenant(null);
    }
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
        if (!isPlatformOperatorUser(u)) {
          navigate("/app", { replace: true });
          return;
        }
        setUser(u);
        try {
          const t = await fetchCurrentTenant();
          if (!cancelled) setTenant(t);
        } catch {
          if (!cancelled) setTenant(null);
        }
      } catch {
        if (!cancelled) {
          void logoutRevokeRefresh();
          clearAccessToken();
          navigate("/login", { replace: true });
        }
        return;
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function sync() {
      setIsMobileLayout(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  async function logout() {
    await logoutRevokeRefresh();
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  function openPasswordModal() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg(null);
    setPasswordModalOpen(true);
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

  if (checking) {
    return (
      <div className={dash.shell}>
        <div className={dash.loading} role="status" aria-live="polite">
          <div className={dash.loadingCard}>
            <div className={dash.loadingShimmer} />
            <p className={dash.loadingText}>Carregando operação…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={`${dash.shell} ${styles.platformShell}`}>
      <div
        className={`${dash.backdrop} ${sidebarOpen ? dash.backdropVisible : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        id={navId}
        className={`${styles.opSidebar} ${sidebarOpen ? styles.opSidebarOpen : ""}`}
        aria-label="Navegação da operação"
      >
        <div className={styles.opHeader}>
          <div className={styles.opBrandRow}>
            <span className={styles.opLogoMark} aria-hidden>
              <span className={styles.opLogoLetter}>C</span>
            </span>
            <div className={styles.opBrandText}>
              <span className={styles.opBrandName}>Climaris</span>
              <span className={styles.opBrandTag}>Operação</span>
            </div>
          </div>
        </div>

        <nav className={styles.opNav} aria-label="Módulos da plataforma">
          <p className={styles.opNavSection}>Plataforma</p>
          <ul className={styles.opNavList}>
            <li>
              <NavLink
                to="/operacao"
                end
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <NavIconLayoutDashboard />
                </span>
                Painel
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/clientes"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <path d="M20 8v6" />
                    <path d="M23 11h-6" />
                  </svg>
                </span>
                Clientes SaaS
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/planos"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M4 6h16v12H4z" />
                    <path d="M8 10h8M8 14h5" />
                  </svg>
                </span>
                Planos SaaS
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/seguranca"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                Segurança
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/chaves-api"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <NavIconKey />
                </span>
                Chaves APIs
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/bancos"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </span>
                Bancos (contas)
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/pagar-me"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <path d="M1 10h22" />
                    <path d="M6 15h4" />
                  </svg>
                </span>
                Pagar.me
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/operacao/loja"
                className={({ isActive }) => `${styles.opNavLink} ${isActive ? styles.opNavLinkActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <NavIconPuzzle />
                </span>
                Loja & liberações
              </NavLink>
            </li>
            <li>
              <a
                className={styles.opNavLink}
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSidebarOpen(false)}
              >
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                  </svg>
                </span>
                API (Swagger)
              </a>
            </li>
            <li>
              <a className={styles.opNavLink} href="/health" target="_blank" rel="noopener noreferrer" onClick={() => setSidebarOpen(false)}>
                <span className={styles.opNavIcon} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </span>
                Status da API
              </a>
            </li>
          </ul>
        </nav>

        <div className={styles.opWorkspace}>
          <p className={styles.opWorkspaceLabel}>Workspace</p>
          <button type="button" className={styles.opWorkspaceBtn} onClick={() => setSidebarOpen(false)}>
            <span className={styles.opWorkspaceTitle}>Plataforma Climaris</span>
            <span className={styles.opWorkspaceChevron} aria-hidden>
              <NavIconChevronDown />
            </span>
          </button>
          <span className={styles.opWorkspaceBadge}>Operação</span>
        </div>

        <div className={styles.opFooter}>
          <div>Contato</div>
          <a href={`mailto:${PLATFORM_ADMIN_EMAIL}`}>{PLATFORM_ADMIN_EMAIL}</a>
        </div>
      </aside>

      <div className={`${dash.mainColumn} ${styles.platformMainColumn}`}>
        <header className={`${dash.header} ${styles.platformHeader} ${isMobileLayout ? dash.headerMobile : ""}`}>
          <div className={dash.headerLeft}>
            <button
              type="button"
              className={dash.menuBtn}
              aria-expanded={sidebarOpen}
              aria-controls={navId}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span className={dash.menuIcon} aria-hidden />
              <span className={dash.srOnly}>{sidebarOpen ? "Fechar menu" : "Abrir menu"}</span>
            </button>
            <div className={dash.headerTitles}>
              <p className={styles.opBreadcrumb}>Operação Climaris</p>
              <h1 className={dash.pageTitle}>{pageTitle}</h1>
              <p className={dash.headerSubtitle}>
                Administração do produto SaaS — não é o app dos clientes.
              </p>
            </div>
          </div>

          <div className={`${dash.headerRight} ${styles.platformHeaderRight}`}>
            {user.must_change_password ? (
              <p className={dash.pwHint} role="status">
                Altere a senha temporária quando possível.
              </p>
            ) : null}
            <div className={dash.userBlock}>
              <div className={dash.avatar} aria-hidden>
                {userInitial(user.full_name)}
              </div>
              <div className={dash.userMeta}>
                <span className={dash.userName}>{user.full_name}</span>
                <span className={dash.userEmail}>{user.email}</span>
                <span className={styles.platformBadge}>Operação</span>
              </div>
            </div>
            <button type="button" className={dash.logout} onClick={logout}>
              Sair
            </button>
            <button type="button" className={dash.logout} onClick={openPasswordModal}>
              Alterar senha
            </button>
          </div>
        </header>

        <main className={`${dash.main} ${styles.opMainCanvas}`} id="conteudo-principal">
          <div className={styles.opOutletPanel}>
            <Outlet
              context={
                {
                  user,
                  tenant,
                  refreshWorkspace,
                } satisfies PlatformAdminOutletContext
              }
            />
          </div>
        </main>
      </div>

      {passwordModalOpen ? (
        <div className={dash.passwordModalRoot} role="presentation">
          <button
            type="button"
            className={dash.passwordModalBackdrop}
            aria-label="Fechar"
            onClick={() => setPasswordModalOpen(false)}
          />
          <div
            className={dash.passwordModalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-change-password-title"
          >
            <h2 id="platform-change-password-title" className={dash.passwordModalTitle}>
              Alterar senha
            </h2>
            <label className={dash.passwordModalLabel} htmlFor="platform-current-password">
              Senha atual
            </label>
            <input
              id="platform-current-password"
              className={dash.passwordModalInput}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <label className={dash.passwordModalLabel} htmlFor="platform-new-password">
              Nova senha
            </label>
            <input
              id="platform-new-password"
              className={dash.passwordModalInput}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <label className={dash.passwordModalLabel} htmlFor="platform-confirm-password">
              Confirmar nova senha
            </label>
            <input
              id="platform-confirm-password"
              className={dash.passwordModalInput}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {passwordMsg ? (
              <p className={passwordMsg.kind === "ok" ? dash.passwordModalOk : dash.passwordModalErr}>{passwordMsg.text}</p>
            ) : null}
            <div className={dash.passwordModalActions}>
              <button type="button" className={dash.logout} onClick={() => setPasswordModalOpen(false)}>
                Fechar
              </button>
              <button type="button" className={dash.logout} disabled={changingPassword} onClick={() => void submitPasswordChange()}>
                {changingPassword ? "Salvando..." : "Salvar senha"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
