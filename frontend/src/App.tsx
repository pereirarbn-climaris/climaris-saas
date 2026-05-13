import { Navigate, Route, Routes } from "react-router-dom";
import { SessionMaintenance } from "./components/SessionMaintenance";
import { SmartHomeRedirect } from "./components/SmartHomeRedirect";
import { getAccessToken } from "./lib/authStorage";
import { CompleteRegistrationPage } from "./pages/CompleteRegistrationPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { BudgetFormPage } from "./pages/budgets/BudgetFormPage";
import { BudgetsListPage } from "./pages/budgets/BudgetsListPage";
import { ClientFormPage } from "./pages/clients/ClientFormPage";
import { EquipmentDocumentDetailPage } from "./pages/clients/EquipmentDocumentDetailPage";
import { ClientsListPage } from "./pages/clients/ClientsListPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TechnicianSchedulePage } from "./pages/agenda/TechnicianSchedulePage";
import { DashboardHomePage } from "./pages/dashboard/DashboardHomePage";
import { LoginPage } from "./pages/LoginPage";
import { ProductFormPage } from "./pages/products/ProductFormPage";
import { ProductsListPage } from "./pages/products/ProductsListPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { PlatformAdminLayout } from "./pages/PlatformAdminLayout";
import { PlatformApiCredentialsPage } from "./pages/PlatformApiCredentialsPage";
import { PlatformSecurityPage } from "./pages/PlatformSecurityPage";
import { PlatformTenantsPage } from "./pages/PlatformTenantsPage";
import { SaasDashboardPage } from "./pages/saas/SaasDashboardPage";
import { PlatformSaasPlansPage } from "./pages/saas/PlatformSaasPlansPage";
import { PublicEquipmentPage } from "./pages/public/PublicEquipmentPage";
import { ServiceOrderFormPage } from "./pages/service-orders/ServiceOrderFormPage";
import { ServiceOrdersListPage } from "./pages/service-orders/ServiceOrdersListPage";
import { ServiceFormPage } from "./pages/services/ServiceFormPage";
import { ServicesListPage } from "./pages/services/ServicesListPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { FinancePage } from "./pages/finance/FinancePage";
import { FinanceMpEmbeddedCheckoutPage } from "./pages/finance/FinanceMpEmbeddedCheckoutPage";
import { FinanceMpWalletBrickPage } from "./pages/finance/FinanceMpWalletBrickPage";
import { FinanceAccountsPage } from "./pages/finance/FinanceAccountsPage";
import { FinanceCardsPage } from "./pages/finance/FinanceCardsPage";
import { FinanceMachinesPage } from "./pages/finance/FinanceMachinesPage";
import { FinanceSettingsPage } from "./pages/finance/FinanceSettingsPage";
import { StockPage } from "./pages/inventory/StockPage";
import { MercadoLivreCallbackPage } from "./pages/integrations/MercadoLivreCallbackPage";
import { MercadoLivreIntegrationPage } from "./pages/integrations/MercadoLivreIntegrationPage";
import { WhatsappBotPage } from "./pages/integrations/WhatsappBotPage";
import { WhatsappIntegrationPage } from "./pages/integrations/WhatsappIntegrationPage";
import { AiAssistantPage } from "./pages/integrations/AiAssistantPage";
import { MarketplacePage } from "./pages/marketplace/MarketplacePage";
import { PlatformMarketplacePage } from "./pages/PlatformMarketplacePage";
import { PmocDetailPage } from "./pages/pmoc/PmocDetailPage";
import { PmocListPage } from "./pages/pmoc/PmocListPage";
import { PmocNewPage } from "./pages/pmoc/PmocNewPage";
import { TrustedDevicesPage } from "./pages/security/TrustedDevicesPage";
import { NfsePage } from "./pages/fiscal/NfsePage";
import { PreventiveMaintenancePage } from "./pages/preventive/PreventiveMaintenancePage";

function RootRedirect() {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  return <SmartHomeRedirect />;
}

