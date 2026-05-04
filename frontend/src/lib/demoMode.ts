import type { TenantOut, UserOut } from "../api/auth";
import type { BudgetOut } from "../api/budgets";
import type {
  ClientOut,
  ClientServiceItemLinkRowOut,
  EquipmentDocumentWithEquipmentOut,
  EquipmentHistoryRowOut,
  EquipmentOut,
} from "../api/clients";
import type { ProductOut } from "../api/products";
import type {
  FinanceCategoryOut,
  FinanceEntryOut,
  FinancePaymentFeeOut,
  FinanceSettingsOut,
  FinanceSummaryOut,
} from "../api/finance";
import type { PmocPlanOut } from "../api/pmoc";
import type { ServiceOut } from "../api/services";
import type { ServiceOrderOut } from "../api/serviceOrders";
import type { TenantHoliday, Unavailability } from "../api/technicianCalendar";

const DEMO_TOKEN = "demo_token_climaris_erp_2024";

export function isDemoMode(): boolean {
  const token = localStorage.getItem("access_token");
  return token === DEMO_TOKEN;
}

export const demoUser: UserOut = {
  id: 1,
  tenant_id: 1,
  full_name: "Usuario Demo",
  email: "demo@climaris.com.br",
  role: "admin",
  phone: "11999999999",
  whatsapp: "11999999999",
  is_active: true,
  must_change_password: false,
  is_platform_operator: false,
};

export const demoTenant: TenantOut = {
  id: 1,
  name: "Empresa Demo - Climatizacao",
  cnpj: "12345678000199",
  tax_id_kind: "cnpj",
  tax_document: "12345678000199",
  active_plan: "professional",
  finance_enabled: true,
  finance_mode: "intermediate",
  timezone: "America/Sao_Paulo",
  business_days: "1,2,3,4,5",
  workday_start: "08:00",
  workday_end: "18:00",
  weekday_work_hours: null,
  block_national_holidays: true,
  status: "active",
  address_street: "Rua Exemplo",
  address_number: "123",
  address_complement: "Sala 1",
  address_district: "Centro",
  address_city: "Sao Paulo",
  address_state: "SP",
  address_postal_code: "01000000",
  address_country: "BR",
  address_ibge_code: null,
  phone: "1133334444",
  email: "contato@empresademo.com.br",
  website: "https://empresademo.com.br",
  whatsapp_instance_name: null,
  whatsapp_connection_status: null,
  whatsapp_connected_at: null,
  logo_s3_key: null,
  logo_url: null,
  logo_content_type: null,
  logo_updated_at: null,
  pdf_primary_color: "#0ea5e9",
  registration_complete: true,
};

export const demoClients: ClientOut[] = [
  {
    id: 1,
    tenant_id: 1,
    name: "Joao Silva",
    document: "12345678901",
    tax_id_kind: "cpf",
    phone: "11999998888",
    whatsapp: "11999998888",
    email: "joao.silva@email.com",
    trade_name: null,
    state_registration: null,
    ie_indicator: null,
    municipal_registration: null,
    address_street: "Rua das Flores",
    address_number: "100",
    address_complement: "Apt 12",
    address_district: "Jardim America",
    address_city: "Sao Paulo",
    address_state: "SP",
    address_postal_code: "01234000",
    address_country: "BR",
    address_ibge_code: null,
  },
  {
    id: 2,
    tenant_id: 1,
    name: "Maria Oliveira",
    document: "98765432100",
    tax_id_kind: "cpf",
    phone: "11988887777",
    whatsapp: "11988887777",
    email: "maria.oliveira@email.com",
    trade_name: null,
    state_registration: null,
    ie_indicator: null,
    municipal_registration: null,
    address_street: "Av Paulista",
    address_number: "1500",
    address_complement: "Conj 301",
    address_district: "Bela Vista",
    address_city: "Sao Paulo",
    address_state: "SP",
    address_postal_code: "01310100",
    address_country: "BR",
    address_ibge_code: null,
  },
  {
    id: 3,
    tenant_id: 1,
    name: "Empresa ABC Ltda",
    document: "12345678000199",
    tax_id_kind: "cnpj",
    phone: "1133334444",
    whatsapp: "1133334444",
    email: "contato@empresaabc.com.br",
    trade_name: "ABC Comercio",
    state_registration: "123456789",
    ie_indicator: "1",
    municipal_registration: "987654321",
    address_street: "Rua Comercial",
    address_number: "500",
    address_complement: null,
    address_district: "Centro",
    address_city: "Sao Paulo",
    address_state: "SP",
    address_postal_code: "01000000",
    address_country: "BR",
    address_ibge_code: null,
  },
];

