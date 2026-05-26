import createStyles from "../../pages/pmoc/PmocCreatePage.module.css";

export type PmocCreateTab = "identification" | "planning" | "schedule" | "air";

type BannerItem = {
  id: string;
  tone: "danger" | "warning" | "info";
  label: string;
  tab?: PmocCreateTab;
};

type Props = {
  selectedBtuSum: number;
  equipmentCount: number;
  activityCount: number;
  hasResponsibleTech: boolean;
  validationHighlights?: {
    missingClient?: boolean;
    missingSite?: boolean;
    missingEquipment?: boolean;
    missingRt?: boolean;
  };
  onNavigateTab?: (tab: PmocCreateTab) => void;
};

function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

export function PmocCreateStatusBanner({
  selectedBtuSum,
  equipmentCount,
  activityCount,
  hasResponsibleTech,
  validationHighlights,
  onNavigateTab,
}: Props) {
  const items: BannerItem[] = [];
  const highlights = validationHighlights ?? {};

  if (highlights.missingClient) {
    items.push({
      id: "val-client",
      tone: "danger",
      label: "Cliente não selecionado — obrigatório para salvar",
      tab: "identification",
    });
  }

  if (highlights.missingSite) {
    items.push({
      id: "val-site",
      tone: "danger",
      label: "Obra/filial não selecionada — obrigatório para salvar",
      tab: "identification",
    });
  }

  if (highlights.missingEquipment) {
    items.push({
      id: "val-equip",
      tone: "danger",
      label: "Nenhum equipamento vinculado — selecione ao menos um",
      tab: "identification",
    });
  }

  if (highlights.missingRt) {
    items.push({
      id: "val-rt",
      tone: "danger",
      label: "Responsável técnico (RT) não informado — aba Ar & ART",
      tab: "air",
    });
  }

  if (selectedBtuSum >= 60_000) {
    items.push({
      id: "btu-law",
      tone: "warning",
      label: `Capacidade ${formatBtu(selectedBtuSum)} ≥ 60k BTU — RT e análise de ar obrigatórios`,
      tab: "air",
    });
  } else if (selectedBtuSum > 0) {
    items.push({
      id: "btu-ok",
      tone: "info",
      label: `Capacidade ${formatBtu(selectedBtuSum)} — análise de ar não exigida`,
    });
  }

  items.push({
    id: "summary",
    tone: "info",
    label: `${equipmentCount} equipamento(s) · ${activityCount} atividade(s) no cronograma`,
    tab: equipmentCount === 0 ? "identification" : "schedule",
  });

  if (equipmentCount === 0) {
    items.push({
      id: "no-equip",
      tone: "warning",
      label: "Selecione equipamentos para compor o plano",
      tab: "identification",
    });
  }

  if (selectedBtuSum >= 60_000 && !hasResponsibleTech) {
    items.push({
      id: "no-rt",
      tone: "danger",
      label: "Responsável técnico pendente — obrigatório para esta capacidade",
      tab: "air",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "law-default",
      tone: "info",
      label: "Lei Federal nº 13.589/2018 — PMOC exige cronograma, RT e registros atualizados",
    });
  }

  return (
    <div className={createStyles.alertRow} role="region" aria-label="Alertas legais do PMOC">
      {items.map((item) => {
        const toneClass =
          item.tone === "danger"
            ? createStyles.infoStripDanger
            : item.tone === "warning"
              ? createStyles.infoStripWarning
              : createStyles.infoStrip;

        if (item.tab && onNavigateTab) {
          return (
            <button
              key={item.id}
              type="button"
              className={`${createStyles.infoStrip} ${toneClass} ${createStyles.infoStripBtn}`}
              onClick={() => onNavigateTab(item.tab!)}
            >
              {item.label}
            </button>
          );
        }

        return (
          <div key={item.id} className={`${createStyles.infoStrip} ${toneClass}`}>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
