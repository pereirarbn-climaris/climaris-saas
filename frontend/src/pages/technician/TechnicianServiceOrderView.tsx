import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ServiceOut } from "../../api/services";
import { ClientPhoneContactActions } from "../../components/ClientPhoneContactActions";
import { buildClientPhoneContactRows, googleMapsSearchUrl, wazeSearchUrl } from "../../lib/clientContactDisplay";
import { formatDurationMinutes } from "../../lib/formatDuration";
import { equipmentCardTitle } from "../../lib/equipmentDisplay";
import type {
  OrderStatus,
  ServiceOrderEquipmentCardOut,
  ServiceOrderEquipmentServiceOut,
  ServiceOrderOut,
} from "../../types/serviceOrders";
import styles from "./TechnicianServiceOrderPage.module.css";

const STATUS_LABELS: Record<OrderStatus, string> = {
  open: "Aberta",
  approved: "Aprovada",
  scheduled: "Agendada",
  in_progress: "Em andamento",
  done: "Concluída",
  cancelled: "Cancelada",
};

function statusClass(status: OrderStatus): string {
  switch (status) {
    case "scheduled":
    case "approved":
      return styles.statusScheduled;
    case "in_progress":
      return styles.statusProgress;
    case "done":
      return styles.statusDone;
    case "cancelled":
      return styles.statusCancelled;
    default:
      return styles.statusOpen;
  }
}

function formatScheduleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatScheduleTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export type TechnicianServiceOrderViewProps = {
  order: ServiceOrderOut;
  clientName: string;
  clientAddress: string | null;
  clientPhone: string | null;
  clientWhatsapp: string | null;
  productNameById: Map<number, string>;
  inventoryEnabled?: boolean;
  servicesCatalog: ServiceOut[];
  completedServiceIds: Set<number>;
  busy?: boolean;
  readOnly?: boolean;
  onToggleServiceDone: (serviceItemId: number, done: boolean) => void;
  onAddService: (equipmentId: number | null, serviceId: number) => Promise<void>;
  onStartOrder?: () => void;
  onCompleteOrder?: () => void;
};

