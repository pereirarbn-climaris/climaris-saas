import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { getService, listServices } from "../../api/services";
import { ServiceForm } from "../../components/services/form";
import {
  emptyServiceFormValues,
  mergeCategoryOptions,
  serviceToFormValues,
} from "../../components/services/form/serviceForm.utils";
import clientStyles from "../clients/ClientDetail.module.css";
import { ServiceFormSkeleton } from "../../components/services/form/ServiceFormSkeleton";
import type { DashboardOutletContext } from "../dashboardContext";

export function EditServicePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const { serviceId } = useParams<{ serviceId: string }>();
  const idNum = Number(serviceId);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [initialValues, setInitialValues] = useState(emptyServiceFormValues);
  const [preserved, setPreserved] = useState<Awaited<ReturnType<typeof getService>> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const [service, allServices] = await Promise.all([
          getService(idNum),
          listServices({ limit: 100 }),
        ]);
        if (cancelled) return;
        setPreserved(service);
        setInitialValues(serviceToFormValues(service));
        const fromDb = allServices
          .map((row) => row.service_category || "")
          .filter(Boolean);
        setCategories(mergeCategoryOptions(fromDb));
      } catch (err) {
        if (!cancelled) {
          setLoadErr(err instanceof Error ? err.message : "Erro ao carregar serviço.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idNum]);

  if (!Number.isFinite(idNum) || idNum < 1) {
    return <Navigate to="/app/services" replace />;
  }

  if (loading) {
    return (
      <div className={clientStyles.page}>
        <ServiceFormSkeleton />
      </div>
    );
  }

  if (loadErr || !preserved) {
    return (
      <div className={clientStyles.page}>
        <p className={clientStyles.cardHint}>{loadErr || "Serviço não encontrado."}</p>
        <Link className={`${clientStyles.btn} ${clientStyles.btnSecondary}`} to="/app/services">
          Voltar para serviços
        </Link>
      </div>
    );
  }

  return (
    <ServiceForm
      mode="edit"
      serviceId={idNum}
      initialValues={initialValues}
      categoriesFromDb={categories}
      canEdit={canEdit}
      canDelete={canDelete}
      preserved={preserved}
    />
  );
}
