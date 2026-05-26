import type {
  ChecklistItem,
  Cliente,
  Equipamento,
  ServiceOrderData,
  ServiceOrderStatus,
  ServiceType,
  Tecnico,
} from "../components/v0-ui/service-orders/ServiceOrderFormView";
import {
  computeLaborTotal,
  computePartsTotal,
  enrichProductLabels,
  productLinesFromOrder,
  serviceLinesFromOrder,
} from "./serviceOrderLinesSync";
import {
  computeDiscountAmountFromView,
  computeOrderTotalFromView,
  discountFieldsFromAmount,
  type DiscountType,
} from "./serviceOrderDiscount";

export { computeOrderTotalFromView } from "./serviceOrderDiscount";
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
import type { ServiceOrderEquipmentServiceInput } from "../types/serviceOrders";
import type { UserOut } from "../api/auth";
import { addMinutesToTimeString } from "./pmocOsSchedule";
import { formatPhoneBrInput, formatTaxDocumentInput } from "./brMask";

const META_MARKER = "\n---CLIMARIS_OS_META---\n";
const META_MARKER_ALT = "---CLIMARIS_OS_META---";

function findMetaSlice(description: string): { index: number; markerLen: number } | null {
  const idxNewline = description.indexOf(META_MARKER);
  if (idxNewline >= 0) return { index: idxNewline, markerLen: META_MARKER.length };
  const idxAlt = description.indexOf(META_MARKER_ALT);
  if (idxAlt >= 0) return { index: idxAlt, markerLen: META_MARKER_ALT.length };
  return null;
}

/** Remove trecho de meta embutido em texto de laudo (legado). */
export function stripOsMetaFromText(text: string | null | undefined): string {
  if (!text) return "";
  const raw = String(text);
  const hit = findMetaSlice(raw);
  if (hit) return raw.slice(0, hit.index).trim();
  if (raw.trimStart().startsWith(META_MARKER_ALT)) {
    return "";
  }
  return raw.trim();
}

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
  descontoTipo?: DiscountType;
  descontoValor?: number;
  pmocPlanId?: number;
  pmocPeriodYear?: number;
  pmocPeriodMonth?: number;
  pmocEstimatedMinutes?: number;
  clientSignatureBase64?: string | null;
  clientSignatureName?: string | null;
  clientSignatureAt?: string | null;
  clientSignatureGeo?: { lat: number; lng: number } | null;
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
  const trimmed = description.trim();
  const hit = findMetaSlice(description);
  if (hit) {
    const jsonPart = description.slice(hit.index + hit.markerLen).trim();
    try {
      return JSON.parse(jsonPart) as OsMeta;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith(META_MARKER_ALT)) {
    const jsonPart = trimmed.slice(META_MARKER_ALT.length).trim();
    try {
      return JSON.parse(jsonPart) as OsMeta;
    } catch {
      return null;
    }
  }
  return null;
}

function freeTextFromDescription(description: string | null | undefined): string {
  if (!description) return "";
  return stripOsMetaFromText(description);
}

/** Expande description da API em campos de laudo/checklist do formulário. */
export function expandServiceOrderDescriptionToViewFields(
  description: string | null | undefined,
  fallbackTitle?: string,
): {
  descricaoProblema: string;
  diagnosticoTecnico: string;
  checklist: ChecklistItem[];
  tipoServico?: ServiceType;
  observacoesInternas: string;
  clientSignatureBase64?: string | null;
  clientSignatureName?: string | null;
  clientSignatureAt?: string | null;
  clientSignatureGeo?: { lat: number; lng: number } | null;
} {
  const meta = parseMeta(description);
  const freeText = freeTextFromDescription(description);
  const descFromMeta = stripOsMetaFromText(meta?.descricaoProblema);
  const diagFromMeta = stripOsMetaFromText(meta?.diagnosticoTecnico);
  return {
    descricaoProblema: descFromMeta || freeText || (fallbackTitle ?? ""),
    diagnosticoTecnico: diagFromMeta,
    checklist: mergeChecklist(meta?.checklist),
    tipoServico: meta?.tipoServico,
    observacoesInternas: meta?.observacoesInternas ?? "",
    clientSignatureBase64: meta?.clientSignatureBase64 ?? null,
    clientSignatureName: meta?.clientSignatureName ?? null,
    clientSignatureAt: meta?.clientSignatureAt ?? null,
    clientSignatureGeo: meta?.clientSignatureGeo ?? null,
  };
}

function serializeDescription(freeText: string, meta: OsMeta): string | null {
  const payload = META_MARKER + JSON.stringify(meta);
  const base = freeText.trim();
  if (!base) return payload.trimStart();
  return `${base}${payload}`;
}

