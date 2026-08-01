import { useEffect, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { listServices } from "../../api/services";
import { ServiceForm } from "../../components/services/form";
import {
  emptyServiceFormValues,
  mergeCategoryOptions,
} from "../../components/services/form/serviceForm.utils";
import type { DashboardOutletContext } from "../dashboardContext";

export function CreateServicePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listServices({ limit: 100 });
        if (cancelled) return;
        const fromDb = rows.map((row) => row.service_category || "").filter(Boolean);
        setCategories(mergeCategoryOptions(fromDb));
      } catch {
        if (!cancelled) setCategories(mergeCategoryOptions([]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!canEdit) {
    return <Navigate to="/app/services" replace />;
  }

  return (
    <ServiceForm
      mode="create"
      initialValues={emptyServiceFormValues()}
      categoriesFromDb={categories}
      canEdit={canEdit}
    />
  );
}
