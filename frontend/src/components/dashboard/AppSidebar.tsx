import { Link } from "react-router-dom";
import type { TenantOut, UserOut } from "../../api/auth";
import { isPurchasesEnabled } from "../../lib/planProducts";
import { isHiddenAppModule } from "../../lib/hiddenAppModules";
import {
  NavIconAirCompliance,
  NavIconBox,
  NavIconCalendar,
  NavIconChevronRight,
  NavIconClipboard,
  NavIconContact,
  NavIconFileQuote,
  NavIconHome,
  NavIconLayoutDashboard,
  NavIconLogOut,
  NavIconPackage,
  NavIconShoppingBag,
  NavIconStore,
  NavIconPmoc,
  NavIconPuzzle,
  NavIconSettings,
  NavIconUsers,
  NavIconWallet,
  NavIconWrench,
} from "./NavIcons";
import { Sidebar, useSidebar } from "../v0-ui/Sidebar";
import { PlatformBrandMark } from "../branding/PlatformBrandMark";
import styles from "../../pages/DashboardPage.module.css";

function userInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

function SidebarBrandMark() {
  const { expanded, mobileOpen } = useSidebar();
  return (
    <PlatformBrandMark
      variant="sidebar"
      showName={false}
      sidebarExpanded={expanded || mobileOpen}
    />
  );
}

export interface AppSidebarProps {
  navId: string;
  user: UserOut | null;
  tenant?: TenantOut | null;
  onOpenWorkspaceFromMobile: () => void;
  onLogout: () => void;
}