const DEMO_TS = "2026-01-15T12:00:00.000Z";

/** Equipamentos demo por cliente (IDs estáveis para OS/orçamentos). */
export const demoEquipments: EquipmentOut[] = [
  {
    id: 101,
    client_id: 1,
    tipo: "AR_CONDICIONADO",
    identificacao: "Split Quarto 01",
    fabricante: "Daikin",
    modelo: "FTXS35L",
    serial: "SN-DEMO-101",
    capacidade_btu: 12000,
    capacidade_tr: 1,
    categoria_instalacao: "residencial",
    modelo_evaporadora: null,
    modelo_condensadora: null,
    tipo_gas: "R410A",
    voltagem: "220V",
    tecnologia_ciclo: "inverter",
    local_instalacao: "Quarto principal",
    ambiente_nome: "Quarto",
    ambiente_tipo: "dormitorio",
    area_m2: 14,
    ocupacao_fixa: 2,
    ocupacao_flutuante: 0,
    carga_termica_total: null,
    massa_gas_kg: 0.85,
    corrente_nominal_a: 5.2,
    filtro_tipo: "Metalico",
    filtro_quantidade: 1,
    filtro_dimensoes: "38x30 cm",
    filtro_periodicidade_limpeza: "90 dias",
    ativo: true,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
  },
  {
    id: 102,
    client_id: 2,
    tipo: "AR_CONDICIONADO",
    identificacao: "Split Sala",
    fabricante: "LG",
    modelo: "S4NQ12JA3WF",
    serial: "SN-DEMO-102",
    capacidade_btu: 18000,
    capacidade_tr: 1.5,
    categoria_instalacao: "residencial",
    modelo_evaporadora: null,
    modelo_condensadora: null,
    tipo_gas: "R410A",
    voltagem: "220V",
    tecnologia_ciclo: "on_off",
    local_instalacao: "Sala de estar",
    ambiente_nome: "Sala",
    ambiente_tipo: "estar",
    area_m2: 22,
    ocupacao_fixa: 4,
    ocupacao_flutuante: 2,
    carga_termica_total: null,
    massa_gas_kg: 1.1,
    corrente_nominal_a: 7.8,
    filtro_tipo: "Metalico",
    filtro_quantidade: 1,
    filtro_dimensoes: "42x32 cm",
    filtro_periodicidade_limpeza: "90 dias",
    ativo: true,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
  },
  {
    id: 201,
    client_id: 3,
    tipo: "AR_CONDICIONADO",
    identificacao: "Split Sala Reuniao",
    fabricante: "Samsung",
    modelo: "AR18ASF",
    serial: "SN-DEMO-201",
    capacidade_btu: 24000,
    capacidade_tr: 2,
    categoria_instalacao: "comercial",
    modelo_evaporadora: null,
    modelo_condensadora: null,
    tipo_gas: "R410A",
    voltagem: "380V",
    tecnologia_ciclo: "inverter",
    local_instalacao: "Sala de reunioes",
    ambiente_nome: "Reunioes",
    ambiente_tipo: "comercial",
    area_m2: 35,
    ocupacao_fixa: 10,
    ocupacao_flutuante: 5,
    carga_termica_total: null,
    massa_gas_kg: 1.6,
    corrente_nominal_a: 12,
    filtro_tipo: "Metalico",
    filtro_quantidade: 2,
    filtro_dimensoes: "45x35 cm",
    filtro_periodicidade_limpeza: "60 dias",
    ativo: true,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
  },
  {
    id: 202,
    client_id: 3,
    tipo: "AR_CONDICIONADO",
    identificacao: "Split Escritorio",
    fabricante: "Philco",
    modelo: "PAC36000FM6",
    serial: "SN-DEMO-202",
    capacidade_btu: 36000,
    capacidade_tr: 3,
    categoria_instalacao: "comercial",
    modelo_evaporadora: null,
    modelo_condensadora: null,
    tipo_gas: "R410A",
    voltagem: "220V",
    tecnologia_ciclo: "on_off",
    local_instalacao: "Escritorio administrativo",
    ambiente_nome: "Escritorio",
    ambiente_tipo: "comercial",
    area_m2: 28,
    ocupacao_fixa: 6,
    ocupacao_flutuante: 2,
    carga_termica_total: null,
    massa_gas_kg: 2.2,
    corrente_nominal_a: 15,
    filtro_tipo: "Metalico",
    filtro_quantidade: 2,
    filtro_dimensoes: "48x38 cm",
    filtro_periodicidade_limpeza: "60 dias",
    ativo: true,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
  },
];

