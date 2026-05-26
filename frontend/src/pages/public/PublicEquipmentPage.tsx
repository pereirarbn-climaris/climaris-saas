import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicEquipmentPage, type PublicEquipmentPagePayload } from "../../api/publicEquipment";
import { PublicEquipmentProfileView } from "../../components/v0-ui/clients/PublicEquipmentProfileView v2";
import { mapPublicPayloadToProfile } from "../../lib/equipmentProfileAdapter";
import { getAccessToken } from "../../lib/authStorage";
import { PublicEquipmentHistoryOnly } from "./PublicEquipmentHistoryOnly";
import { PublicEquipmentNotFound } from "./PublicEquipmentNotFound";
import styles from "./PublicEquipmentPage.module.css";

export function PublicEquipmentPage() {
  const { token, codeId } = useParams<{ token?: string; codeId?: string }>();
  const publicKey = (codeId ?? token ?? "").trim();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicEquipmentPagePayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const loggedIn = Boolean(getAccessToken());

  useEffect(() => {
    if (!publicKey) {
      setNotFound(true);
      setNotFoundMsg("Link inválido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    void (async () => {
      try {
        const page = await getPublicEquipmentPage(publicKey);
        if (!cancelled) {
          setData(page);
          setNotFound(false);
        }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setNotFound(true);
          setNotFoundMsg(e instanceof Error ? e.message : "Não foi possível carregar esta etiqueta.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const equipmentProfile = useMemo(() => {
    if (!data || !publicKey) return null;
    return mapPublicPayloadToProfile(data, publicKey);
  }, [data, publicKey]);

  const statusLabel = data?.equipment_status_label ?? (data?.is_active ? "Operacional" : "Inativo");

  const canOpenOs = Boolean(loggedIn && data?.equipment_id && data?.client_id);

  function openNewServiceOrder() {
    if (!data?.equipment_id || !data?.client_id) return;
    navigate(`/app/service-orders/new?client_id=${data.client_id}&equipment_id=${data.equipment_id}`);
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <p className={styles.muted}>Carregando…</p>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return <PublicEquipmentNotFound message={notFoundMsg} codeId={publicKey} />;
  }

  if (!loggedIn) {
    return <PublicEquipmentHistoryOnly data={data} statusLabel={statusLabel} />;
  }

  if (!equipmentProfile) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <p className={styles.muted}>Carregando ficha do equipamento…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageWithFab}>
      <div className={styles.statusBar}>
        <span
          className={
            statusLabel === "Em Manutenção"
              ? styles.statusMaintenance
              : statusLabel === "Inativo"
                ? styles.statusInactive
                : styles.statusActive
          }
        >
          {statusLabel}
        </span>
        {data.qrcode_code_id ? (
          <span className={styles.codeChip}>
            <code>{data.qrcode_code_id}</code>
          </span>
        ) : null}
      </div>

      <PublicEquipmentProfileView
        equipment={equipmentProfile}
        variant="public"
        onLoginClick={() => navigate("/login")}
        showTechnicianActions={false}
      />

      {canOpenOs ? (
        <button type="button" className={styles.fabNewOs} onClick={openNewServiceOrder}>
          Abrir Nova O.S.
        </button>
      ) : null}
    </div>
  );
}