function metaFromViewData(data: ServiceOrderData): OsMeta {
  const pmocPlanId = data.pmocPlanId ? Number(data.pmocPlanId) : undefined;
  return {
    v: 1,
    tipoServico: data.tipoServico,
    descricaoProblema: data.descricaoProblema,
    diagnosticoTecnico: data.diagnosticoTecnico,
    observacoesInternas: data.observacoesInternas,
    checklist: data.checklist,
    valorPecas: data.valorPecas,
    valorMaoDeObra: data.valorMaoDeObra,
    descontoTipo: data.descontoTipo,
    descontoValor: data.descontoValor,
    pmocPlanId: Number.isFinite(pmocPlanId) && pmocPlanId! > 0 ? pmocPlanId : undefined,
    pmocPeriodYear: data.pmocPeriodYear,
    pmocPeriodMonth: data.pmocPeriodMonth,
    pmocEstimatedMinutes: data.pmocEstimatedMinutes,
    clientSignatureBase64: data.clientSignatureBase64,
    clientSignatureName: data.clientSignatureName,
    clientSignatureAt: data.clientSignatureAt,
    clientSignatureGeo: data.clientSignatureGeo,
  };
}

function mergeChecklist(stored: ChecklistItem[] | undefined): ChecklistItem[] {
  if (stored?.length && stored.every((item) => item.id.startsWith("pmoc_"))) {
    return stored.map((item) => ({ ...item }));
  }
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

export function mapClientsToFormView(clients: ClientOut[]): Cliente[] {
  const sorted = [...clients].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base", numeric: true }),
  );
  return sorted.map((c) => {
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
    const tradeName = (c.trade_name ?? "").trim();
    return {
      id: String(c.id),
      nome: c.name,
      nomeFantasia: tradeName || undefined,
      documento: formatTaxDocumentInput(c.document ?? "", type),
      telefone: formatPhoneBrInput(c.whatsapp ?? c.phone ?? ""),
      endereco: parts.length ? parts.join(", ") : undefined,
    };
  });
}

export function mapTechniciansToFormView(users: UserOut[]): Tecnico[] {
  return users
    .filter((u) => u.is_active && u.role === "technician")
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "pt-BR", { sensitivity: "base" }))
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
      localizacao:
        [e.local_instalacao?.trim(), e.installation_reference?.trim(), e.ambiente_nome?.trim()]
          .filter(Boolean)
          .join(" · ") || undefined,
      numeroSerie: e.serial?.trim() || undefined,
    }));
}

export function serviceOrderOutToViewData(order: ServiceOrderOut): ServiceOrderData {
  const meta = parseMeta(order.description);
  const laudo = expandServiceOrderDescriptionToViewFields(order.description, order.title);
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

  const servicos = serviceLinesFromOrder(order);
  const pecas = productLinesFromOrder(order);
  const subtotal = laborFromItems + partsFromItems;
  const { descontoTipo, descontoValor } = discountFieldsFromAmount(
    subtotal,
    order.discount_amount || 0,
    meta ?? undefined,
  );

  return {
    id: String(order.id),
    numero: String(order.id),
    clienteId: String(order.client_id),
    tecnicoId: order.technician_ids?.[0] ? String(order.technician_ids[0]) : "",
    status: mapApiStatusToForm(order.status),
    tipoServico: laudo.tipoServico ?? inferServiceType(order, meta),
    dataAgendamento: date,
    horaAgendamento: time,
    equipamentosIds: equipmentIds,
    servicos,
    pecas,
    descricaoProblema: laudo.descricaoProblema,
    diagnosticoTecnico: laudo.diagnosticoTecnico,
    checklist: laudo.checklist,
    valorPecas: partsFromItems,
    valorMaoDeObra: laborFromItems,
    descontoTipo,
    descontoValor,
    observacoesInternas: laudo.observacoesInternas || order.schedule?.notes || "",
    pmocPlanId: meta?.pmocPlanId ? String(meta.pmocPlanId) : "",
    pmocPeriodYear: meta?.pmocPeriodYear,
    pmocPeriodMonth: meta?.pmocPeriodMonth,
    pmocEstimatedMinutes: meta?.pmocEstimatedMinutes,
    horaTermino:
      time && meta?.pmocEstimatedMinutes
        ? addMinutesToTimeString(time, meta.pmocEstimatedMinutes)
        : "",
    clientSignatureBase64: laudo.clientSignatureBase64,
    clientSignatureName: laudo.clientSignatureName,
    clientSignatureAt: laudo.clientSignatureAt,
    clientSignatureGeo: laudo.clientSignatureGeo,
  };
}