type DemoServiceLink = ClientServiceItemLinkRowOut & { client_id: number };

/** Itens de OS sem equipamento vinculado (aba Equipamentos da ficha). */
export const demoClientServiceItemLinksAll: DemoServiceLink[] = [
  {
    client_id: 3,
    service_order_id: 501,
    service_item_id: 901,
    service_id: 1,
    service_name: "Instalacao de Ar Condicionado Split",
    order_status: "approved",
    equipment_id: null,
  },
];

export type DemoEquipmentHistoryRow = EquipmentHistoryRowOut & { client_id: number; equipment_id: number };

export const demoEquipmentHistoryRows: DemoEquipmentHistoryRow[] = [
  {
    client_id: 3,
    equipment_id: 201,
    changed_at: "2026-01-10T14:30:00.000Z",
    source: "ordem_concluida",
    previous_equipment_id: null,
    new_equipment_id: 201,
    service_order_id: 501,
    service_item_id: 902,
    service_name: "Manutencao Preventiva",
    changed_by_user_id: 1,
    changed_by_user_name: "Usuario Demo",
  },
];

export const demoEquipmentDocuments: EquipmentDocumentWithEquipmentOut[] = [
  {
    id: 1,
    tenant_id: 1,
    equipment_id: 201,
    service_order_id: 501,
    responsible_user_id: 1,
    technician_id: 1,
    document_type: "pmoc",
    status: "issued",
    document_number: 1001,
    title: "PMOC — Split Sala Reuniao",
    issued_at: "2026-01-05T10:00:00.000Z",
    valid_until: "2027-01-05T23:59:59.000Z",
    next_due_at: "2027-01-05T10:00:00.000Z",
    notes: "Documento demonstrativo.",
    schema_version: "1",
    payload: {},
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
    equipment_identificacao: "Split Sala Reuniao",
  },
  {
    id: 2,
    tenant_id: 1,
    equipment_id: 202,
    service_order_id: null,
    responsible_user_id: 1,
    technician_id: null,
    document_type: "technical_report",
    status: "draft",
    document_number: 1002,
    title: "Laudo tecnico — Split Escritorio",
    issued_at: null,
    valid_until: null,
    next_due_at: null,
    notes: null,
    schema_version: "1",
    payload: {},
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
    equipment_identificacao: "Split Escritorio",
  },
];

export const demoBudgets: BudgetOut[] = [
  {
    id: 301,
    tenant_id: 1,
    client_id: 3,
    observation: "Orçamento demonstrativo — troca de filtros e limpeza.",
    status: "sent",
    payment_method: "pix",
    payment_terms: "50% entrada, 50% na entrega",
    warranty_terms: "90 dias servico",
    validity_days: 15,
    sent_at: "2026-01-08T09:00:00.000Z",
    approved_at: null,
    created_at: "2026-01-07T11:00:00.000Z",
    generated_service_order_id: null,
    service_items: [{ id: 1, service_id: 2, quantity: 2, unit_price: 150, duration_minutes: 60 }],
    product_items: [{ id: 1, product_id: 1, quantity: 4, unit_price: 45 }],
  },
];

export const demoServiceOrders: ServiceOrderOut[] = [
  {
    id: 501,
    tenant_id: 1,
    client_id: 3,
    title: "Manutencao preventiva — Empresa ABC",
    description: "Ordem de serviço demonstrativa.",
    status: "approved",
    discount_amount: 0,
    assigned_technician_name: "Usuario Demo",
    technician_ids: [1],
    service_items: [
      {
        id: 901,
        service_id: 1,
        equipment_id: null,
        quantity: 1,
        unit_price: 350,
        duration_minutes: 180,
      },
      {
        id: 902,
        service_id: 2,
        equipment_id: 201,
        quantity: 1,
        unit_price: 150,
        duration_minutes: 60,
      },
    ],
    product_items: [],
    schedule: {
      id: 801,
      tenant_id: 1,
      client_id: 3,
      service_order_id: 501,
      starts_at: "2026-01-20T09:00:00.000Z",
      ends_at: "2026-01-20T11:00:00.000Z",
      status: "confirmed",
      notes: "Visita agendada (demo).",
    },
  },
];

