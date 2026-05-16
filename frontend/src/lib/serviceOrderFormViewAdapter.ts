import type {
  ChecklistItem,
  Cliente,
  Equipamento,
  ServiceOrderData,
  ServiceOrderStatus,
  ServiceType,
  Tecnico,
} from "../components/v0-ui/service-orders/ServiceOrderFormView";
import type {
  ServiceOrder,
  ServiceOrderMetrics,
  ServiceOrderStatus as ListServiceOrderStatus,
  ServiceType as ListServiceType,
  Technician,
} from "../components/v0-ui/service-orders/ServiceOrdersListView";
import type { ClientOut, EquipmentOut } from "../api/clients";
import type { ProductOut } from "../api/products";
import type { ServiceOut } from "../api/services";
import type {
  OrderStatus,
  ServiceOrderCreatePayload,
  ServiceOrderOut,
} from "../api/serviceOrders";
import type { UserOut } from "../api/auth";
import { formatPhoneBrInput, formatTaxDocumentInput } from "./brMask";

const META_MARKER = "\n---CLIMARIS_OS_META---\n";

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "chk_1", descricao: "Limpeza dos filtros de ar", status: "na" },
  { id: "chk_2", descricao: "Limpeza da bandeja de condensado", status: "na" },
  { id: "chk_3", descricao: "Verificação e limpeza do dreno", status: "na" },
  { id: "chk_4", descricao: "Limpeza da serpentina evaporadora", status: "na" },
  { id: "chk_5", descricao: "Limpeza da serpentina condensadora", status: "na" },
  { id: "chk_6", descricao: "Verificação do nível de gás refrigerante", status: "na" },
  { id: "chk_7", descricao: "Medição de pressão de sucção/descarga", status: "na" },
  { id: "chk_8", descricao: "Verificação de ruídos anormais", status: "na" },
  { id: "chk_9", descricao: "Teste do controle remoto", status: "na" },
  { id: "chk_10", descricao: "Verificação das conexões elétricas", status: "na" },
  { id: "chk_11", descricao: "Medição de temperatura de insuflamento", status: "na" },
  { id: "chk_12", descricao: "Verificação do isolamento térmico", status: "na" },
];

type OsMeta = {
  v: 1;
  tipoServico?: ServiceType;
  descricaoProblema?: string;
  diagnosticoTecnico?: string;
  observacoesInternas?: string;
  checklist?: ChecklistItem[];
  valorPecas?: number;
  valorMaoDeObra?: number;
};

function mapEquipmentTipo(categoria?: string | null): string {
  const c = (categoria ?? "").toLowerCase();
  if (c.includes("cassete")) return "Cassete";
  if (c.includes("piso")) return "Piso-teto";
  if (c.includes("janela")) return "Janela";
  if (c.includes("multi")) return "Multi split";
  if (c.includes("vrf")) return "VRF";
  return "Split";
}

function parseMeta(description: string | null | undefined): OsMeta | null {
  if (!description) return null;
  const idx = description.indexOf(META_MARKER);
  if (idx < 0) return null;
  try {
    return JSON.parse(description.slice(idx + META_MARKER.length)) as OsMeta;
  } catch {
    return null;
  }
}

function freeTextFromDescription(description: string | null | undefined): string {
  if (!description) return "";
  const idx = description.indexOf(META_MARKER);
  return (idx >= 0 ? description.slice(0, idx) : description).trim();
}

function serializeDescription(freeText: string, meta: OsMeta): string | null {
  const payload = META_MARKER + JSON.stringify(meta);
  const base = freeText.trim();
  if (!base) return payload.trimStart();
  return `${base}${payload}`;
}

function metaFromViewData(data: ServiceOrderData): OsMeta {
  return {
    v: 1,
    tipoServico: data.tipoServico,
    descricaoProblema: data.descricaoProblema,
    diagnosticoTecnico: data.diagnosticoTecnico,
    observacoesInternas: data.observacoesInternas,
    checklist: data.checklist,
    valorPecas: data.valorPecas,
    valorMaoDeObra: data.valorMaoDeObra,
  };
}

function mergeChecklist(stored: ChecklistItem[] | undefined): ChecklistItem[] {
  const byId = new Map((stored ?? []).map((item) => [item.id, item]));
  return DEFAULT_CHECKLIST.map((def) => {
    const hit = byId.get(def.id);
    return hit ? { ...def, ...hit, descricao: def.descricao } : { ...def };
  });
}

export function orderGrandTotal(order: ServiceOrderOut): number {
  const services = order.service_items.reduce((s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price), 0);
  const products = order.product_items.reduce((s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price), 0);
  return Math.max(0, services + products - (order.discount_amount || 0));
}

function mapApiStatusToForm(status: OrderStatus): ServiceOrderStatus {
  const m: Record<OrderStatus, ServiceOrderStatus> = {
    open: "pendente",
    approved: "pendente",
    scheduled: "agendada",
    in_progress: "em_andamento",
    done: "concluida",
    cancelled: "cancelada",
  };
  return m[status] ?? "pendente";
}

