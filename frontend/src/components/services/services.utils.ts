import type { ServiceOut } from "../../api/services";

export type ServiceTypeKey =
  | "preventivo"
  | "corretivo"
  | "instalacao"
  | "higienizacao"
  | "inspecao"
  | "outros";

export type ServiceTypeFilter = "all" | ServiceTypeKey;
export type ServiceStatusFilter = "all" | "active" | "inactive";

export const SERVICE_TYPE_OPTIONS: Array<{ value: ServiceTypeKey; label: string }> = [
  { value: "preventivo", label: "Preventivo" },
  { value: "corretivo", label: "Corretivo" },
  { value: "instalacao", label: "Instalação" },
  { value: "higienizacao", label: "Higienização" },
  { value: "inspecao", label: "Inspeção" },
  { value: "outros", label: "Outros" },
];

export const SERVICE_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

export function formatServiceCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: value % 1 === 0 ? 0 : 1 })}%`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getServiceSearchBlob(service: ServiceOut): string {
  return normalizeText(
    [service.name, service.description ?? "", service.service_category ?? "", inferServiceTypeLabel(service)].join(" "),
  );
}

export function inferServiceType(service: ServiceOut): ServiceTypeKey {
  const explicit = normalizeText(service.service_type ?? "");
  if (
    explicit === "preventivo" ||
    explicit === "corretivo" ||
    explicit === "instalacao" ||
    explicit === "higienizacao" ||
    explicit === "inspecao" ||
    explicit === "outros"
  ) {
    return explicit;
  }

  const hay = normalizeText(
    `${service.service_category ?? ""} ${service.name} ${service.description ?? ""}`,
  );

  if (/(prevent|pmoc)/.test(hay)) return "preventivo";
  if (/(corret|reparo|conserto)/.test(hay)) return "corretivo";
  if (/instal/.test(hay)) return "instalacao";
  if (/(higien|limpeza|evapor)/.test(hay)) return "higienizacao";
  if (/(inspec|diagnost|laudo)/.test(hay)) return "inspecao";
  return "outros";
}

export function inferServiceTypeLabel(service: ServiceOut): string {
  const key = inferServiceType(service);
  return SERVICE_TYPE_OPTIONS.find((option) => option.value === key)?.label ?? "Outros";
}

export function formatCategoryLabel(rawCategory: string | null | undefined): string {
  const raw = rawCategory?.trim();
  if (!raw) return "Sem categoria";
  return raw
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function parseServiceCategories(service: ServiceOut): string[] {
  const raw = service.service_category?.trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function getServiceCategoryLabel(service: ServiceOut): string {
  const categories = parseServiceCategories(service);
  if (categories.length === 0) return "Sem categoria";
  return formatCategoryLabel(categories[0]);
}

export type CategoryTone = "blue" | "green" | "orange" | "yellow" | "purple" | "gray";

export function getCategoryTone(categoryLabel: string): CategoryTone {
  const hay = normalizeText(categoryLabel);
  if (/(limpeza|higien)/.test(hay)) return "blue";
  if (/(manutenc|prevent)/.test(hay)) return "green";
  if (/(refrig|gas|carga)/.test(hay)) return "orange";
  if (/(diagnost|inspec|laudo)/.test(hay)) return "yellow";
  if (/(instal)/.test(hay)) return "purple";
  return "gray";
}

export type TypeTone = "green" | "red" | "blue" | "purple" | "orange" | "gray";

export function getTypeTone(typeKey: ServiceTypeKey): TypeTone {
  switch (typeKey) {
    case "preventivo":
      return "green";
    case "corretivo":
      return "red";
    case "instalacao":
      return "blue";
    case "higienizacao":
      return "blue";
    case "inspecao":
      return "orange";
    default:
      return "gray";
  }
}

export type ServiceIconTone = "blue" | "green" | "orange" | "yellow" | "purple";

export function getServiceIconTone(service: ServiceOut): ServiceIconTone {
  const hay = normalizeText(
    `${service.service_category ?? ""} ${service.name} ${service.description ?? ""}`,
  );
  if (/(limpeza|higien|evapor)/.test(hay)) return "blue";
  if (/(manutenc|prevent|pmoc)/.test(hay)) return "green";
  if (/(refrig|gas|carga|term)/.test(hay)) return "orange";
  if (/(diagnost|inspec|laudo)/.test(hay)) return "yellow";
  if (/(instal)/.test(hay)) return "purple";
  return "blue";
}

export function collectServiceCategories(services: ServiceOut[]): string[] {
  const set = new Set<string>();
  for (const service of services) {
    const raw = service.service_category?.trim();
    if (raw) set.add(raw);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export function filterServices(
  services: ServiceOut[],
  opts: {
    q: string;
    category: string;
    type: ServiceTypeFilter;
    status: ServiceStatusFilter;
  },
): ServiceOut[] {
  const query = normalizeText(opts.q.trim());
  return services.filter((service) => {
    if (opts.category !== "all") {
      const cat = service.service_category?.trim() || "";
      if (cat !== opts.category) return false;
    }
    if (opts.type !== "all" && inferServiceType(service) !== opts.type) return false;
    if (opts.status === "active" && !service.is_active) return false;
    if (opts.status === "inactive" && service.is_active) return false;
    if (query && !getServiceSearchBlob(service).includes(query)) return false;
    return true;
  });
}

export function csvEscape(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildServicesCsv(services: ServiceOut[]): string {
  const header = ["nome", "descricao", "categoria", "tipo", "valor", "status", "duracao_minutos"].join(",");
  const lines = services.map((service) =>
    [
      csvEscape(service.name),
      csvEscape(service.description ?? ""),
      csvEscape(getServiceCategoryLabel(service)),
      csvEscape(inferServiceTypeLabel(service)),
      String(Number(service.price || 0).toFixed(2)).replace(".", ","),
      service.is_active ? "Ativo" : "Inativo",
      String(Number(service.duration_minutes || 0)),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export function isLikelyLinkedDeleteError(message: string): boolean {
  const hay = normalizeText(message);
  return /(vincul|foreign|constraint|integrity|referenc|ordem|pmoc|contrato|historico|em uso|cannot delete)/.test(
    hay,
  );
}