export const demoProducts: ProductOut[] = [
  {
    id: 1,
    tenant_id: 1,
    name: "Filtro de Ar Condicionado",
    sku: "FILT-001",
    purchase_price: 25.0,
    sale_price: 45.0,
    unit_price: 45.0,
    stock_quantity: 50,
    is_active: true,
  },
  {
    id: 2,
    tenant_id: 1,
    name: "Gas Refrigerante R410A",
    sku: "GAS-R410A",
    purchase_price: 180.0,
    sale_price: 280.0,
    unit_price: 280.0,
    stock_quantity: 20,
    is_active: true,
  },
  {
    id: 3,
    tenant_id: 1,
    name: "Condensador Split 12000 BTU",
    sku: "COND-12K",
    purchase_price: 450.0,
    sale_price: 750.0,
    unit_price: 750.0,
    stock_quantity: 8,
    is_active: true,
  },
  {
    id: 4,
    tenant_id: 1,
    name: "Tubo de Cobre 1/4",
    sku: "TUBO-1/4",
    purchase_price: 35.0,
    sale_price: 55.0,
    unit_price: 55.0,
    stock_quantity: 100,
    is_active: true,
  },
];

export const demoServices: ServiceOut[] = [
  {
    id: 1,
    tenant_id: 1,
    name: "Instalacao de Ar Condicionado Split",
    description: "Servico completo de instalacao de ar condicionado split residencial ou comercial",
    price: 350.0,
    duration_minutes: 180,
    is_active: true,
    product_inputs: [],
    estimated_material_cost: 0,
    estimated_profit: 350.0,
  },
  {
    id: 2,
    tenant_id: 1,
    name: "Manutencao Preventiva",
    description: "Limpeza e verificacao do sistema de ar condicionado",
    price: 150.0,
    duration_minutes: 60,
    is_active: true,
    product_inputs: [],
    estimated_material_cost: 0,
    estimated_profit: 150.0,
  },
  {
    id: 3,
    tenant_id: 1,
    name: "Recarga de Gas",
    description: "Recarga de gas refrigerante com verificacao de vazamentos",
    price: 280.0,
    duration_minutes: 90,
    is_active: true,
    product_inputs: [],
    estimated_material_cost: 0,
    estimated_profit: 280.0,
  },
];

