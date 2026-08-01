import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { listProducts, type ProductOut } from "../../../api/products";
import {
  createService,
  deleteService,
  updateService,
  type ServiceCreatePayload,
  type ServiceOut,
  type ServiceUpdatePayload,
} from "../../../api/services";
import {
  formatBrlInputFromDigits,
  parseBrlInputToNumber,
} from "../../../lib/currencyBrInput";
import { toast } from "../../../lib/toast";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import { DeleteServiceDialog } from "../DeleteServiceDialog";
import { isLikelyLinkedDeleteError } from "../services.utils";
import { GeneralInformationCard } from "./GeneralInformationCard";
import { ServiceProductInputsCard } from "./ServiceProductInputsCard";
import { ServiceFooter } from "./ServiceFooter";
import { ServiceFormHeader } from "./ServiceFormHeader";
import type { ServiceFormErrors, ServiceFormValues } from "./serviceForm.types";
import {
  buildPreventivePayload,
  buildProductInputsPayload,
  mergeCategoryOptions,
  parseDurationMinutesInput,
  sanitizeDurationMinutesInput,
} from "./serviceForm.utils";
import styles from "./service-form.module.css";

const FORM_ID = "service-form-main";

const ERROR_FIELD_IDS: Partial<Record<keyof ServiceFormErrors, string>> = {
  name: "sf-name",
  description: "sf-description",
  service_category: "sf-category",
  service_type: "sf-type",
  price: "sf-price",
  duration_minutes: "sf-duration",
  preventive_interval_value: "sf-preventive-value",
  product_inputs: "sf-products-section",
};

function focusFirstInvalidField(nextErrors: ServiceFormErrors) {
  const firstKey = Object.keys(nextErrors)[0] as keyof ServiceFormErrors | undefined;
  if (!firstKey) return;
  const targetId = ERROR_FIELD_IDS[firstKey];
  if (!targetId) return;
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLElement && "focus" in el) {
    el.focus({ preventScroll: true });
  }
}

type Props = {
  mode: "create" | "edit";
  initialValues: ServiceFormValues;
  categoriesFromDb?: string[];
  canEdit: boolean;
  canDelete?: boolean;
  serviceId?: number;
  preserved?: Partial<ServiceOut> | null;
};

