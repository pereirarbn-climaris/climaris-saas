import { Link } from "react-router-dom";
import type { TenantOut, UserOut } from "../../api/auth";
import {
  NavIconAirCompliance,
  NavIconBox,
  NavIconCalendar,
  NavIconChevronDown,
  NavIconChevronRight,
  NavIconClipboard,
  NavIconContact,
  NavIconFileQuote,
  NavIconHome,
  NavIconInventory,
  NavIconLogOut,
  NavIconPackage,
  NavIconPuzzle,
  NavIconSettings,
  NavIconWallet,
  NavIconWrench,
} from "./NavIcons";
import { Sidebar } from "../v0-ui/Sidebar";
import styles from "../../pages/DashboardPage.module.css";

function userInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

export interface AppSidebarProps {
  navId: string;
  tenant: TenantOut | null;
  user: UserOut | null;
  workspaceDrawerOpen: boolean;
  onOpenWorkspaceDrawer: () => void;
  onOpenAccountFromMobile: () => void;
  onOpenWorkspaceFromMobile: () => void;
  onLogout: () => void;
}

export function AppSidebar({
  navId,
  tenant,
  user,
  workspaceDrawerOpen,
  onOpenWorkspaceDrawer,
  onOpenAccountFromMobile,
  onOpenWorkspaceFromMobile,
  onLogout,
}: AppSidebarProps) {
  return (
    <Sidebar.Container>
      <Sidebar.Header toggleClassName={styles.collapseDesktopBtn}>
        <div className={styles.brandRow}>
          <span className={styles.logoMark} aria-hidden />
          <span className={styles.brandName}>Climaris</span>
        </div>
      </Sidebar.Header>

      <Sidebar.Content>
        <Sidebar.Group label="Principal">
          <Sidebar.Item to="/app" end title="Início" icon={<NavIconHome />}>
            Início
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Operação">
          <Sidebar.Item to="/app/clients" title="Clientes" icon={<NavIconContact />}>
            Clientes
          </Sidebar.Item>
          <Sidebar.Item to="/app/products" title="Produtos" icon={<NavIconBox />}>
            Produtos
          </Sidebar.Item>
          <Sidebar.Item to="/app/inventory" title="Estoque" icon={<NavIconInventory />}>
            Estoque
          </Sidebar.Item>
          <Sidebar.Item to="/app/services" title="Serviços" icon={<NavIconWrench />}>
            Serviços
          </Sidebar.Item>
          <Sidebar.Item to="/app/service-orders" title="Ordens de serviço" icon={<NavIconClipboard />}>
            Ordens de serviço
          </Sidebar.Item>
          <Sidebar.Item to="/app/agenda" title="Agenda dos tecnicos" icon={<NavIconCalendar />}>
            Agenda
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/preventive-maintenance"
            title="Gestão preventiva — manutenções a vencer"
            icon={<NavIconAirCompliance />}
          >
            Gestão preventiva
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Comercial">
          <Sidebar.Item to="/app/budgets" title="Orcamentos" icon={<NavIconFileQuote />}>
            Orçamentos
          </Sidebar.Item>
          <Sidebar.Item to="/app/finance" title="Financeiro" icon={<NavIconWallet />}>
            Financeiro
          </Sidebar.Item>
          <Sidebar.Item to="/app/fiscal/nfse" title="NFS-e" icon={<NavIconFileQuote />}>
            NFS-e
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Integrações">
          <Sidebar.Item to="/app/marketplace" title="Loja de integrações" icon={<NavIconPuzzle />}>
            Loja de integrações
          </Sidebar.Item>
          <Sidebar.Item to="/app/integrations/whatsapp" title="WhatsApp" icon={<NavIconPackage />}>
            WhatsApp
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/integrations/whatsapp-campanhas"
            title="Campanhas WhatsApp"
            icon={<NavIconPackage />}
          >
            Campanhas WhatsApp
          </Sidebar.Item>
          <Sidebar.Item
            to="/app/integrations/whatsapp-bot"
            title="Bot WhatsApp"
            icon={<NavIconPackage />}
          >
            Bot WhatsApp
          </Sidebar.Item>
          <Sidebar.Item to="/app/integrations/chat-ia" title="Chat IA (Claude)" icon={<NavIconClipboard />}>
            Chat IA
          </Sidebar.Item>
        </Sidebar.Group>

        <div className={styles.sidebarMobileOnly} role="region" aria-label="Conta e sessão">
          {user?.must_change_password ? (
            <p className={styles.sidebarMobilePwHint} role="status">
              Altere a senha temporária ao abrir Minha conta.
            </p>
          ) : null}
          <button type="button" className={styles.sidebarMobileRow} onClick={onOpenAccountFromMobile}>
            <span className={styles.sidebarMobileAvatar} aria-hidden>
              {user ? userInitial(user.full_name) : "—"}
            </span>
            <span className={styles.sidebarMobileRowLabel}>Minha conta</span>
            <span className={styles.sidebarMobileRowChevron} aria-hidden>
              <NavIconChevronRight />
            </span>
          </button>
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
          <button type="button" className={styles.sidebarMobileLogout} onClick={onLogout}>
            <NavIconLogOut className={styles.sidebarMobileLogoutIcon} />
            Sair
          </button>
        </div>
      </Sidebar.Content>

      <Sidebar.Footer>
        <div className={styles.sidebarFooter} id={navId}>
          <p className={styles.workspaceLabel}>Workspace</p>
          {user?.role === "admin" ? (
            <button
              type="button"
              className={styles.workspaceNameBtn}
              onClick={onOpenWorkspaceDrawer}
              aria-expanded={workspaceDrawerOpen}
              aria-haspopup="dialog"
              title="Administração: empresa, usuários, pagamentos, API e fiscal"
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
            >
              <NavIconSettings className={styles.footerIconSvg} />
            </Link>
          ) : null}
        </div>
      </Sidebar.Footer>
    </Sidebar.Container>
  );
}