let demoClientsState: ClientOut[] = demoClients.map((item) => ({ ...item }));
let demoProductsState: ProductOut[] = demoProducts.map((item) => ({ ...item }));
let demoServicesState: ServiceOut[] = demoServices.map((item) => ({ ...item }));
let demoBudgetsState: BudgetOut[] = demoBudgets.map((item) => ({ ...item }));
let demoServiceOrdersState: ServiceOrderOut[] = demoServiceOrders.map((item) => ({ ...item }));
let demoFinanceCategoriesState: FinanceCategoryOut[] = [
  { id: 1, tenant_id: 1, name: "Servicos", color: "#0ea5e9", created_at: DEMO_TS },
  { id: 2, tenant_id: 1, name: "Despesas Operacionais", color: "#ef4444", created_at: DEMO_TS },
];
let demoFinanceEntriesState: FinanceEntryOut[] = [
  {
    id: 1,
    tenant_id: 1,
    category_id: 1,
    category_name: "Servicos",
    description: "Recebimento OS #501",
    entry_type: "income",
    status: "paid",
    amount: 500,
    payment_method: "pix",
    payment_provider: null,
    fee_fixed_amount: 0,
    fee_percent: 0,
    fee_amount: 0,
    recipient_whatsapp: null,
    gateway_payment_id: null,
    installment_group_id: null,
    installment_number: undefined,
    installment_total: undefined,
    net_amount: 500,
    due_date: "2026-01-20",
    competence_date: "2026-01-20",
    expected_settlement_date: "2026-01-20",
    settlement_plan: "same_as_due",
    paid_at: "2026-01-20T13:00:00.000Z",
    notes: null,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
  },
];
let demoFinancePaymentFeesState: FinancePaymentFeeOut[] = [];
let demoFinanceSettingsState: FinanceSettingsOut = {
  finance_enabled: true,
  selected_mode: "intermediate",
  effective_mode: "intermediate",
  max_available_mode: "management",
  can_use_marketplace_upgrade: true,
  requires_marketplace_slug: null,
};
let demoPmocPlansState: PmocPlanOut[] = [
  {
    id: 1,
    tenant_id: 1,
    client_id: 3,
    status: "active",
    title: "PMOC Empresa ABC",
    version_label: "v1",
    establishment_snapshot: {},
    law_reference_note: null,
    internal_notes: "Plano demo",
    extras: {},
    total_btu_sum: 60000,
    air_analysis_required: false,
    next_air_analysis_due: null,
    responsible_name: "Usuario Demo",
    responsible_council: null,
    responsible_registration: null,
    art_number: null,
    art_issued_at: null,
    art_file_url: null,
    activated_at: DEMO_TS,
    deactivated_at: null,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
    client: {
      id: 3,
      name: "Empresa ABC Ltda",
      trade_name: "ABC Comercio",
      document: "12345678000199",
      address_city: "Sao Paulo",
      address_state: "SP",
    },
  },
];
let demoUnavailabilityState: Unavailability[] = [];
let demoHolidaysState: TenantHoliday[] = [];

let nextClientId = 4;
let nextProductId = 5;
let nextServiceId = 4;
let nextBudgetId = 302;
let nextServiceOrderId = 502;
let nextFinanceEntryId = 2;
let nextFinanceCategoryId = 3;
let nextFinanceFeeId = 1;
let nextPmocId = 2;
let nextUnavailabilityId = 1;

export function demoListClients() {
  return demoClientsState.map((item) => ({ ...item }));
}
export function demoCreateClient(payload: Partial<ClientOut> & { name: string }): ClientOut {
  const row: ClientOut = {
    id: nextClientId++,
    tenant_id: 1,
    name: payload.name,
    document: payload.document ?? null,
    tax_id_kind: payload.tax_id_kind ?? "cpf",
    phone: payload.phone ?? null,
    whatsapp: payload.whatsapp ?? null,
    email: payload.email ?? null,
    trade_name: payload.trade_name ?? null,
    state_registration: payload.state_registration ?? null,
    ie_indicator: payload.ie_indicator ?? null,
    municipal_registration: payload.municipal_registration ?? null,
    address_street: payload.address_street ?? null,
    address_number: payload.address_number ?? null,
    address_complement: payload.address_complement ?? null,
    address_district: payload.address_district ?? null,
    address_city: payload.address_city ?? null,
    address_state: payload.address_state ?? null,
    address_postal_code: payload.address_postal_code ?? null,
    address_country: payload.address_country ?? "BR",
    address_ibge_code: payload.address_ibge_code ?? null,
  };
  demoClientsState = [row, ...demoClientsState];
  return { ...row };
}
export function demoUpdateClient(clientId: number, payload: Partial<ClientOut>): ClientOut {
  const idx = demoClientsState.findIndex((item) => item.id === clientId);
  if (idx < 0) throw new Error("Cliente não encontrado.");
  demoClientsState[idx] = { ...demoClientsState[idx], ...payload };
  return { ...demoClientsState[idx] };
}
export function demoDeleteClient(clientId: number): void {
  demoClientsState = demoClientsState.filter((item) => item.id !== clientId);
}

export function demoListProducts() {
  return demoProductsState.map((item) => ({ ...item }));
}
export function demoCreateProduct(payload: Omit<ProductOut, "id" | "tenant_id" | "unit_price">): ProductOut {
  const row: ProductOut = { id: nextProductId++, tenant_id: 1, unit_price: payload.sale_price, ...payload };
  demoProductsState = [row, ...demoProductsState];
  return { ...row };
}
export function demoUpdateProduct(productId: number, payload: Partial<ProductOut>): ProductOut {
  const idx = demoProductsState.findIndex((item) => item.id === productId);
  if (idx < 0) throw new Error("Produto não encontrado.");
  demoProductsState[idx] = { ...demoProductsState[idx], ...payload };
  return { ...demoProductsState[idx] };
}
export function demoDeleteProduct(productId: number): void {
  demoProductsState = demoProductsState.filter((item) => item.id !== productId);
}

