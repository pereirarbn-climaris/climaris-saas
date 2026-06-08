import type { ProductOut } from "../api/products";
import type { ServiceOut } from "../api/services";
import {
  deleteServiceOrderProductItem,
  deleteServiceOrderServiceItem,
  getServiceOrder,
  patchServiceOrderProductItemQuantity,
  patchServiceOrderServiceItemQuantity,
  postServiceOrderProductItem,
  postServiceOrderServiceItem,
  updateServiceOrderItemEquipment,
  type ServiceOrderOut,
} from "../api/serviceOrders";
import type { ProductLineDraft, ServiceLineDraft } from "../components/v0-ui/service-orders/ServiceOrderFormView";

export function newLocalId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function lineEquipmentIds(line: ServiceLineDraft): string[] {
  if (line.equipmentIds?.length) return [...line.equipmentIds];
  if (line.equipmentId) return [line.equipmentId];
  return [];
}

export function computeLaborTotal(lines: ServiceLineDraft[]): number {
  return lines.reduce((s, l) => s + Math.max(l.quantity, 1) * Math.max(0, l.unitPrice), 0);
}

export function computePartsTotal(lines: ProductLineDraft[]): number {
  return lines.reduce((s, l) => s + Math.max(l.quantity, 1) * Math.max(0, l.unitPrice), 0);
}

export function serviceLinesFromOrder(order: ServiceOrderOut): ServiceLineDraft[] {
  const byKey = new Map<string, ServiceLineDraft>();

  for (const item of order.service_items) {
    const unitPrice = Number(item.unit_price) || 0;
    const key = `${item.service_id}|${unitPrice}`;
    const eqId = item.equipment_id ? String(item.equipment_id) : null;
    const itemQty = Math.max(item.quantity, 1);

    let line = byKey.get(key);
    if (!line) {
      line = {
        localId: `srv_${item.id}`,
        serverId: item.id,
        serverIds: [item.id],
        serviceId: String(item.service_id),
        label: item.service_name?.trim() || `Serviço #${item.service_id}`,
        quantity: itemQty,
        unitPrice,
        equipmentIds: eqId ? [eqId] : [],
      };
      byKey.set(key, line);
      continue;
    }

    line.serverIds = [...(line.serverIds ?? [line.serverId!]), item.id];
    line.quantity += itemQty;
    if (eqId && !line.equipmentIds.includes(eqId)) {
      line.equipmentIds.push(eqId);
    }
  }

  return [...byKey.values()];
}

export function productLinesFromOrder(order: ServiceOrderOut): ProductLineDraft[] {
  return order.product_items.map((item) => ({
    localId: `prd_${item.id}`,
    serverId: item.id,
    productId: String(item.product_id),
    label: `Produto #${item.product_id}`,
    quantity: Math.max(item.quantity, 1),
    unitPrice: Number(item.unit_price) || 0,
  }));
}

export function enrichProductLabels(lines: ProductLineDraft[], products: ProductOut[]): ProductLineDraft[] {
  const byId = new Map(products.map((p) => [String(p.id), p.name]));
  return lines.map((l) => ({
    ...l,
    label: byId.get(l.productId) ?? l.label,
  }));
}

export function defaultUnitPriceForService(serviceId: string, catalog: ServiceOut[]): number {
  const row = catalog.find((s) => String(s.id) === serviceId);
  return Number(row?.price ?? 0);
}

export function defaultUnitPriceForProduct(productId: string, catalog: ProductOut[]): number {
  const row = catalog.find((p) => String(p.id) === productId);
  return Number(row?.sale_price ?? row?.unit_price ?? 0);
}