function NotFoundRedirect() {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  return <SmartHomeRedirect />;
}

export default function App() {
  return (
    <>
      <SessionMaintenance />
      <Routes>
      <Route path="/p/e/:token" element={<PublicEquipmentPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
      <Route path="/app/painel-saas" element={<Navigate to="/operacao" replace />} />
      <Route path="/operacao" element={<PlatformAdminLayout />}>
        <Route index element={<SaasDashboardPage />} />
        <Route path="clientes" element={<PlatformTenantsPage />} />
        <Route path="seguranca" element={<PlatformSecurityPage />} />
        <Route path="chaves-api" element={<PlatformApiCredentialsPage />} />
        <Route path="loja" element={<PlatformMarketplacePage />} />
        <Route path="planos" element={<PlatformSaasPlansPage />} />
      </Route>
      <Route path="/app" element={<DashboardPage />}>
        <Route index element={<DashboardHomePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="clients" element={<ClientsListPage />} />
        <Route path="clients/new" element={<ClientFormPage />} />
        <Route path="clients/:clientId" element={<ClientFormPage />} />
        <Route path="equipments/:equipmentId/documents/:documentId" element={<EquipmentDocumentDetailPage />} />
        <Route path="products" element={<ProductsListPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:productId" element={<ProductFormPage />} />
        <Route path="inventory" element={<StockPage />} />
        <Route path="services" element={<ServicesListPage />} />
        <Route path="services/new" element={<ServiceFormPage />} />
        <Route path="services/:serviceId" element={<ServiceFormPage />} />
        <Route path="service-orders" element={<ServiceOrdersListPage />} />
        <Route path="service-orders/new" element={<ServiceOrderFormPage />} />
        <Route path="service-orders/:orderId" element={<ServiceOrderFormPage />} />
        <Route path="budgets" element={<BudgetsListPage />} />
        <Route path="budgets/new" element={<BudgetFormPage />} />
        <Route path="budgets/:budgetId" element={<BudgetFormPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="finance/mercadopago-checkout" element={<FinanceMpEmbeddedCheckoutPage />} />
        <Route path="finance/mercadopago-wallet" element={<FinanceMpWalletBrickPage />} />
        <Route path="finance/settings" element={<FinanceSettingsPage />} />
        <Route path="finance/settings/accounts" element={<FinanceAccountsPage />} />
        <Route path="finance/settings/cards" element={<FinanceCardsPage />} />
        <Route path="finance/settings/machines" element={<FinanceMachinesPage />} />
        <Route path="security/trusted-devices" element={<TrustedDevicesPage />} />
        <Route path="fiscal/nfse" element={<NfsePage />} />
        <Route path="agenda" element={<TechnicianSchedulePage />} />
        <Route path="preventive-maintenance" element={<PreventiveMaintenancePage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="integrations/whatsapp-bot" element={<WhatsappBotPage />} />
        <Route path="integrations/whatsapp" element={<WhatsappIntegrationPage />} />
        <Route path="integrations/chat-ia" element={<AiAssistantPage />} />
        <Route path="integrations/mercado-livre/callback" element={<MercadoLivreCallbackPage />} />
        <Route path="integrations/mercado-livre" element={<MercadoLivreIntegrationPage />} />
        <Route path="pmoc/new" element={<PmocNewPage />} />
        <Route path="pmoc/ativos" element={<Navigate to="/app/pmoc?status=active" replace />} />
        <Route path="pmoc/inativos" element={<Navigate to="/app/pmoc?status=inactive" replace />} />
        <Route path="pmoc/rascunhos" element={<Navigate to="/app/pmoc?status=draft" replace />} />
        <Route path="pmoc/arquivadas" element={<Navigate to="/app/pmoc?status=archived" replace />} />
        <Route path="pmoc/:pmocId" element={<PmocDetailPage />} />
        <Route path="pmoc" element={<PmocListPage />} />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundRedirect />} />
    </Routes>
    </>
  );
}