export function ServiceForm({
  mode,
  initialValues,
  categoriesFromDb = [],
  canEdit,
  canDelete,
  serviceId,
  preserved,
}: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState<ServiceFormValues>(initialValues);
  const [errors, setErrors] = useState<ServiceFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"delete" | "linked">("delete");
  const [products, setProducts] = useState<ProductOut[]>([]);

  const categories = useMemo(
    () => mergeCategoryOptions(categoriesFromDb),
    [categoriesFromDb],
  );

  const readOnly = !canEdit;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listProducts({ limit: 100 });
        if (!cancelled) setProducts(list);
      } catch {
        if (!cancelled) setProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField<K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) {
    if (key === "price" && typeof value === "string") {
      setValues((prev) => ({ ...prev, price: formatBrlInputFromDigits(value) }));
    } else if (key === "duration_minutes" && typeof value === "string") {
      setValues((prev) => ({ ...prev, duration_minutes: sanitizeDurationMinutesInput(value) }));
    } else {
      setValues((prev) => ({ ...prev, [key]: value }));
    }
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): ServiceFormErrors {
    const next: ServiceFormErrors = {};
    if (!values.name.trim()) next.name = "Informe o nome do serviço.";
    if (!values.description.trim()) next.description = "Informe a descrição do serviço.";
    if (!values.service_category.trim()) next.service_category = "Selecione a categoria.";
    if (!values.service_type.trim()) next.service_type = "Selecione o tipo.";

    const price = parseBrlInputToNumber(values.price);
    if (!Number.isFinite(price) || price < 0) next.price = "Informe um valor válido.";

    const duration = parseDurationMinutesInput(values.duration_minutes);
    if (!values.duration_minutes.trim()) {
      next.duration_minutes = "Informe a duração em minutos.";
    } else if (duration == null) {
      next.duration_minutes = "Informe um valor entre 1 e 1440 minutos.";
    }

    if (values.preventive_enabled) {
      const interval = Number(values.preventive_interval_value);
      if (!Number.isFinite(interval) || interval < 1) {
        next.preventive_interval_value = "Informe o intervalo de lembrete.";
      }
    }

    const seenProducts = new Set<number>();
    for (const row of values.product_inputs) {
      const pid = Number(row.product_id);
      if (!row.product_id) continue;
      if (!Number.isFinite(pid) || pid < 1) {
        next.product_inputs = "Selecione um produto válido.";
        break;
      }
      if (seenProducts.has(pid)) {
        next.product_inputs = "Há produtos repetidos na lista.";
        break;
      }
      seenProducts.add(pid);
      const qty = Number(row.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        next.product_inputs = "Informe quantidade maior que zero.";
        break;
      }
    }

    return next;
  }

  function buildPayload(): ServiceCreatePayload {
    const duration = parseDurationMinutesInput(values.duration_minutes);
    if (duration == null) {
      throw new Error("Duração inválida.");
    }

    const preventive = buildPreventivePayload(values);

    return {
      name: values.name.trim(),
      description: values.description.trim(),
      price: parseBrlInputToNumber(values.price),
      duration_minutes: duration,
      service_category: values.service_category.trim() || null,
      code: values.code.trim() || null,
      service_type: values.service_type.trim() || null,
      require_photo: values.require_photo,
      icon_key: values.icon_key,
      notes: values.notes.trim() || null,
      is_active: values.is_active,
      visible_in_service_order: values.visible_in_service_order,
      visible_in_pmoc: values.visible_in_pmoc,
      visible_in_contract: values.visible_in_contract,
      ...preventive,
      applies_residential: preserved?.applies_residential ?? true,
      applies_commercial: preserved?.applies_commercial ?? true,
      equipment_type_tags: preserved?.equipment_type_tags ?? null,
      btu_min: preserved?.btu_min ?? null,
      btu_max: preserved?.btu_max ?? null,
      nfse_codigo_tributacao_nacional: preserved?.nfse_codigo_tributacao_nacional ?? null,
      nfse_codigo_nbs: preserved?.nfse_codigo_nbs ?? null,
      product_inputs: buildProductInputsPayload(values.product_inputs),
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setSubmitErr("");
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Preencha os campos obrigatórios.");
      focusFirstInvalidField(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (mode === "create") {
        const created = await createService(payload);
        toast.success("Serviço cadastrado com sucesso!");
        navigate(`/app/services/${created.id}`, { replace: true });
      } else if (serviceId) {
        const updatePayload: ServiceUpdatePayload = payload;
        await updateService(serviceId, updatePayload);
        toast.success("Alterações salvas com sucesso!");
        navigate("/app/services");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar.";
      setSubmitErr(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!serviceId || !canDelete) return;
    setDeleting(true);
    setSubmitErr("");
    try {
      await deleteService(serviceId);
      toast.success("Serviço excluído.");
      setDeleteOpen(false);
      navigate("/app/services", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível excluir.";
      if (isLikelyLinkedDeleteError(message)) {
        setDeleteMode("linked");
      } else {
        setSubmitErr(message);
        toast.error(message);
        setDeleteOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function confirmInactivate() {
    if (!serviceId || !canDelete) return;
    setDeleting(true);
    try {
      await updateService(serviceId, { is_active: false });
      toast.success("Serviço inativado.");
      setDeleteOpen(false);
      setDeleteMode("delete");
      setValues((prev) => ({ ...prev, is_active: false }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível inativar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={clientStyles.page}>
      <ServiceFormHeader mode={mode} />
      {submitErr ? <p className={styles.msgErr}>{submitErr}</p> : null}

      <form id={FORM_ID} className={clientStyles.tabPanel} onSubmit={onSubmit} noValidate>
        <section className={clientStyles.card}>
          <GeneralInformationCard
            values={values}
            errors={errors}
            categories={categories}
            disabled={readOnly || saving || deleting}
            onChange={setField}
          />

          <div className={clientStyles.divider} />

          <ServiceProductInputsCard
            rows={values.product_inputs}
            products={products}
            servicePrice={values.price}
            error={errors.product_inputs}
            disabled={readOnly || saving || deleting}
            onChange={(product_inputs) => setField("product_inputs", product_inputs)}
          />
        </section>
      </form>

      <ServiceFooter
        mode={mode}
        formId={FORM_ID}
        saving={saving}
        deleting={deleting}
        disabled={readOnly}
        canDelete={canDelete}
        onDelete={() => {
          setDeleteMode("delete");
          setDeleteOpen(true);
        }}
      />

      <DeleteServiceDialog
        open={deleteOpen}
        mode={deleteMode}
        serviceName={values.name || "este serviço"}
        busy={deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false);
            setDeleteMode("delete");
          }
        }}
        onConfirmDelete={() => void confirmDelete()}
        onConfirmInactivate={() => void confirmInactivate()}
      />
    </div>
  );
}