export function mapFormStatusToApi(status: ServiceOrderStatus): OrderStatus | null {
  const m: Record<ServiceOrderStatus, OrderStatus> = {
    pendente: "open",
    agendada: "scheduled",
    em_andamento: "in_progress",
    concluida: "done",
    cancelada: "cancelled",
  };
  return m[status] ?? null;
}

function mapApiStatusToList(status: OrderStatus): ListServiceOrderStatus {
  const m: Record<OrderStatus, ListServiceOrderStatus> = {
    open: "pendente",
    approved: "pendente",
    scheduled: "agendada",
    in_progress: "em_andamento",
    done: "concluida",
    cancelled: "cancelada",
  };
  return m[status] ?? "pendente";
}

function inferServiceType(order: ServiceOrderOut, meta: OsMeta | null): ServiceType {
  if (meta?.tipoServico) return meta.tipoServico;
  const names = order.service_items
    .map((i) => (i.service_name ?? "").toLowerCase())
    .join(" ");
  if (names.includes("prevent") || names.includes("pmoc")) return "preventiva";
  if (names.includes("instal")) return "instalacao";
  return "corretiva";
}

function inferListServiceType(order: ServiceOrderOut, meta: OsMeta | null): ListServiceType {
  const t = inferServiceType(order, meta);
  if (t === "preventiva") return "preventiva";
  if (t === "instalacao") return "instalacao";
  return "corretiva";
}