export function AppSidebar({
  navId,
  user,
  tenant,
  onOpenWorkspaceFromMobile,
  onLogout,
}: AppSidebarProps) {
  const purchasesEnabled = isPurchasesEnabled(tenant);
  const accessBlocked = Boolean(tenant?.subscription_access_blocked);

  if (accessBlocked) {
    return (
      <Sidebar.Container>
        <Sidebar.Header
          showToggle={false}
          className={styles.appSidebarHeader}
          brandClassName={styles.appSidebarHeaderBrand}
        >
          <SidebarBrandMark />
        </Sidebar.Header>
        <Sidebar.Content id={navId}>
          <Sidebar.Group label="Assinatura">
            {user?.role === "admin" ? (
              <p style={{ margin: "0.5rem 0.75rem", fontSize: "0.82rem", lineHeight: 1.45, opacity: 0.85 }}>
                Acesso suspenso. Renove o plano em Plano e assinatura no menu da conta.
              </p>
            ) : (
              <p style={{ margin: "0.5rem 0.75rem", fontSize: "0.82rem", lineHeight: 1.45, opacity: 0.85 }}>
                Acesso suspenso. Peça ao administrador para assinar um plano.
              </p>
            )}
          </Sidebar.Group>

          <div className={styles.sidebarMobileOnly} role="region" aria-label="Conta e sessão">
            <Link to="/app/conta" className={styles.sidebarMobileRow}>
              <span className={styles.sidebarMobileAvatar} aria-hidden>
                {user ? userInitial(user.full_name) : "—"}
              </span>
              <span className={styles.sidebarMobileRowLabel}>Minha conta</span>
              <span className={styles.sidebarMobileRowChevron} aria-hidden>
                <NavIconChevronRight />
              </span>
            </Link>
            {user?.role === "admin" ? (
              <button type="button" className={styles.sidebarMobileRow} onClick={onOpenWorkspaceFromMobile}>
                <span className={styles.sidebarMobileRowIcon} aria-hidden>
                  <NavIconSettings />
                </span>
                <span className={styles.sidebarMobileRowLabel}>Administração</span>
                <span className={styles.sidebarMobileRowChevron} aria-hidden>
                  <NavIconChevronRight />
                </span>
              </button>
            ) : null}
            {user?.role === "admin" ? (
              <Link to="/app/planos" className={styles.sidebarMobileRow}>
                <span className={styles.sidebarMobileRowIcon} aria-hidden>
                  <NavIconWallet />
                </span>
                <span className={styles.sidebarMobileRowLabel}>Plano e assinatura</span>
                <span className={styles.sidebarMobileRowChevron} aria-hidden>
                  <NavIconChevronRight />
                </span>
              </Link>
            ) : null}
            <button type="button" className={styles.sidebarMobileLogout} onClick={onLogout}>
              <NavIconLogOut className={styles.sidebarMobileLogoutIcon} />
              Sair
            </button>
          </div>
        </Sidebar.Content>
      </Sidebar.Container>
    );
  }

  return (
    <Sidebar.Container>
      <Sidebar.Header
        showToggle={false}
        className={styles.appSidebarHeader}
        brandClassName={styles.appSidebarHeaderBrand}
      >
        <SidebarBrandMark />
      </Sidebar.Header>

      <Sidebar.Content id={navId}>
        <Sidebar.Group label="Principal">
          <Sidebar.Item to="/app" end title="Início" icon={<NavIconHome />}>
            Início
          </Sidebar.Item>
          <Sidebar.Item to="/app" title="Dashboard" icon={<NavIconLayoutDashboard />}>
            Dashboard
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Operação">
          {user?.role !== "technician" ? (
            <Sidebar.Item to="/app/clients" title="Clientes" icon={<NavIconContact />}>
              Clientes
            </Sidebar.Item>
          ) : null}
          <Sidebar.Item to="/app/products" title="Produtos" icon={<NavIconBox />}>
            Produtos
          </Sidebar.Item>
          {user?.role !== "technician" && purchasesEnabled ? (
            <Sidebar.Item to="/app/purchases" title="Compras de produtos" icon={<NavIconShoppingBag />}>
              Compras
            </Sidebar.Item>
          ) : null}
          <Sidebar.Item to="/app/catalogo" title="Equipamentos" icon={<NavIconStore />}>
            Equipamentos
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/preventive-maintenance"
            title="Atividades — Gestão preventiva, manutenções a vencer"
            icon={<NavIconAirCompliance />}
          >
            Atividades
          </Sidebar.Item>
          <Sidebar.Item to="/app/services" title="Serviços" icon={<NavIconWrench />}>
            Serviços
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/pmoc"
            title="PMOC — Plano de Manutenção, Operação e Controle (Lei nº 13.589/2018)"
            icon={<NavIconPmoc />}
          >
            PMOC
          </Sidebar.Item>
          <Sidebar.Item to="/app/service-orders" title="Ordens de serviço" icon={<NavIconClipboard />}>
            Ordens de serviço
          </Sidebar.Item>
          <Sidebar.Item to="/app/agenda" title="Agenda dos técnicos" icon={<NavIconCalendar />}>
            Agenda
          </Sidebar.Item>
          <Sidebar.Item to="/app/qrcodes" title="Gestão de etiquetas QR" icon={<NavIconClipboard />}>
            Etiquetas QR
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Comercial">
          <Sidebar.Item to="/app/budgets" title="Orçamentos" icon={<NavIconFileQuote />}>
            Orçamentos
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/finance/dashboard"
            matchPrefix="/app/finance"
            title="Financeiro"
            icon={<NavIconWallet />}
          >
            Financeiro
          </Sidebar.Item>
          {!isHiddenAppModule("nfse") ? (
            <Sidebar.Item to="/app/fiscal/nfse" title="NFS-e" icon={<NavIconFileQuote />}>
              NFS-e
            </Sidebar.Item>
          ) : null}
        </Sidebar.Group>

        <Sidebar.Group label="Integrações">
          {!isHiddenAppModule("marketplace") ? (
            <Sidebar.Item to="/app/marketplace" title="Loja de integrações" icon={<NavIconPuzzle />}>
              Loja de integrações
            </Sidebar.Item>
          ) : null}
          <Sidebar.Item to="/app/integrations/whatsapp" title="WhatsApp" icon={<NavIconPackage />}>
            WhatsApp
          </Sidebar.Item>
          {!isHiddenAppModule("whatsappCampanhas") ? (
            <Sidebar.Item
              to="/app/integrations/whatsapp-campanhas"
              title="Campanhas WhatsApp"
              icon={<NavIconPackage />}
            >
              Campanhas WhatsApp
            </Sidebar.Item>
          ) : null}
          {!isHiddenAppModule("whatsappBot") ? (
            <Sidebar.Item
              to="/app/integrations/whatsapp-bot"
              title="Bot WhatsApp"
              icon={<NavIconPackage />}
            >
              Bot WhatsApp
            </Sidebar.Item>
          ) : null}
          {!isHiddenAppModule("chatIa") ? (
            <Sidebar.Item to="/app/integrations/chat-ia" title="Chat IA (Claude)" icon={<NavIconClipboard />}>
              Chat IA
            </Sidebar.Item>
          ) : null}
        </Sidebar.Group>

        <Sidebar.Group label="Configurações">
          <Sidebar.Item to="/app/conta" title="Configurações" icon={<NavIconSettings />}>
            Configurações
          </Sidebar.Item>
          {user?.role === "admin" ? (
            <Sidebar.Item to="/app/admin" title="Usuários" icon={<NavIconUsers />}>
              Usuários
            </Sidebar.Item>
          ) : null}
        </Sidebar.Group>

        <Sidebar.Footer>
          <a
            href="https://climaris.com.br/contato"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sidebarHelpBtn}
          >
            Central de ajuda
          </a>
        </Sidebar.Footer>

        <div className={styles.sidebarMobileOnly} role="region" aria-label="Conta e sessão">
          {user?.must_change_password ? (
            <p className={styles.sidebarMobilePwHint} role="status">
              Altere a senha temporária ao abrir Minha conta.
            </p>
          ) : null}
          <Link to="/app/conta" className={styles.sidebarMobileRow}>
            <span className={styles.sidebarMobileAvatar} aria-hidden>
              {user ? userInitial(user.full_name) : "—"}
            </span>
            <span className={styles.sidebarMobileRowLabel}>Minha conta</span>
            <span className={styles.sidebarMobileRowChevron} aria-hidden>
              <NavIconChevronRight />
            </span>
          </Link>
          {user?.role === "admin" ? (
            <button type="button" className={styles.sidebarMobileRow} onClick={onOpenWorkspaceFromMobile}>
              <span className={styles.sidebarMobileRowIcon} aria-hidden>
                <NavIconSettings />
              </span>
              <span className={styles.sidebarMobileRowLabel}>Administração</span>
              <span className={styles.sidebarMobileRowChevron} aria-hidden>
                <NavIconChevronRight />
              </span>
            </button>
          ) : null}
          {user?.role === "admin" ? (
            <Link to="/app/planos" className={styles.sidebarMobileRow}>
              <span className={styles.sidebarMobileRowIcon} aria-hidden>
                <NavIconWallet />
              </span>
              <span className={styles.sidebarMobileRowLabel}>Plano e assinatura</span>
              <span className={styles.sidebarMobileRowChevron} aria-hidden>
                <NavIconChevronRight />
              </span>
            </Link>
          ) : null}
          <button type="button" className={styles.sidebarMobileLogout} onClick={onLogout}>
            <NavIconLogOut className={styles.sidebarMobileLogoutIcon} />
            Sair
          </button>
        </div>
      </Sidebar.Content>
    </Sidebar.Container>
  );
}