export function enrichOrderViewLines(
  data: ServiceOrderData,
  products: ProductOut[],
): ServiceOrderData {
  return {
    ...data,
    pecas: enrichProductLabels(data.pecas ?? [], products),
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
      estimatedMinutes: o.total_duration_minutes ?? 0,
      actualMinutes: o.actual_duration_minutes ?? null,
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
  const serviceLinesInput =
    data.servicos && data.servicos.length > 0
      ? data.servicos.flatMap((line) => {
          const qty = Math.max(line.quantity, 1);
          const unit_price = Math.max(0, line.unitPrice);
          const service_id = Number(line.serviceId);
          const eqIds = (line.equipmentIds?.length ? line.equipmentIds : line.equipmentId ? [line.equipmentId] : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .slice(0, qty);
          if (eqIds.length === 0) {
            return [{ service_id, quantity: qty, equipment_id: null as number | null, unit_price }];
          }
          const rows: ServiceOrderEquipmentServiceInput[] = eqIds.map((equipment_id) => ({
            service_id,
            quantity: 1,
            equipment_id,
            unit_price,
          }));
          const remainder = qty - eqIds.length;
          if (remainder > 0) {
            rows.push({ service_id, quantity: remainder, equipment_id: null as number | null, unit_price });
          }
          return rows;
        })
      : (() => {
          const serviceId = resolveServiceId(data.tipoServico, ctx.services);
          const equipmentIds = data.equipamentosIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0);
          return equipmentIds.length > 0
            ? equipmentIds.map((equipment_id) => ({ service_id: serviceId, quantity: 1, equipment_id }))
            : [{ service_id: serviceId, quantity: 1 }];
        })();

  const productLinesInput =
    data.pecas && data.pecas.length > 0
      ? data.pecas.map((line) => ({
          product_id: Number(line.productId),
          quantity: Math.max(line.quantity, 1),
          unit_price: Math.max(0, line.unitPrice),
        }))
      : [];

  const discount_amount = computeDiscountAmountFromView(data);

  const description = serializeDescription(data.descricaoProblema, metaFromViewData(data));

  return {
    client_id: Number(data.clienteId),
    title: `OS - ${ctx.clientName}`,
    description,
    technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : [],
    services: serviceLinesInput,
    products: productLinesInput,
    discount_amount,
  };
}

export function buildDescriptionFromView(data: ServiceOrderData): string | null {
  return serializeDescription(data.descricaoProblema, metaFromViewData(data));
}

/** Payload PATCH /service-orders/{id}/details — laudo, checklist e totais do fechamento. */
export function buildOrderDetailsPayload(data: ServiceOrderData): {
  description: string | null;
  valorMaoDeObra: number;
  valorPecas: number;
  total: number;
} {
  const labor = computeLaborTotal(data.servicos ?? []);
  const parts = computePartsTotal(data.pecas ?? []);
  const meta = metaFromViewData({
    ...data,
    valorMaoDeObra: labor,
    valorPecas: parts,
  });
  return {
    description: serializeDescription(data.descricaoProblema, meta),
    valorMaoDeObra: labor,
    valorPecas: parts,
    total: computeOrderTotalFromView(data),
  };
}

export function buildScheduleStartsAt(data: ServiceOrderData): string | null {
  if (!data.dataAgendamento || !data.horaAgendamento) return null;
  const local = new Date(`${data.dataAgendamento}T${data.horaAgendamento}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** Snapshot estável para detectar alterações não salvas no formulário. */
export function serializeServiceOrderFormSnapshot(data: ServiceOrderData): string {
  const servicos = [...(data.servicos ?? [])]
    .map((s) => ({
      serviceId: s.serviceId,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      equipmentIds: [...(s.equipmentIds ?? [])].sort(),
    }))
    .sort((a, b) => a.serviceId.localeCompare(b.serviceId));

  const pecas = [...(data.pecas ?? [])]
    .map((p) => ({
      productId: p.productId,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const checklist = [...(data.checklist ?? [])]
    .map((c) => ({ id: c.id, status: c.status }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    clienteId: data.clienteId,
    tecnicoId: data.tecnicoId,
    status: data.status,
    tipoServico: data.tipoServico,
    dataAgendamento: data.dataAgendamento,
    horaAgendamento: data.horaAgendamento,
    equipamentosIds: [...(data.equipamentosIds ?? [])].sort(),
    servicos,
    pecas,
    descricaoProblema: data.descricaoProblema ?? "",
    diagnosticoTecnico: data.diagnosticoTecnico ?? "",
    checklist,
    descontoTipo: data.descontoTipo ?? "fixed",
    descontoValor: data.descontoValor ?? 0,
    observacoesInternas: data.observacoesInternas ?? "",
  });
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