export function demoListServices() {
  return demoServicesState.map((item) => ({ ...item, product_inputs: [...item.product_inputs] }));
}
export function demoCreateService(payload: Omit<ServiceOut, "id" | "tenant_id" | "estimated_material_cost" | "estimated_profit">): ServiceOut {
  const row: ServiceOut = {
    id: nextServiceId++,
    tenant_id: 1,
    estimated_material_cost: 0,
    estimated_profit: payload.price,
    ...payload,
  };
  demoServicesState = [row, ...demoServicesState];
  return { ...row, product_inputs: [...row.product_inputs] };
}
export function demoUpdateService(serviceId: number, payload: Partial<ServiceOut>): ServiceOut {
  const idx = demoServicesState.findIndex((item) => item.id === serviceId);
  if (idx < 0) throw new Error("Serviço não encontrado.");
  demoServicesState[idx] = { ...demoServicesState[idx], ...payload };
  return { ...demoServicesState[idx], product_inputs: [...demoServicesState[idx].product_inputs] };
}
export function demoDeleteService(serviceId: number): void {
  demoServicesState = demoServicesState.filter((item) => item.id !== serviceId);
}

export function demoListServiceOrders() {
  return demoServiceOrdersState.map((item) => ({ ...item }));
}
export function demoCreateServiceOrder(payload: {
  client_id: number;
  title: string;
  description?: string | null;
  services: Array<{ service_id: number; quantity: number; equipment_id?: number | null }>;
  products?: Array<{ product_id: number; quantity: number }>;
  discount_amount?: number;
  technician_ids?: number[];
}): { id: number; status: "open" } {
  const id = nextServiceOrderId++;
  const row: ServiceOrderOut = {
    id,
    tenant_id: 1,
    client_id: payload.client_id,
    title: payload.title,
    description: payload.description ?? null,
    status: "open",
    discount_amount: payload.discount_amount ?? 0,
    technician_ids: payload.technician_ids ?? [],
    service_items: payload.services.map((item, idx) => {
      const s = demoServicesState.find((service) => service.id === item.service_id);
      return {
        id: id * 10 + idx + 1,
        service_id: item.service_id,
        equipment_id: item.equipment_id ?? null,
        quantity: item.quantity,
        unit_price: s?.price ?? 0,
        duration_minutes: s?.duration_minutes ?? 0,
      };
    }),
    product_items: (payload.products ?? []).map((item, idx) => {
      const p = demoProductsState.find((product) => product.id === item.product_id);
      return {
        id: id * 100 + idx + 1,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: p?.sale_price ?? 0,
      };
    }),
    schedule: null,
  };
  demoServiceOrdersState = [row, ...demoServiceOrdersState];
  return { id, status: "open" };
}
export function demoUpdateServiceOrder(orderId: number, payload: Partial<ServiceOrderOut>): ServiceOrderOut {
  const idx = demoServiceOrdersState.findIndex((item) => item.id === orderId);
  if (idx < 0) throw new Error("OS não encontrada.");
  demoServiceOrdersState[idx] = { ...demoServiceOrdersState[idx], ...payload };
  return { ...demoServiceOrdersState[idx] };
}