export function TechnicianServiceOrderView({
  order,
  clientName,
  clientAddress,
  clientPhone,
  clientWhatsapp,
  productNameById,
  inventoryEnabled = true,
  servicesCatalog,
  completedServiceIds,
  busy = false,
  readOnly = false,
  onToggleServiceDone,
  onAddService,
  onStartOrder,
  onCompleteOrder,
}: TechnicianServiceOrderViewProps) {
  const [addDialogCard, setAddDialogCard] = useState<ServiceOrderEquipmentCardOut | null>(null);
  const [addingServiceId, setAddingServiceId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const totalMinutes = order.total_duration_minutes ?? 0;
  const actualMinutes = order.actual_duration_minutes ?? null;
  const cards = order.equipment_cards ?? [];
  const schedule = order.schedule;

  const linkedServiceIdsByEquipment = useMemo(() => {
    const map = new Map<number | null, Set<number>>();
    for (const card of cards) {
      const key = card.equipment_id ?? null;
      map.set(key, new Set(card.services.map((s) => s.service_id)));
    }
    return map;
  }, [cards]);

  const canExecute = !readOnly && order.status !== "done" && order.status !== "cancelled";
  const phoneContactRows = useMemo(
    () => buildClientPhoneContactRows(clientPhone, clientWhatsapp),
    [clientPhone, clientWhatsapp],
  );

  const handlePickService = async (serviceId: number) => {
    if (!addDialogCard || busy) return;
    setAddingServiceId(serviceId);
    try {
      await onAddService(addDialogCard.equipment_id, serviceId);
      setAddDialogCard(null);
    } finally {
      setAddingServiceId(null);
    }
  };

  return (
    <>
      <header className={styles.banner} aria-label="Resumo do agendamento">
        <p className={styles.bannerEyebrow}>
          {order.status === "done" && actualMinutes != null ? "Tempo real de execução" : "Tempo estimado de execução"}
        </p>
        <p className={styles.bannerDuration}>
          {order.status === "done" && actualMinutes != null
            ? formatDurationMinutes(actualMinutes)
            : formatDurationMinutes(totalMinutes)}
        </p>
        {order.status === "done" && actualMinutes != null && totalMinutes > 0 ? (
          <p className={styles.bannerCompare}>
            Estimado: {formatDurationMinutes(totalMinutes)}
            {actualMinutes > totalMinutes * 1.2 ? " · acima do previsto" : null}
          </p>
        ) : null}
        <div className={styles.scheduleGrid}>
          <div className={styles.scheduleItem}>
            <span className={styles.scheduleLabel}>Data</span>
            <span className={styles.scheduleValue}>
              {schedule ? formatScheduleDate(schedule.starts_at) : "—"}
            </span>
          </div>
          <div className={styles.scheduleItem}>
            <span className={styles.scheduleLabel}>Início</span>
            <span className={styles.scheduleValue}>
              {schedule ? formatScheduleTime(schedule.starts_at) : "—"}
            </span>
          </div>
          <div className={styles.scheduleItem}>
            <span className={styles.scheduleLabel}>Técnico</span>
            <span className={styles.scheduleValue}>{order.assigned_technician_name?.trim() || "A definir"}</span>
          </div>
        </div>
      </header>

      <h1 className={styles.osTitle}>
        OS #{order.id}
        <span className={`${styles.statusBadge} ${statusClass(order.status)}`}>{STATUS_LABELS[order.status]}</span>
      </h1>
      <div className={styles.osClientBlock}>
        <p className={styles.osMeta}>
          <strong>{clientName}</strong>
          {order.title ? ` · ${order.title}` : null}
        </p>
        {clientAddress?.trim() ? (
          <p className={`${styles.osMeta} ${styles.osAddressRow}`} title={clientAddress}>
            <span className={styles.osMetaLabel}>Endereço: </span>
            {isMobile ? (
              <>
                <a
                  href={googleMapsSearchUrl(clientAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.osAddressLink}
                >
                  {clientAddress}
                </a>
                <span className={styles.osAddressSep} aria-hidden>
                  {" · "}
                </span>
                <a
                  href={wazeSearchUrl(clientAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.osAddressLinkAlt}
                >
                  Waze
                </a>
              </>
            ) : (
              clientAddress
            )}
          </p>
        ) : null}
        {phoneContactRows.length > 0 ? (
          <div className={styles.osPhoneList}>
            {phoneContactRows.map((row) => (
              <ClientPhoneContactActions key={`${row.label}-${row.raw}`} label={row.label} phone={row.raw} />
            ))}
          </div>
        ) : null}
      </div>

      <h2 className={styles.sectionTitle}>Equipamentos e serviços</h2>
      <div className={styles.cardsGrid}>
        {cards.length === 0 ? (
          <p className={styles.emptyMaterials}>Nenhum equipamento vinculado nesta OS.</p>
        ) : (
          cards.map((card) => (
            <EquipmentCard
              key={String(card.equipment_id ?? "unlinked")}
              card={card}
              clientId={order.client_id}
              completedServiceIds={completedServiceIds}
              canExecute={canExecute}
              busy={busy}
              onToggleServiceDone={onToggleServiceDone}
              onAddService={() => setAddDialogCard(card)}
            />
          ))
        )}
      </div>

      {inventoryEnabled ? (
        <section className={styles.materialsSection} aria-labelledby="materials-heading">
          <h2 id="materials-heading" className={styles.sectionTitle}>
            Materiais separados para a OS
          </h2>
          {order.product_items.length === 0 ? (
            <p className={styles.emptyMaterials}>Nenhum material listado para esta visita.</p>
          ) : (
            <ul className={styles.materialsList}>
              {order.product_items.map((item) => (
                <li key={item.id} className={styles.materialsRow}>
                  <span>{productNameById.get(item.product_id) ?? `Produto #${item.product_id}`}</span>
                  <span className={styles.materialsQty}>Qtd. {item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {canExecute ? (
        <div className={styles.actionsBar}>
          {order.status !== "in_progress" && onStartOrder ? (
            <button type="button" className={styles.btnPrimary} disabled={busy} onClick={onStartOrder}>
              Iniciar Atendimento
            </button>
          ) : null}
          {order.status === "in_progress" && onCompleteOrder ? (
            <button type="button" className={styles.btnPrimary} disabled={busy} onClick={onCompleteOrder}>
              Finalizar Atendimento
            </button>
          ) : null}
        </div>
      ) : null}

      {addDialogCard ? (
        <AddServiceDialog
          card={addDialogCard}
          servicesCatalog={servicesCatalog}
          linkedServiceIds={linkedServiceIdsByEquipment.get(addDialogCard.equipment_id ?? null) ?? new Set()}
          busy={busy}
          addingServiceId={addingServiceId}
          onPick={handlePickService}
          onClose={() => setAddDialogCard(null)}
        />
      ) : null}
    </>
  );
}

function EquipmentCard({
  card,
  clientId,
  completedServiceIds,
  canExecute,
  busy,
  onToggleServiceDone,
  onAddService,
}: {
  card: ServiceOrderEquipmentCardOut;
  clientId: number;
  completedServiceIds: Set<number>;
  canExecute: boolean;
  busy: boolean;
  onToggleServiceDone: (id: number, done: boolean) => void;
  onAddService: () => void;
}) {
  const subtitle = [card.equipment_tipo, card.equipment_modelo].filter(Boolean).join(" · ");

  return (
    <article className={styles.equipmentCard}>
      <div className={styles.equipmentCardHeader}>
        <h3 className={styles.equipmentName}>{equipmentCardTitle(card)}</h3>
        {subtitle ? <p className={styles.equipmentSub}>{subtitle}</p> : null}
        <p className={styles.equipmentDuration}>
          Tempo no aparelho: {formatDurationMinutes(card.total_duration_minutes)}
        </p>
        {card.equipment_pending_identification ? (
          <p className={styles.pendingIdentificationBanner}>
            ⚠️ Equipamento a identificar — informe a marca e o modelo reais antes de concluir esta OS.{" "}
            <Link to={`/app/clients/${clientId}?tab=equipamentos`} className={styles.pendingIdentificationLink}>
              Identificar agora
            </Link>
          </p>
        ) : null}
      </div>
      <ul className={styles.serviceList}>
        {card.services.map((service) => (
          <ServiceRow
            key={service.id}
            service={service}
            done={completedServiceIds.has(service.id)}
            canExecute={canExecute}
            busy={busy}
            onToggle={onToggleServiceDone}
          />
        ))}
      </ul>
      {canExecute && card.equipment_id != null ? (
        <button type="button" className={styles.addServiceBtn} disabled={busy} onClick={onAddService}>
          + Adicionar serviço a este aparelho
        </button>
      ) : null}
    </article>
  );
}

function ServiceRow({
  service,
  done,
  canExecute,
  busy,
  onToggle,
}: {
  service: ServiceOrderEquipmentServiceOut;
  done: boolean;
  canExecute: boolean;
  busy: boolean;
  onToggle: (id: number, done: boolean) => void;
}) {
  const label = service.service_name?.trim() || `Serviço #${service.service_id}`;
  const lineMinutes = Math.max(service.quantity, 1) * Math.max(service.duration_minutes, 1);

  return (
    <li className={`${styles.serviceRow} ${done ? styles.serviceRowDone : ""}`}>
      <input
        type="checkbox"
        className={styles.serviceCheck}
        checked={done}
        disabled={!canExecute || busy}
        aria-label={`Serviço concluído: ${label}`}
        onChange={(e) => onToggle(service.id, e.target.checked)}
      />
      <ServiceBody service={service} label={label} />
      <span className={styles.serviceDuration}>{formatDurationMinutes(lineMinutes)}</span>
    </li>
  );
}

function ServiceBody({ service, label }: { service: ServiceOrderEquipmentServiceOut; label: string }) {
  return (
    <div className={styles.serviceBody}>
      <p className={styles.serviceName}>{label}</p>
      {service.quantity > 1 ? (
        <p className={styles.serviceMeta}>Quantidade: {service.quantity}</p>
      ) : null}
    </div>
  );
}

function AddServiceDialog({
  card,
  servicesCatalog,
  linkedServiceIds,
  busy,
  addingServiceId,
  onPick,
  onClose,
}: {
  card: ServiceOrderEquipmentCardOut;
  servicesCatalog: ServiceOut[];
  linkedServiceIds: Set<number>;
  busy: boolean;
  addingServiceId: number | null;
  onPick: (serviceId: number) => void;
  onClose: () => void;
}) {
  const activeServices = servicesCatalog.filter((s) => s.is_active);

  return (
    <DialogBackdrop busy={busy} onClose={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-service-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-service-title" className={styles.dialogTitle}>
          Adicionar serviço — {equipmentCardTitle(card)}
        </h3>
        {activeServices.length === 0 ? (
          <p className={styles.emptyMaterials}>Nenhum serviço disponível no catálogo.</p>
        ) : (
          <ul className={styles.servicePickList}>
            {activeServices.map((svc) => {
              const alreadyLinked = linkedServiceIds.has(svc.id);
              const isAdding = addingServiceId === svc.id;
              return (
                <li key={svc.id}>
                  <button
                    type="button"
                    className={styles.servicePickBtn}
                    disabled={busy || alreadyLinked || isAdding}
                    onClick={() => void onPick(svc.id)}
                  >
                    {svc.name}
                    {alreadyLinked ? " (já vinculado)" : ""}
                    {!alreadyLinked ? ` · ${formatDurationMinutes(svc.duration_minutes)}` : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className={styles.dialogClose} disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </DialogBackdrop>
  );
}

function DialogBackdrop({
  busy,
  onClose,
  children,
}: {
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onClick={() => !busy && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
    >
      {children}
    </div>
  );
}