function parseEquipmentIds(line: ServiceLineDraft): number[] {
  return lineEquipmentIds(line)
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Sincroniza linhas de serviço da OS com o formulário.
 */
export async function syncServiceOrderItems(
  orderId: number,
  order: ServiceOrderOut,
  services: ServiceLineDraft[],
  options?: { equipmentLinksOnly?: boolean },
): Promise<ServiceOrderOut> {
  let current = order;
  const desired = services.filter((l) => l.serviceId);
  const equipmentLinksOnly = options?.equipmentLinksOnly === true;

  if (desired.length === 0 && !equipmentLinksOnly) {
    throw new Error("A OS deve ter ao menos um serviço.");
  }

  console.log("[syncServiceOrderItems] início", {
    orderId,
    equipmentLinksOnly,
    desiredCount: desired.length,
    serverItems: current.service_items.length,
    desired,
  });

  if (!equipmentLinksOnly) {
    const keepIds = new Set(
      desired.flatMap((l) => l.serverIds ?? (l.serverId != null ? [l.serverId] : [])),
    );
    const toDelete = current.service_items.filter((item) => !keepIds.has(item.id));

    if (toDelete.length > 0 && current.service_items.length - toDelete.length < 1) {
      throw new Error("A OS deve manter pelo menos um serviço.");
    }

    for (const item of toDelete) {
      console.log("[syncServiceOrderItems] removendo", item.id);
      current = await deleteServiceOrderServiceItem(orderId, item.id);
    }
  }

  for (const line of desired) {
    const qty = Math.max(line.quantity, 1);
    const price = Math.max(0, line.unitPrice);
    const equipmentIds = parseEquipmentIds(line);
    const anchorId = line.serverId ?? line.serverIds?.[0];

    const prev =
      anchorId != null ? current.service_items.find((i) => i.id === anchorId) : undefined;

    if (prev) {
      if (!equipmentLinksOnly && (prev.quantity !== qty || Math.abs(Number(prev.unit_price) - price) > 0.0001)) {
        console.log("[syncServiceOrderItems] patch qty/preço", anchorId, { qty, price });
        current = await patchServiceOrderServiceItemQuantity(orderId, anchorId!, qty, price);
      }
      const related = current.service_items.filter(
        (i) =>
          i.service_id === Number(line.serviceId) &&
          Math.abs(Number(i.unit_price) - price) < 0.0001,
      );
      const prevEqIds = related
        .map((i) => i.equipment_id)
        .filter((id): id is number => id != null && id > 0)
        .sort((a, b) => a - b);
      const nextEqIds = [...equipmentIds].sort((a, b) => a - b);
      const relatedQty = related.reduce((sum, item) => sum + Math.max(item.quantity, 1), 0);
      const desiredQty = Math.max(qty, equipmentIds.length);
      const equipmentChanged = prevEqIds.join(",") !== nextEqIds.join(",");
      const quantityExpanded = equipmentLinksOnly && desiredQty > relatedQty;
      if (equipmentChanged || quantityExpanded) {
        console.log("[syncServiceOrderItems] PUT equipamentos", anchorId, nextEqIds);
        current = await updateServiceOrderItemEquipment(orderId, anchorId!, nextEqIds);
      }
      continue;
    }

    if (equipmentLinksOnly) {
      continue;
    }

    const firstEq = equipmentIds[0] ?? null;
    console.log("[syncServiceOrderItems] POST nova linha", {
      service_id: Number(line.serviceId),
      qty,
      price,
      equipmentIds,
    });
    current = await postServiceOrderServiceItem(orderId, {
      service_id: Number(line.serviceId),
      quantity: qty,
      equipment_id: firstEq,
      unit_price: price,
    });
    const created = current.service_items.find(
      (i) =>
        i.service_id === Number(line.serviceId) &&
        (i.equipment_id ?? null) === firstEq &&
        !desired.some((d) => (d.serverIds ?? []).includes(i.id) && d !== line),
    );
    const fallback = current.service_items[current.service_items.length - 1];
    const hit = created ?? fallback;
    if (hit) {
      line.serverId = hit.id;
      line.serverIds = [hit.id];
      line.localId = `srv_${hit.id}`;
      if (equipmentIds.length > 1 || (equipmentIds.length === 1 && hit.equipment_id !== firstEq)) {
        current = await updateServiceOrderItemEquipment(orderId, hit.id, equipmentIds);
      }
    }
  }

  console.log("[syncServiceOrderItems] concluído", {
    items: current.service_items.length,
  });
  return current;
}

/**
 * Sincroniza linhas de produtos/peças da OS com o formulário.
 */
export async function syncServiceOrderProducts(
  orderId: number,
  order: ServiceOrderOut,
  products: ProductLineDraft[],
): Promise<ServiceOrderOut> {
  let current = order;
  const desired = products.filter((l) => l.productId);

  console.log("[syncServiceOrderProducts] início", {
    orderId,
    desiredCount: desired.length,
    serverItems: current.product_items.length,
    desired,
  });

  const keepIds = new Set(desired.map((l) => l.serverId).filter((id): id is number => id != null));
  const toDelete = current.product_items.filter((item) => !keepIds.has(item.id));

  for (const item of toDelete) {
    console.log("[syncServiceOrderProducts] removendo", item.id);
    current = await deleteServiceOrderProductItem(orderId, item.id);
  }

  for (const line of desired) {
    const qty = Math.max(line.quantity, 1);
    const price = Math.max(0, line.unitPrice);
    const prev = line.serverId != null ? current.product_items.find((i) => i.id === line.serverId) : undefined;

    if (prev) {
      if (prev.quantity !== qty || Math.abs(Number(prev.unit_price) - price) > 0.0001) {
        console.log("[syncServiceOrderProducts] patch", line.serverId, { qty, price });
        current = await patchServiceOrderProductItemQuantity(orderId, line.serverId!, qty, price);
      }
      continue;
    }

    console.log("[syncServiceOrderProducts] POST", {
      product_id: Number(line.productId),
      qty,
      price,
    });
    current = await postServiceOrderProductItem(orderId, {
      product_id: Number(line.productId),
      quantity: qty,
      unit_price: price,
    });
    const hit = current.product_items.find((i) => i.product_id === Number(line.productId) && i.id);
    const fallback = current.product_items[current.product_items.length - 1];
    const row = hit ?? fallback;
    if (row) {
      line.serverId = row.id;
      line.localId = `prd_${row.id}`;
    }
  }

  console.log("[syncServiceOrderProducts] concluído", {
    items: current.product_items.length,
  });
  return current;
}

/** Sincroniza serviços e produtos (re-fetch opcional no caller). */
export async function syncServiceOrderLines(
  orderId: number,
  _order: ServiceOrderOut,
  services: ServiceLineDraft[],
  products: ProductLineDraft[],
): Promise<ServiceOrderOut> {
  let current = await getServiceOrder(orderId, { bustCache: true });
  current = await syncServiceOrderItems(orderId, current, services);
  current = await syncServiceOrderProducts(orderId, current, products);
  return current;
}

/** Vincula cada linha de serviço a todos os equipamentos selecionados na OS. */
export function linkServicesToAllSelectedEquipment(
  lines: ServiceLineDraft[],
  equipamentosIds: string[],
): ServiceLineDraft[] {
  if (equipamentosIds.length === 0) return lines;
  return lines.map((line) => ({
    ...line,
    quantity: equipamentosIds.length,
    equipmentIds: [...equipamentosIds],
    equipmentId: undefined,
  }));
}

type EquipmentSelectionInput = {
  equipamentosIds: string[];
  servicos: ServiceLineDraft[];
};

/** Remove equipamentos inativos/indisponíveis da seleção e das linhas de serviço. */
export function sanitizeServiceOrderEquipmentSelection<T extends EquipmentSelectionInput>(
  data: T,
  activeEquipments: ReadonlyArray<{ id: string }>,
): { data: T; removedCount: number } {
  const activeIds = new Set(activeEquipments.map((e) => e.id));
  const equipamentosIds = data.equipamentosIds.filter((id) => activeIds.has(id));
  const servicos = data.servicos.map((line) => {
    const equipmentIds = lineEquipmentIds(line).filter((id) => activeIds.has(id));
    return {
      ...line,
      equipmentIds,
      equipmentId: undefined,
      quantity: equipmentIds.length > 0 ? Math.max(line.quantity, equipmentIds.length) : line.quantity,
    };
  });
  const removedCount = data.equipamentosIds.filter((id) => !activeIds.has(id)).length;
  return { data: { ...data, equipamentosIds, servicos }, removedCount };
}

export function toggleServiceOnEquipment(
  lines: ServiceLineDraft[],
  equipmentId: string,
  lineLocalId: string,
  checked: boolean,
): ServiceLineDraft[] {
  const target = lines.find((l) => l.localId === lineLocalId);
  if (!target) return lines;

  const current = lineEquipmentIds(target);

  if (checked) {
    if (current.includes(equipmentId)) return lines;
    const nextCount = current.length + 1;
    const quantity = Math.max(target.quantity, nextCount);
    const equipmentIds = [...current, equipmentId];
    return lines.map((l) =>
      l.localId === lineLocalId
        ? { ...l, quantity, equipmentIds, equipmentId: undefined }
        : l,
    );
  }

  const equipmentIds = current.filter((id) => id !== equipmentId);
  return lines.map((l) =>
    l.localId === lineLocalId ? { ...l, equipmentIds, equipmentId: undefined } : l,
  );
}