export function demoListBudgets() {
  return demoBudgetsState.map((item) => ({ ...item }));
}
export function demoCreateBudget(payload: {
  client_id: number;
  observation?: string | null;
  payment_method?: string | null;
  payment_terms?: string | null;
  warranty_terms?: string | null;
  validity_days?: number;
  services: Array<{ service_id: number; quantity: number }>;
  products?: Array<{ product_id: number; quantity: number }>;
}) {
  const id = nextBudgetId++;
  const row: BudgetOut = {
    id,
    tenant_id: 1,
    client_id: payload.client_id,
    observation: payload.observation ?? null,
    status: "draft",
    payment_method: payload.payment_method ?? null,
    payment_terms: payload.payment_terms ?? null,
    warranty_terms: payload.warranty_terms ?? null,
    validity_days: payload.validity_days ?? 10,
    sent_at: null,
    approved_at: null,
    created_at: new Date().toISOString(),
    generated_service_order_id: null,
    service_items: payload.services.map((item, idx) => ({
      id: id * 10 + idx + 1,
      service_id: item.service_id,
      quantity: item.quantity,
      unit_price: demoServicesState.find((s) => s.id === item.service_id)?.price ?? 0,
      duration_minutes: demoServicesState.find((s) => s.id === item.service_id)?.duration_minutes ?? 0,
    })),
    product_items: (payload.products ?? []).map((item, idx) => ({
      id: id * 100 + idx + 1,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: demoProductsState.find((p) => p.id === item.product_id)?.sale_price ?? 0,
    })),
  };
  demoBudgetsState = [row, ...demoBudgetsState];
  return { id, status: "draft" as const };
}
export function demoUpdateBudget(budgetId: number, payload: Partial<BudgetOut>): BudgetOut {
  const idx = demoBudgetsState.findIndex((item) => item.id === budgetId);
  if (idx < 0) throw new Error("Orçamento não encontrado.");
  demoBudgetsState[idx] = { ...demoBudgetsState[idx], ...payload };
  return { ...demoBudgetsState[idx] };
}

