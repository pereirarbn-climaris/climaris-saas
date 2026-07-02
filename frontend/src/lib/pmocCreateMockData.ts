import type { ClientComboboxItem } from "../components/ui/client-combobox";
import { formatClientComboboxContato } from "./clientComboboxAdapter";

export type MockSite = {
  id: string;
  name: string;
  city: string;
  state: string;
};

export type MockClient = {
  id: string;
  name: string;
  tradeName?: string;
  document: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  sites: MockSite[];
};

export type MockEquipment = {
  id: string;
  siteId: string;
  identificacao: string;
  modelo: string;
  capacidadeBtu: number;
  localInstalacao: string;
  fabricante: string;
};

export type MockService = {
  id: string;
  name: string;
};

export const MOCK_PMOC_CLIENTS: MockClient[] = [
  {
    id: "1",
    name: "Clínica Saúde Total Ltda",
    tradeName: "Saúde Total",
    document: "12.345.678/0001-90",
    sites: [
      { id: "101", name: "Matriz — Centro", city: "São Paulo", state: "SP" },
      { id: "102", name: "Filial — Zona Sul", city: "São Paulo", state: "SP" },
    ],
  },
  {
    id: "2",
    name: "Indústria Metal Norte S.A.",
    document: "98.765.432/0001-11",
    sites: [{ id: "201", name: "Planta Principal", city: "Campinas", state: "SP" }],
  },
  {
    id: "3",
    name: "Escritório Advocacia Silva & Cia",
    document: "11.222.333/0001-44",
    sites: [
      { id: "301", name: "Sede Paulista", city: "São Paulo", state: "SP" },
      { id: "302", name: "Filial Santos", city: "Santos", state: "SP" },
      { id: "303", name: "Filial Ribeirão", city: "Ribeirão Preto", state: "SP" },
    ],
  },
];

export const MOCK_PMOC_EQUIPMENTS: MockEquipment[] = [
  {
    id: "e1",
    siteId: "101",
    identificacao: "Split Sala Recepção",
    modelo: "9000 BTU Inverter",
    capacidadeBtu: 9000,
    localInstalacao: "Recepção — térreo",
    fabricante: "Carrier",
  },
  {
    id: "e2",
    siteId: "101",
    identificacao: "Cassete Consultório 01",
    modelo: "36000 BTU",
    capacidadeBtu: 36000,
    localInstalacao: "Consultório 01",
    fabricante: "Daikin",
  },
  {
    id: "e3",
    siteId: "102",
    identificacao: "VRF Bloco A",
    modelo: "48000 BTU",
    capacidadeBtu: 48000,
    localInstalacao: "Bloco A — 2º andar",
    fabricante: "LG",
  },
  {
    id: "e4",
    siteId: "201",
    identificacao: "Chiller Linha 1",
    modelo: "120000 BTU",
    capacidadeBtu: 120000,
    localInstalacao: "Sala de máquinas",
    fabricante: "Trane",
  },
  {
    id: "e5",
    siteId: "301",
    identificacao: "Split Sala Reuniões",
    modelo: "18000 BTU",
    capacidadeBtu: 18000,
    localInstalacao: "Sala de reuniões",
    fabricante: "Samsung",
  },
  {
    id: "e6",
    siteId: "302",
    identificacao: "Piso Teto Arquivo",
    modelo: "24000 BTU",
    capacidadeBtu: 24000,
    localInstalacao: "Arquivo central",
    fabricante: "Gree",
  },
];

export const MOCK_PMOC_SERVICES: MockService[] = [
  { id: "s1", name: "Limpeza de filtros" },
  { id: "s2", name: "Higienização de serpentinas" },
  { id: "s3", name: "Verificação de pressão e carga de gás" },
  { id: "s4", name: "Inspeção elétrica e drenos" },
  { id: "s5", name: "Análise de qualidade do ar" },
];

export const MOCK_PMOC_FREQ_OPTIONS = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
] as const;

export type MockActivityRow = {
  id: string;
  service: string;
  serviceId?: number;
  durationMinutes?: number;
  frequency: string;
  frequencyLabel: string;
  equipment: string | null;
  scheduledDate: string;
};

export const MOCK_INITIAL_ACTIVITIES: MockActivityRow[] = [
  {
    id: "a1",
    service: "Limpeza de filtros",
    frequency: "monthly",
    frequencyLabel: "Mensal",
    equipment: null,
    scheduledDate: "2026-06-01",
  },
  {
    id: "a2",
    service: "Higienização de serpentinas",
    frequency: "quarterly",
    frequencyLabel: "Trimestral",
    equipment: "Split Sala Recepção",
    scheduledDate: "2026-07-15",
  },
];

export function mockClientsToComboboxItems(clients: MockClient[]): ClientComboboxItem[] {
  return clients.map((c) => ({
    id: c.id,
    nome: c.name,
    endereco: c.address,
    contato: formatClientComboboxContato(c),
    nomeFantasia: c.tradeName,
    documento: c.document,
  }));
}

export function mockSiteLabel(site: MockSite): string {
  const loc = [site.city, site.state].filter(Boolean).join("/");
  return loc ? `${site.name} (${loc})` : site.name;
}
