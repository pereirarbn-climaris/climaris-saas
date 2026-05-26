import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getPublicPmocValidation,
  type PublicPmocConservationStatus,
  type PublicPmocValidationPayload,
} from "../../api/publicPmocValidation";
import { PmocComplianceTrafficPanel } from "../../components/pmoc/PmocComplianceTrafficPanel";
import styles from "./PublicPmocValidationPage.module.css";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function conservationBadge(status: PublicPmocConservationStatus): { label: string; className: string } {
  if (status === "ok") return { label: "Conservação OK", className: styles.badgeOk };
  if (status === "critical") return { label: "Não conforme", className: styles.badgeCritical };
  if (status === "attention") return { label: "Atenção", className: styles.badgeAttention };
  return { label: "Sem vistoria recente", className: styles.badgePending };
}

function planStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "Ativo",
    draft: "Rascunho",
    inactive: "Inativo",
    archived: "Arquivado",
  };
  return map[status] ?? status;
}

export function PublicPmocValidationPage() {
  const { pmocId: pmocIdParam } = useParams<{ pmocId: string }>();
  const pmocId = pmocIdParam ? Number.parseInt(pmocIdParam, 10) : NaN;
  const [data, setData] = useState<PublicPmocValidationPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(pmocId) || pmocId < 1) {
      setErr("Link de validação inválido.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getPublicPmocValidation(pmocId);
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Erro ao validar PMOC.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pmocId]);

  if (err) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <p className={styles.err}>{err}</p>
          <Link to="/login" className={styles.link}>
            Acessar Climaris
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <p className={styles.muted}>Validando conformidade do PMOC…</p>
        </div>
      </div>
    );
  }

  const locationLabel = [data.establishment_city, data.establishment_state].filter(Boolean).join("/");

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <p className={styles.brand}>Climaris — Validação PMOC</p>
          <h1 className={styles.title}>{data.plan_title}</h1>
          <p className={styles.meta}>
            {data.client_name}
            {data.establishment_label ? ` · ${data.establishment_label}` : ""}
            {locationLabel ? ` · ${locationLabel}` : ""}
          </p>
          <p className={styles.meta}>Status do plano: {planStatusLabel(data.plan_status)}</p>
        </header>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Resumo de conformidade</h2>
          <PmocComplianceTrafficPanel
            indicators={data.indicators.map((item) => ({
              ...item,
              detail: item.detail ?? null,
            }))}
            overallStatus={data.overall_status}
            openOccurrences={0}
          />
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Responsável técnico e ART</h2>
          <div className={styles.grid2}>
            <div>
              <span className={styles.label}>Responsável técnico</span>
              <p className={styles.value}>{data.responsible_name ?? "Não informado"}</p>
            </div>
            <div>
              <span className={styles.label}>ART</span>
              <p className={styles.value}>{data.art_number ?? "Não registrada"}</p>
            </div>
            <div>
              <span className={styles.label}>Validade estimada da ART</span>
              <p className={styles.value}>{formatDate(data.art_valid_until)}</p>
            </div>
            <div>
              <span className={styles.label}>Consulta em</span>
              <p className={styles.value}>{formatDateTime(data.validated_at)}</p>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Manutenções</h2>
          <div className={styles.grid2}>
            <div>
              <span className={styles.label}>Última manutenção registrada</span>
              <p className={styles.value}>{formatDateTime(data.last_maintenance_at)}</p>
            </div>
            <div>
              <span className={styles.label}>Próxima previsão no cronograma</span>
              <p className={styles.value}>{formatDate(data.next_maintenance_expected)}</p>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Equipamentos vinculados</h2>
          {data.equipments.length === 0 ? (
            <p className={styles.muted}>Nenhum equipamento ativo vinculado a este plano.</p>
          ) : (
            <ul className={styles.equipmentList}>
              {data.equipments.map((eq) => {
                const badge = conservationBadge(eq.conservation_status);
                return (
                  <li key={`${eq.label}-${eq.location ?? ""}`} className={styles.equipmentItem}>
                    <p className={styles.equipmentName}>{eq.label}</p>
                    <p className={styles.equipmentMeta}>
                      {[eq.model, eq.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className={styles.equipmentMeta}>
                      Última vistoria: {formatDate(eq.last_inspection_at)}
                    </p>
                    <span className={badge.className}>{badge.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className={styles.footer}>
          Página pública de validação técnica conforme Lei Federal 13.589/2018. Exibe somente dados de
          conformidade do PMOC — sem informações comerciais ou cadastrais sensíveis.
        </p>
      </div>
    </div>
  );
}