export function demoListFinanceEntries() {
  return demoFinanceEntriesState.map((item) => ({ ...item }));
}
export function demoCreateFinanceEntry(payload: Partial<FinanceEntryOut> & { description: string; entry_type: "income" | "expense"; amount: number; due_date: string }): FinanceEntryOut {
  const row: FinanceEntryOut = {
    id: nextFinanceEntryId++,
    tenant_id: 1,
    category_id: payload.category_id ?? null,
    category_name: demoFinanceCategoriesState.find((c) => c.id === payload.category_id)?.name ?? null,
    description: payload.description,
    entry_type: payload.entry_type,
    status: payload.status ?? "pending",
    amount: payload.amount,
    payment_method: payload.payment_method ?? null,
    payment_provider: payload.payment_provider ?? null,
    fee_fixed_amount: payload.fee_fixed_amount ?? 0,
    fee_percent: payload.fee_percent ?? 0,
    fee_amount: payload.fee_amount ?? 0,
    recipient_whatsapp: payload.recipient_whatsapp ?? null,
    gateway_payment_id: payload.gateway_payment_id ?? null,
    installment_group_id: null,
    installment_number: undefined,
    installment_total: undefined,
    net_amount: payload.amount - (payload.fee_amount ?? 0),
    due_date: payload.due_date,
    competence_date: payload.competence_date ?? payload.due_date,
    expected_settlement_date: payload.expected_settlement_date ?? payload.due_date,
    settlement_plan: payload.settlement_plan ?? "same_as_due",
    paid_at: null,
    notes: payload.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  demoFinanceEntriesState = [row, ...demoFinanceEntriesState];
  return { ...row };
}
export function demoPatchFinanceEntry(entryId: number, payload: Partial<FinanceEntryOut>): FinanceEntryOut {
  const idx = demoFinanceEntriesState.findIndex((item) => item.id === entryId);
  if (idx < 0) throw new Error("Lançamento não encontrado.");
  demoFinanceEntriesState[idx] = { ...demoFinanceEntriesState[idx], ...payload, updated_at: new Date().toISOString() };
  return { ...demoFinanceEntriesState[idx] };
}
export function demoDeleteFinanceEntry(entryId: number): void {
  demoFinanceEntriesState = demoFinanceEntriesState.filter((item) => item.id !== entryId);
}
export function demoListFinanceCategories() {
  return demoFinanceCategoriesState.map((item) => ({ ...item }));
}
export function demoCreateFinanceCategory(payload: { name: string; color?: string | null }): FinanceCategoryOut {
  const row: FinanceCategoryOut = {
    id: nextFinanceCategoryId++,
    tenant_id: 1,
    name: payload.name,
    color: payload.color ?? null,
    created_at: new Date().toISOString(),
  };
  demoFinanceCategoriesState = [row, ...demoFinanceCategoriesState];
  return { ...row };
}
export function demoListFinanceFees() {
  return demoFinancePaymentFeesState.map((item) => ({ ...item }));
}
export function demoCreateFinanceFee(payload: Omit<FinancePaymentFeeOut, "id" | "tenant_id" | "created_at" | "updated_at">): FinancePaymentFeeOut {
  const now = new Date().toISOString();
  const row: FinancePaymentFeeOut = { id: nextFinanceFeeId++, tenant_id: 1, created_at: now, updated_at: now, ...payload };
  demoFinancePaymentFeesState = [row, ...demoFinancePaymentFeesState];
  return { ...row };
}
export function demoDeleteFinanceFee(feeId: number): void {
  demoFinancePaymentFeesState = demoFinancePaymentFeesState.filter((item) => item.id !== feeId);
}
export function demoGetFinanceSummary(): FinanceSummaryOut {
  const incomes = demoFinanceEntriesState.filter((item) => item.entry_type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = demoFinanceEntriesState.filter((item) => item.entry_type === "expense").reduce((sum, item) => sum + item.amount, 0);
  return {
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    incomes,
    incomes_net: incomes,
    expenses,
    total_fees: 0,
    net: incomes - expenses,
    pending_count: demoFinanceEntriesState.filter((item) => item.status === "pending").length,
    overdue_count: demoFinanceEntriesState.filter((item) => item.status === "overdue").length,
    total_count: demoFinanceEntriesState.length,
  };
}
export function demoGetFinanceSettings() {
  return { ...demoFinanceSettingsState };
}
export function demoUpdateFinanceSettings(payload: Pick<FinanceSettingsOut, "finance_enabled" | "selected_mode">) {
  demoFinanceSettingsState = {
    ...demoFinanceSettingsState,
    finance_enabled: payload.finance_enabled,
    selected_mode: payload.selected_mode,
    effective_mode: payload.selected_mode,
  };
  return { ...demoFinanceSettingsState };
}

export function demoListPmocPlans() {
  return demoPmocPlansState.map((item) => ({ ...item }));
}
export function demoCreatePmocPlan(payload: { client_id: number; title: string }): PmocPlanOut {
  const client = demoClientsState.find((item) => item.id === payload.client_id);
  const row: PmocPlanOut = {
    id: nextPmocId++,
    tenant_id: 1,
    client_id: payload.client_id,
    status: "draft",
    title: payload.title,
    version_label: "v1",
    establishment_snapshot: {},
    law_reference_note: null,
    internal_notes: null,
    extras: {},
    total_btu_sum: 0,
    air_analysis_required: false,
    next_air_analysis_due: null,
    responsible_name: null,
    responsible_council: null,
    responsible_registration: null,
    art_number: null,
    art_issued_at: null,
    art_file_url: null,
    activated_at: null,
    deactivated_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    client: client
      ? {
          id: client.id,
          name: client.name,
          trade_name: client.trade_name,
          document: client.document,
          address_city: client.address_city,
          address_state: client.address_state,
        }
      : null,
  };
  demoPmocPlansState = [row, ...demoPmocPlansState];
  return { ...row };
}
export function demoPatchPmocPlan(pmocId: number, payload: Partial<PmocPlanOut>): PmocPlanOut {
  const idx = demoPmocPlansState.findIndex((item) => item.id === pmocId);
  if (idx < 0) throw new Error("PMOC não encontrado.");
  demoPmocPlansState[idx] = { ...demoPmocPlansState[idx], ...payload, updated_at: new Date().toISOString() };
  return { ...demoPmocPlansState[idx] };
}

export function demoListUnavailability() {
  return demoUnavailabilityState.map((item) => ({ ...item }));
}
export function demoCreateUnavailability(payload: Omit<Unavailability, "id" | "tenant_id">): Unavailability {
  const row: Unavailability = { id: nextUnavailabilityId++, tenant_id: 1, ...payload };
  demoUnavailabilityState = [row, ...demoUnavailabilityState];
  return { ...row };
}
export function demoPatchUnavailability(id: number, payload: Partial<Unavailability>): Unavailability {
  const idx = demoUnavailabilityState.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Indisponibilidade não encontrada.");
  demoUnavailabilityState[idx] = { ...demoUnavailabilityState[idx], ...payload };
  return { ...demoUnavailabilityState[idx] };
}
export function demoDeleteUnavailability(id: number): void {
  demoUnavailabilityState = demoUnavailabilityState.filter((item) => item.id !== id);
}
export function demoListTenantHolidays() {
  return demoHolidaysState.map((item) => ({ ...item }));
}