function splitSchedule(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function resolveServiceId(tipo: ServiceType, services: ServiceOut[]): number {
  const active = services.filter((s) => s.is_active);
  if (!active.length) throw new Error("Cadastre ao menos um serviço ativo no catálogo.");
  const match = (keywords: string[]) =>
    active.find((s) => {
      const hay = `${s.service_category ?? ""} ${s.name} ${s.description ?? ""}`.toLowerCase();
      return keywords.some((k) => hay.includes(k));
    });
  if (tipo === "preventiva") return match(["prevent", "pmoc"])?.id ?? active[0]!.id;
  if (tipo === "instalacao") return match(["instal"])?.id ?? active[0]!.id;
  return match(["corretiv", "manuten"])?.id ?? active[0]!.id;
}

function resolvePartsProductId(products: ProductOut[]): number | null {
  const active = products.filter((p) => p.is_active);
  if (!active.length) return null;
  const preferred =
    active.find((p) => /pe[cç]a|material|insumo/i.test(p.name)) ??
    active[0];
  return preferred?.id ?? null;
}

export function computeOrderTotalFromView(data: ServiceOrderData): number {
  return Math.max(0, (data.valorPecas || 0) + (data.valorMaoDeObra || 0));
}

export function mapClientsToFormView(clients: ClientOut[]): Cliente[] {
  return clients.map((c) => {
    const type = c.tax_id_kind === "cpf" ? "cpf" : "cnpj";
    const parts = [
      c.address_street,
      c.address_number,
      c.address_district,
      c.address_city,
      c.address_state,
    ]
      .map((p) => (p ?? "").trim())
      .filter(Boolean);
    return {
      id: String(c.id),
      nome: c.name,
      documento: formatTaxDocumentInput(c.document ?? "", type),
      telefone: formatPhoneBrInput(c.whatsapp ?? c.phone ?? ""),
      endereco: parts.length ? parts.join(", ") : undefined,
    };
  });
}

export function mapTechniciansToFormView(users: UserOut[]): Tecnico[] {
  return users
    .filter((u) => u.is_active && u.role === "technician")
    .map((u) => ({
      id: String(u.id),
      nome: u.full_name,
      especialidade: u.phone ?? undefined,
    }));
}

export function mapTechniciansToListView(users: UserOut[]): Technician[] {
  return users
    .filter((u) => u.is_active && u.role === "technician")
    .map((u) => ({ id: String(u.id), name: u.full_name }));
}

export function mapEquipmentsToFormView(rows: EquipmentOut[]): Equipamento[] {
  return rows
    .filter((e) => e.ativo !== false)
    .map((e) => ({
      id: String(e.id),
      marca: e.fabricante?.trim() || e.identificacao?.trim() || "—",
      modelo: e.modelo?.trim() || e.identificacao?.trim() || "—",
      tipo: mapEquipmentTipo(e.categoria_instalacao),
      capacidadeBtu: e.capacidade_btu ?? 0,
      tag: e.identificacao?.trim() || undefined,
      localizacao: e.local_instalacao?.trim() || e.ambiente_nome?.trim() || undefined,
      numeroSerie: e.serial?.trim() || undefined,
    }));
}

export function serviceOrderOutToViewData(order: ServiceOrderOut): ServiceOrderData {
  const meta = parseMeta(order.description);
  const { date, time } = splitSchedule(order.schedule?.starts_at);
  const laborFromItems = order.service_items.reduce(
    (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
    0,
  );
  const partsFromItems = order.product_items.reduce(
    (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
    0,
  );
  const equipmentIds = [
    ...new Set(
      order.service_items
        .map((i) => i.equipment_id)
        .filter((id): id is number => id != null && id > 0)
        .map(String),
    ),
  ];

  return {
    id: String(order.id),
    numero: String(order.id),
    clienteId: String(order.client_id),
    tecnicoId: order.technician_ids?.[0] ? String(order.technician_ids[0]) : "",
    status: mapApiStatusToForm(order.status),
    tipoServico: inferServiceType(order, meta),
    dataAgendamento: date,
    horaAgendamento: time,
    equipamentosIds: equipmentIds,
    descricaoProblema: meta?.descricaoProblema ?? freeTextFromDescription(order.description) ?? order.title,
    diagnosticoTecnico: meta?.diagnosticoTecnico ?? "",
    checklist: mergeChecklist(meta?.checklist),
    valorPecas: meta?.valorPecas ?? partsFromItems,
    valorMaoDeObra: meta?.valorMaoDeObra ?? laborFromItems,
    observacoesInternas: meta?.observacoesInternas ?? order.schedule?.notes ?? "",
  };
}

export function mapOrdersToListView(
  rows: ServiceOrderOut[],
  clientsById: Map<number, string>,
): ServiceOrder[] {
  return rows.map((o) => {
    const meta = parseMeta(o.description);
    const techId = o.technician_ids?.[0];
    const techName = o.assigned_technician_name?.trim();
    return {
      id: String(o.id),
      number: String(o.id).padStart(4, "0"),
      clientName: clientsById.get(o.client_id) ?? `Cliente #${o.client_id}`,
      clientId: String(o.client_id),
      technician:
        techName && techId
          ? { id: String(techId), name: techName }
          : techName
            ? { id: "0", name: techName }
            : null,
      serviceType: inferListServiceType(o, meta),
      status: mapApiStatusToList(o.status),
      openedAt: o.schedule?.starts_at ?? new Date().toISOString(),
      scheduledAt: o.schedule?.starts_at,
      totalValue: orderGrandTotal(o),
      description: o.title,
    };
  });
}

export function computeListMetrics(orders: ServiceOrder[]): ServiceOrderMetrics {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const isSameDay = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  return {
    todayTotal: orders.filter((o) => isSameDay(o.openedAt)).length,
    inExecution: orders.filter((o) => o.status === "em_andamento").length,
    awaitingParts: orders.filter((o) => o.status === "aguardando_pecas").length,
    completedMonth: orders.filter((o) => {
      if (o.status !== "concluida") return false;
      const d = new Date(o.openedAt);
      return !Number.isNaN(d.getTime()) && d >= monthStart;
    }).length,
  };
}

export function viewDataToCreatePayload(
  data: ServiceOrderData,
  ctx: {
    clientName: string;
    services: ServiceOut[];
    products: ProductOut[];
  },
): ServiceOrderCreatePayload {
  const serviceId = resolveServiceId(data.tipoServico, ctx.services);
  const service = ctx.services.find((s) => s.id === serviceId)!;
  const equipmentIds = data.equipamentosIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  const serviceLines =
    equipmentIds.length > 0
      ? equipmentIds.map((equipment_id) => ({ service_id: serviceId, quantity: 1, equipment_id }))
      : [{ service_id: serviceId, quantity: 1 }];

  const products: Array<{ product_id: number; quantity: number }> = [];
  if (data.valorPecas > 0) {
    const productId = resolvePartsProductId(ctx.products);
    if (productId) products.push({ product_id: productId, quantity: 1 });
  }

  const catalogServicesTotal = serviceLines.length * Number(service.price || 0);
  const catalogProductsTotal =
    products.length > 0
      ? Number(ctx.products.find((p) => p.id === products[0]!.product_id)?.sale_price ?? 0)
      : 0;
  const desiredTotal = computeOrderTotalFromView(data);
  const discount_amount = Math.max(0, catalogServicesTotal + catalogProductsTotal - desiredTotal);

  const description = serializeDescription(data.descricaoProblema, metaFromViewData(data));

  return {
    client_id: Number(data.clienteId),
    title: `OS - ${ctx.clientName}`,
    description,
    technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : [],
    services: serviceLines,
    products,
    discount_amount,
  };
}

export function buildScheduleStartsAt(data: ServiceOrderData): string | null {
  if (!data.dataAgendamento || !data.horaAgendamento) return null;
  const local = new Date(`${data.dataAgendamento}T${data.horaAgendamento}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function mapFormStatusToPatchTarget(
  current: OrderStatus,
  next: ServiceOrderStatus,
): "in_progress" | "done" | "cancelled" | null {
  if (next === "em_andamento" && (current === "approved" || current === "scheduled")) return "in_progress";
  if (next === "concluida" && ["approved", "scheduled", "in_progress"].includes(current)) return "done";
  if (next === "cancelada" && current !== "done" && current !== "cancelled") return "cancelled";
  return null;
}
