import type { CategoryFieldDefinition } from "./categoryFieldDefinitions";
import type { EquipmentLabelExtractionOut } from "../api/equipmentCatalogAi";

export function isAirConditioningCategory(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("ar-condicionado") || n.includes("ar condicionado") || n.includes("split");
}

/** Grupos visuais das especificações técnicas no formulário do catálogo. */
export type AcSpecGroupId =
  | "geral"
  | "eletrica"
  | "tubulacao"
  | "dimensoes"
  | "desempenho"
  | "instalacao";

export const AC_SPEC_GROUP_LABELS: Record<AcSpecGroupId, { title: string; hint: string }> = {
  geral: {
    title: "Dados gerais",
    hint: "Capacidade, fluido, tensão e classificação do aparelho.",
  },
  eletrica: {
    title: "Elétrica",
    hint: "Alimentação, corrente, disjuntor e cabos — dados do manual para o técnico em campo.",
  },
  tubulacao: {
    title: "Tubulação e refrigerante",
    hint: "Diâmetros, comprimentos, desnível, carga de gás e torques de conexão.",
  },
  dimensoes: {
    title: "Dimensões e peso",
    hint: "Medidas e massas das unidades interna/externa.",
  },
  desempenho: {
    title: "Desempenho",
    hint: "Ruído, vazão de ar e proteção.",
  },
  instalacao: {
    title: "Instalação",
    hint: "Distâncias mínimas, drenagem, vácuo e parâmetros de serviço.",
  },
};

export const AC_SPEC_GROUP_ORDER: AcSpecGroupId[] = [
  "geral",
  "eletrica",
  "tubulacao",
  "dimensoes",
  "desempenho",
  "instalacao",
];

type AcFieldDef = CategoryFieldDefinition & { group: AcSpecGroupId };

function textField(
  key: string,
  name: string,
  group: AcSpecGroupId,
  unit: string | null = null,
  required = false,
): AcFieldDef {
  return { key, name, type: "text", unit, required, is_active: true, options: [], group };
}

function selectField(
  key: string,
  name: string,
  group: AcSpecGroupId,
  options: string[],
  required = false,
): AcFieldDef {
  return { key, name, type: "select", unit: null, required, is_active: true, options, group };
}

/**
 * Campos técnicos padrão de ar-condicionado (além dos legados capacity/fluid/voltage
 * que vêm da categoria). Inclui elétrica, tubulação e demais dados típicos de manual.
 */
export const AC_EXTRA_FIELD_DEFINITIONS: AcFieldDef[] = [
  // ——— Geral ———
  textField("modelo_do_equipamento", "Modelo do equipamento", "geral"),
  selectField("tipo_equipamento", "Tipo de equipamento", "geral", [
    "Hi-Wall",
    "Piso Teto",
    "Cassete",
    "Duto",
    "Janela",
    "Chiller",
    "VRF",
    "Outro",
  ]),
  selectField("tecnologia", "Tecnologia", "geral", ["Inverter", "On-Off"]),
  textField("cor", "Cor", "geral"),

  // ——— Elétrica ———
  textField("corrente_nominal_a", "Corrente nominal", "eletrica", "A"),
  textField("potencia_nominal_w", "Potência nominal", "eletrica", "W"),
  textField("potencia_kw", "Potência", "eletrica", "kW"),
  textField("disjuntor_recomendado_a", "Disjuntor recomendado", "eletrica", "A"),
  textField("bitola_minima_mm2", "Bitola mínima do cabo", "eletrica", "mm²"),
  textField("cabo_alimentacao", "Cabo de alimentação", "eletrica"),
  textField("cabo_interligacao", "Cabo de interligação", "eletrica"),
  textField("cabo_comunicacao", "Cabo de comunicação", "eletrica"),
  textField("tipo_cabo_alimentacao", "Tipo do cabo de alimentação", "eletrica"),
  textField("comprimento_maximo_cabos_m", "Comprimento máximo dos cabos", "eletrica", "m"),

  // ——— Tubulação / refrigerante ———
  textField("diametro_tubo_liquido", "Diâmetro tubo líquido", "tubulacao"),
  textField("diametro_tubo_gas", "Diâmetro tubo gás (sucção)", "tubulacao"),
  textField("tipo_tubo_refrigerante", "Tipo de tubo refrigerante", "tubulacao"),
  textField("comprimento_maximo_tubulacao_m", "Comprimento máximo de tubulação", "tubulacao", "m"),
  textField("comprimento_minimo_tubo_m", "Comprimento mínimo de tubulação", "tubulacao", "m"),
  textField("altura_maxima_desnivel_m", "Desnível máximo entre unidades", "tubulacao", "m"),
  textField("carga_refrigerante_fabrica_kg", "Carga de refrigerante de fábrica", "tubulacao", "kg"),
  textField("adicao_carga_gas_por_metro", "Carga adicional de gás por metro", "tubulacao"),
  textField("isolamento_termico_minimo_mm", "Isolamento térmico mínimo", "tubulacao", "mm"),
  textField("raio_curvatura_minimo_mm", "Raio de curvatura mínimo", "tubulacao", "mm"),
  textField("torque_liquido_nm", "Torque conexão líquido", "tubulacao", "N·m"),
  textField("torque_gas_nm", "Torque conexão gás", "tubulacao", "N·m"),
  textField("pressao_teste_estanqueidade_psi", "Pressão teste de estanqueidade", "tubulacao", "psi"),
  textField("vacuo_especificado_umhg", "Vácuo especificado", "tubulacao", "µmHg"),
  textField("superaquecimento_ideal_celsius", "Superaquecimento ideal", "tubulacao", "°C"),

  // ——— Dimensões / peso ———
  textField("dimensoes_interna_mm", "Dimensões evaporadora (L×A×P)", "dimensoes", "mm"),
  textField("dimensoes_externa_mm", "Dimensões condensadora (L×A×P)", "dimensoes", "mm"),
  textField("dimensoes_painel_mm", "Dimensões do painel", "dimensoes", "mm"),
  textField("peso_interna_kg", "Peso líquido evaporadora", "dimensoes", "kg"),
  textField("peso_externa_kg", "Peso líquido condensadora", "dimensoes", "kg"),
  textField("peso_painel_kg", "Peso do painel", "dimensoes", "kg"),

  // ——— Desempenho ———
  textField("volume_ventilacao_m3_h", "Vazão de ar", "desempenho", "m³/h"),
  textField("nivel_ruido_evaporadora_db", "Nível de ruído evaporadora", "desempenho", "dB"),
  textField("nivel_ruido_condensadora_db", "Nível de ruído condensadora", "desempenho", "dB"),
  textField("grau_protecao_ip", "Grau de proteção (IP)", "desempenho"),
  textField("pressao_estatica", "Pressão estática", "desempenho"),

  // ——— Instalação ———
  textField("altura_instalacao_minima_m", "Altura mínima de instalação", "instalacao", "m"),
  textField("distancia_minima_parede_mm", "Distância mínima da parede", "instalacao", "mm"),
  textField("distancia_minima_teto_mm", "Distância mínima do teto", "instalacao", "mm"),
  textField("distancia_minima_entre_unidades_internas_m", "Distância mín. entre unidades internas", "instalacao", "m"),
  textField("diametro_furo_parede_mm", "Diâmetro do furo na parede", "instalacao", "mm"),
  textField("comprimento_maximo_mangueira_drenagem_m", "Comprimento máx. mangueira de drenagem", "instalacao", "m"),
  textField("altura_maxima_drenagem_para_cima_mm", "Altura máx. drenagem para cima", "instalacao", "mm"),
  textField("intervalo_suporte_drenagem_m", "Intervalo entre suportes de drenagem", "instalacao", "m"),
  textField("alcance_controle_remoto_m", "Alcance do controle remoto", "instalacao", "m"),
  textField("intervalo_limpeza_filtro_horas", "Intervalo de limpeza do filtro", "instalacao", "h"),
  textField("tipo_instalacao", "Tipo de instalação", "instalacao"),
];

/** Mapeia chaves alternativas geradas pela IA / web enrichment para a chave canônica do formulário. */
export const AC_TECHNICAL_KEY_ALIASES: Record<string, string> = {
  // Elétrica
  disjuntor_recomendado_A: "disjuntor_recomendado_a",
  cabo_alimentacao_minimo: "cabo_alimentacao",
  cabo_alimentacao_externa_interna: "cabo_alimentacao",
  cabo_alimentacao_unidade_externa: "cabo_alimentacao",
  cabo_conexao_alimentacao_mm2: "cabo_alimentacao",
  cabo_conexao_alimentacao: "cabo_alimentacao",
  bitola_cabo_alimentacao: "cabo_alimentacao",
  bitola_cabo_alimentacao_mm2: "cabo_alimentacao",
  cabo_interligacao_minimo: "cabo_interligacao",
  cabo_conexao_interna_externa_mm2: "cabo_interligacao",
  cabo_conexao_interna_externa: "cabo_interligacao",
  cabo_interligacao_interna_externa: "cabo_interligacao",
  bitola_cabo_interligacao: "cabo_interligacao",
  bitola_cabo_interligacao_mm2: "cabo_interligacao",
  bitola_minima_cabo_mm2: "bitola_minima_mm2",
  secao_minima_cabo_mm2: "bitola_minima_mm2",
  corrente_nominal: "corrente_nominal_a",
  corrente_maxima_a: "corrente_nominal_a",
  corrente_operacao_a: "corrente_nominal_a",
  potencia_eletrica_w: "potencia_nominal_w",
  potencia_consumida_w: "potencia_nominal_w",
  potencia_entrada_w: "potencia_nominal_w",
  potencia_entrada_kw: "potencia_kw",
  disjuntor_a: "disjuntor_recomendado_a",
  disjuntor_minimo_a: "disjuntor_recomendado_a",
  comprimento_maximo_cabo_alimentacao_m: "comprimento_maximo_cabos_m",
  comprimento_maximo_cabo_comunicacao_m: "comprimento_maximo_cabos_m",
  // alimentacao costuma ser a descrição completa da rede (fase/tensão/freq)
  alimentacao: "voltage",

  // Tubulação
  diametro_linha_liquido_mm: "diametro_tubo_liquido",
  diametro_linha_succao_mm: "diametro_tubo_gas",
  diametro_tubo_gas_succao_mm: "diametro_tubo_gas",
  diametro_tubo_gas_descarga_mm: "diametro_tubo_gas",
  diametro_tubulacao_liquido: "diametro_tubo_liquido",
  diametro_tubulacao_gas: "diametro_tubo_gas",
  diametro_liquido: "diametro_tubo_liquido",
  diametro_gas: "diametro_tubo_gas",
  comprimento_maximo_tubo_m: "comprimento_maximo_tubulacao_m",
  maxima_distancia_unidades: "comprimento_maximo_tubulacao_m",
  distancia_maxima_tubulacao_m: "comprimento_maximo_tubulacao_m",
  comprimento_tubo_carga_padrao: "comprimento_minimo_tubo_m",
  desnivel_maximo_m: "altura_maxima_desnivel_m",
  altura_maxima_tubo_m: "altura_maxima_desnivel_m",
  maxima_altura_entre_unidades: "altura_maxima_desnivel_m",
  desnivel_maximo_entre_unidades_m: "altura_maxima_desnivel_m",
  carga_refrigerante_g: "carga_refrigerante_fabrica_kg",
  carga_frabrica_m: "carga_refrigerante_fabrica_kg",
  carga_de_gas_fabrica: "carga_refrigerante_fabrica_kg",
  carga_gas_fabrica_kg: "carga_refrigerante_fabrica_kg",
  adicao_carga_gas_por_metro_acima_5m: "adicao_carga_gas_por_metro",
  carga_adicional_por_metro_g: "adicao_carga_gas_por_metro",
  carga_adicional_refrigerante_por_metro_g: "adicao_carga_gas_por_metro",
  raio_curvatura_minimo_tubo_mm: "raio_curvatura_minimo_mm",
  torque_conexao: "torque_liquido_nm",

  // Dimensões
  dimensao_evaporadora_mm: "dimensoes_interna_mm",
  dimensao_condensadora_mm: "dimensoes_externa_mm",
  dimensoes_unidade_interna_mm: "dimensoes_interna_mm",
  dimensoes_unidade_externa_mm: "dimensoes_externa_mm",
  peso_liquido_evaporadora_kg: "peso_interna_kg",
  peso_liquido_condensadora_kg: "peso_externa_kg",
  peso_unidade_interna_kg: "peso_interna_kg",
  peso_unidade_externa_kg: "peso_externa_kg",

  // Instalação (ordem das palavras muda bastante entre manuais)
  altura_minima_instalacao_m: "altura_instalacao_minima_m",
  altura_minima_de_instalacao_m: "altura_instalacao_minima_m",
  altura_minima_teto_mm: "distancia_minima_teto_mm",
  espaco_minimo_obstrucao_superior_mm: "distancia_minima_teto_mm",
  espaco_minimo_obstrucao_lateral_mm: "distancia_minima_parede_mm",
  distancia_minima_lateral_mm: "distancia_minima_parede_mm",
  espaco_minimo_parede_protecao_mm: "distancia_minima_parede_mm",
  distancia_minima_unidade_externa_parede_mm: "distancia_minima_parede_mm",
  diametro_orificio_parede_mm: "diametro_furo_parede_mm",

  // Classificação / geral
  modelo_comercial_completo: "modelo_do_equipamento",
  frequencia: "tecnologia",
  tipo_frequencia: "tecnologia",
  modo_operacao: "tecnologia",
};

const AC_FIELD_GROUP_BY_KEY: Record<string, AcSpecGroupId> = Object.fromEntries(
  AC_EXTRA_FIELD_DEFINITIONS.map((d) => [d.key, d.group]),
) as Record<string, AcSpecGroupId>;

/** Campos legados da categoria também entram em "geral". */
AC_FIELD_GROUP_BY_KEY.capacity = "geral";
AC_FIELD_GROUP_BY_KEY.fluid_type = "geral";
AC_FIELD_GROUP_BY_KEY.voltage = "geral";

export function getAcFieldGroup(key: string): AcSpecGroupId | null {
  return AC_FIELD_GROUP_BY_KEY[key] ?? null;
}

export function mergeAcFieldDefinitions(definitions: CategoryFieldDefinition[]): CategoryFieldDefinition[] {
  const byKey = new Map<string, CategoryFieldDefinition>();
  for (const def of definitions) {
    byKey.set(def.key, def);
  }
  for (const extra of AC_EXTRA_FIELD_DEFINITIONS) {
    if (!byKey.has(extra.key)) {
      const { group: _group, ...rest } = extra;
      byKey.set(extra.key, rest);
    }
  }
  return Array.from(byKey.values());
}

const CANONICAL_AC_KEYS = new Set<string>([
  "capacity",
  "fluid_type",
  "voltage",
  ...AC_EXTRA_FIELD_DEFINITIONS.map((d) => d.key),
]);

type SemanticRule = {
  canonical: string;
  /** Retorna true se a chave “livre” da IA corresponde a este campo canônico. */
  match: (key: string) => boolean;
  /** Ajuste opcional do valor (ex.: ON-OFF → On-Off). */
  transform?: (value: string) => string;
};

function tokensOf(key: string): Set<string> {
  return new Set(
    key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function normalizeTecnologiaValue(raw: string): string {
  const v = raw.trim();
  const lower = v.toLowerCase().replace(/\s+/g, "");
  if (lower.includes("inverter") || lower === "inv") return "Inverter";
  if (
    lower.includes("on-off") ||
    lower.includes("onoff") ||
    lower.includes("on/off") ||
    lower === "fix" ||
    lower.includes("convencional")
  ) {
    return "On-Off";
  }
  return v;
}

function inferTipoEquipamento(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes("hi-wall") || lower.includes("hiwall") || lower.includes("high wall")) return "Hi-Wall";
  if (lower.includes("piso") && lower.includes("teto")) return "Piso Teto";
  if (lower.includes("cassete")) return "Cassete";
  if (lower.includes("duto")) return "Duto";
  if (lower.includes("janela")) return "Janela";
  if (lower.includes("chiller")) return "Chiller";
  if (lower.includes("vrf") || lower.includes("multi")) return "VRF";
  return null;
}

/**
 * Regras semânticas para chaves que a IA inventa com palavras na ordem errada
 * (ex: altura_minima_instalacao_m ↔ altura_instalacao_minima_m).
 */
const AC_SEMANTIC_RULES: SemanticRule[] = [
  {
    canonical: "cabo_alimentacao",
    match: (k) => k.includes("cabo") && (k.includes("aliment") || k.includes("power")),
  },
  {
    canonical: "cabo_interligacao",
    match: (k) =>
      k.includes("cabo") &&
      (k.includes("interlig") ||
        k.includes("interna_externa") ||
        k.includes("conexao_interna") ||
        (k.includes("conexao") && k.includes("externa"))),
  },
  {
    canonical: "cabo_comunicacao",
    match: (k) => k.includes("cabo") && (k.includes("comunic") || k.includes("sinal")),
  },
  {
    canonical: "bitola_minima_mm2",
    match: (k) =>
      (k.includes("bitola") || k.includes("secao")) &&
      (k.includes("cabo") || k.includes("mm2") || k.includes("mm_2")),
  },
  {
    canonical: "corrente_nominal_a",
    match: (k) => k.includes("corrente") && (k.includes("nominal") || k.includes("operacao") || k.endsWith("_a")),
  },
  {
    canonical: "disjuntor_recomendado_a",
    match: (k) => k.includes("disjuntor"),
  },
  {
    canonical: "potencia_nominal_w",
    match: (k) => k.includes("potencia") && (k.includes("_w") || k.includes("watt")) && !k.includes("kw"),
  },
  {
    canonical: "potencia_kw",
    match: (k) => k.includes("potencia") && k.includes("kw"),
  },
  {
    canonical: "diametro_tubo_liquido",
    match: (k) =>
      (k.includes("diametro") || k.includes("bitola")) &&
      (k.includes("liquido") || k.includes("liquid")),
  },
  {
    canonical: "diametro_tubo_gas",
    match: (k) =>
      (k.includes("diametro") || k.includes("bitola")) &&
      (k.includes("gas") || k.includes("succao") || k.includes("vapor")),
  },
  {
    canonical: "comprimento_maximo_tubulacao_m",
    match: (k) =>
      (k.includes("comprimento") || k.includes("distancia")) &&
      (k.includes("tubo") || k.includes("tubul")) &&
      (k.includes("max") || k.includes("maximo")),
  },
  {
    canonical: "altura_maxima_desnivel_m",
    match: (k) =>
      (k.includes("desnivel") || k.includes("altura")) &&
      (k.includes("max") || k.includes("maximo")) &&
      (k.includes("unidade") || k.includes("tubo") || k.includes("desnivel")),
  },
  {
    canonical: "carga_refrigerante_fabrica_kg",
    match: (k) =>
      (k.includes("carga") || k.includes("carga_gas") || k.includes("refrigerante")) &&
      (k.includes("fabrica") || k.includes("factory") || k.includes("carga_refrigerante")),
  },
  {
    canonical: "adicao_carga_gas_por_metro",
    match: (k) =>
      (k.includes("carga") || k.includes("gas") || k.includes("refrigerante")) &&
      (k.includes("metro") || k.includes("adicion") || k.includes("extra")),
  },
  {
    canonical: "altura_instalacao_minima_m",
    match: (k) => k.includes("altura") && k.includes("instal") && (k.includes("min") || k.includes("minima")),
  },
  {
    canonical: "distancia_minima_parede_mm",
    match: (k) =>
      ((k.includes("distancia") || k.includes("espaco")) &&
        (k.includes("parede") || k.includes("lateral") || k.includes("obstrucao_lateral")) &&
        !k.includes("_cm")) ||
      (k.includes("obstrucao") && k.includes("lateral") && !k.includes("_cm")),
  },
  {
    canonical: "distancia_minima_teto_mm",
    match: (k) =>
      ((k.includes("distancia") || k.includes("espaco") || k.includes("altura")) &&
        (k.includes("teto") || k.includes("superior") || k.includes("obstrucao_superior")) &&
        !k.includes("_cm")) ||
      (k.includes("obstrucao") && k.includes("superior") && !k.includes("_cm")),
  },
  {
    canonical: "diametro_furo_parede_mm",
    match: (k) =>
      (k.includes("furo") || k.includes("orificio")) && (k.includes("parede") || k.includes("diametro")),
  },
  {
    canonical: "dimensoes_interna_mm",
    match: (k) =>
      (k.includes("dimens") || k.includes("medida")) &&
      (k.includes("interna") || k.includes("evapor")),
  },
  {
    canonical: "dimensoes_externa_mm",
    match: (k) =>
      (k.includes("dimens") || k.includes("medida")) &&
      (k.includes("externa") || k.includes("condens")),
  },
  {
    canonical: "peso_interna_kg",
    match: (k) => k.includes("peso") && (k.includes("interna") || k.includes("evapor")),
  },
  {
    canonical: "peso_externa_kg",
    match: (k) => k.includes("peso") && (k.includes("externa") || k.includes("condens")),
  },
  {
    canonical: "nivel_ruido_evaporadora_db",
    match: (k) =>
      (k.includes("ruido") || k.includes("ruído") || k.includes("db") || k.includes("som")) &&
      (k.includes("evapor") || k.includes("interna")),
  },
  {
    canonical: "nivel_ruido_condensadora_db",
    match: (k) =>
      (k.includes("ruido") || k.includes("db") || k.includes("som")) &&
      (k.includes("condens") || k.includes("externa")),
  },
  {
    canonical: "volume_ventilacao_m3_h",
    match: (k) => k.includes("vazao") || k.includes("ventilacao") || k.includes("fluxo_ar"),
  },
  {
    canonical: "tecnologia",
    match: (k) => k === "frequencia" || k.includes("tipo_frequencia") || k === "modo_operacao",
    transform: normalizeTecnologiaValue,
  },
];

function applyAliasMapping(next: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(AC_TECHNICAL_KEY_ALIASES)) {
    if (!(alias in next)) continue;
    const aliasValue = (next[alias] ?? "").trim();
    if (!aliasValue) {
      delete next[alias];
      continue;
    }
    const canonicalValue = (next[canonical] ?? "").trim();
    const value =
      canonical === "tecnologia" ? normalizeTecnologiaValue(aliasValue) : aliasValue;
    // voltage já preenchido de forma curta (ex: 220V) — alimentacao completa não sobrescreve
    if (alias === "alimentacao" && canonical === "voltage" && canonicalValue) {
      continue;
    }
    if (!canonicalValue) {
      next[canonical] = value;
    }
    if ((next[canonical] ?? "").trim()) {
      delete next[alias];
    }
  }
}

function applySemanticRules(next: Record<string, string>): void {
  const keys = Object.keys(next);
  for (const key of keys) {
    if (CANONICAL_AC_KEYS.has(key)) continue;
    const value = (next[key] ?? "").trim();
    if (!value) {
      delete next[key];
      continue;
    }
    const keyNorm = key.toLowerCase();
    for (const rule of AC_SEMANTIC_RULES) {
      if (!rule.match(keyNorm)) continue;
      const current = (next[rule.canonical] ?? "").trim();
      if (!current) {
        next[rule.canonical] = rule.transform ? rule.transform(value) : value;
      }
      if ((next[rule.canonical] ?? "").trim()) {
        delete next[key];
      }
      break;
    }
  }
}

function applyInferredSelects(next: Record<string, string>): void {
  if (!(next.tecnologia ?? "").trim() && (next.frequencia ?? "").trim()) {
    next.tecnologia = normalizeTecnologiaValue(next.frequencia);
    delete next.frequencia;
  } else if ((next.tecnologia ?? "").trim()) {
    next.tecnologia = normalizeTecnologiaValue(next.tecnologia);
  }

  if (!(next.tipo_equipamento ?? "").trim()) {
    const fromInstall = inferTipoEquipamento(next.tipo_instalacao ?? "");
    if (fromInstall) next.tipo_equipamento = fromInstall;
  }

  // Se voltage vazio e alimentacao ainda existir como extra
  if (!(next.voltage ?? "").trim() && (next.alimentacao ?? "").trim()) {
    next.voltage = next.alimentacao;
    delete next.alimentacao;
  }
}

/** Torque por diâmetro de flange (manuais listam 6.35 / 9.52 / 12.70 / 15.88). */
function applyTorqueFlangeMapping(next: Record<string, string>): void {
  for (const key of Object.keys(next)) {
    const k = key.toLowerCase().replace(/\./g, "_");
    if (!k.includes("torque")) continue;
    const value = (next[key] ?? "").trim();
    if (!value) continue;

    const isLiquid =
      k.includes("6_35") ||
      k.includes("635") ||
      k.includes("1_4") ||
      k.includes("1/4") ||
      /\b6[\s._-]?35\b/.test(k);
    const isGas =
      k.includes("9_52") ||
      k.includes("952") ||
      k.includes("3_8") ||
      k.includes("3/8") ||
      /\b9[\s._-]?52\b/.test(k);

    if (isLiquid) {
      if (!(next.torque_liquido_nm ?? "").trim()) next.torque_liquido_nm = value;
      if (!(next.diametro_tubo_liquido ?? "").trim()) next.diametro_tubo_liquido = "6.35 mm";
      if (key !== "torque_liquido_nm" && (next.torque_liquido_nm ?? "").trim()) delete next[key];
      continue;
    }
    if (isGas) {
      if (!(next.torque_gas_nm ?? "").trim()) next.torque_gas_nm = value;
      if (!(next.diametro_tubo_gas ?? "").trim()) next.diametro_tubo_gas = "9.52 mm";
      if (key !== "torque_gas_nm" && (next.torque_gas_nm ?? "").trim()) delete next[key];
    }
  }
}

/**
 * "3V X 1,5 mm², H07RN-F" → bitola 1,5 + tipo H07RN-F.
 * Cabo de alimentação descreve vias/bitola/norma; o campo Bitola é a seção de cada fio.
 */
function applyCableDerivedFields(next: Record<string, string>): void {
  const cabo = (next.cabo_alimentacao ?? "").trim();
  if (!cabo) return;

  if (!(next.bitola_minima_mm2 ?? "").trim()) {
    const bitolaMatch = cabo.match(/(\d+[.,]\d+|\d+)\s*mm/i);
    if (bitolaMatch) {
      next.bitola_minima_mm2 = bitolaMatch[1].replace(",", ".");
    }
  }

  if (!(next.tipo_cabo_alimentacao ?? "").trim()) {
    const tipoMatch = cabo.match(/\b(H0\d[A-Z]{2}-[A-Z]|HO\d[A-Z]{2}-[A-Z]|PP)\b/i);
    if (tipoMatch) {
      next.tipo_cabo_alimentacao = tipoMatch[1].toUpperCase().startsWith("PP")
        ? "PP"
        : tipoMatch[1].toUpperCase();
    } else if (/\bpp\b/i.test(cabo) || /\b3\s*vias?\b/i.test(cabo) || /\b3v\b/i.test(cabo)) {
      next.tipo_cabo_alimentacao = "PP";
    }
  }
}

function collectContextText(next: Record<string, string>): string {
  return Object.values(next).join(" ").toLowerCase();
}

function inferTipoFromModelAndContext(next: Record<string, string>): void {
  if ((next.tipo_equipamento ?? "").trim()) return;

  const modelo = (
    next.modelo_do_equipamento ||
    next.modelo ||
    ""
  ).toLowerCase();
  const ctx = collectContextText(next);

  if (
    inferTipoEquipamento(ctx) ||
    /\bhi[-\s]?wall\b/.test(ctx) ||
    /\bhigh\s*wall\b/.test(ctx)
  ) {
    const inferred = inferTipoEquipamento(ctx);
    if (inferred) {
      next.tipo_equipamento = inferred;
      return;
    }
  }

  // Split residencial de parede: Samsung AR##, LG S4/US, Gree GWH/GWC, Philco PAC…
  if (
    /^ar\d{2}[a-z]/i.test(modelo) ||
    /^gwh\d/i.test(modelo) ||
    /^gwc\d/i.test(modelo) ||
    /^pac\d/i.test(modelo) ||
    ((next.diametro_tubo_liquido || next.diametro_tubo_gas) &&
      /\bbtu\b/i.test(next.capacity || ""))
  ) {
    next.tipo_equipamento = "Hi-Wall";
  }
}

function inferTecnologiaFromModelAndContext(next: Record<string, string>): void {
  if ((next.tecnologia ?? "").trim()) return;

  const modelo = (next.modelo_do_equipamento || next.modelo || "").toUpperCase();
  const ctx = collectContextText(next);

  if (
    /\binverter\b/.test(ctx) ||
    /\bwind[\s-]?free\b/.test(ctx) ||
    /\bdigital\s*inverter\b/.test(ctx) ||
    /\binv\b/.test(ctx)
  ) {
    next.tecnologia = "Inverter";
    return;
  }
  if (/\bon[-\s/]?off\b/.test(ctx) || /\bconvencional\b/.test(ctx) || /\bfixed[\s-]?speed\b/.test(ctx)) {
    next.tecnologia = "On-Off";
    return;
  }

  // Nomenclatura Samsung residencial: AR## + letra de linha (T/C/V/X/H) costuma ser Inverter.
  if (/^AR\d{2}[TCVXH]/i.test(modelo)) {
    next.tecnologia = "Inverter";
    return;
  }
  // Philco PAC…I… / IQ… → Inverter; sem I após capacidade tende a On-Off
  if (/^PAC\d+I/i.test(modelo) || /IQ/i.test(modelo)) {
    next.tecnologia = "Inverter";
  }
}

/**
 * Fallback por sobreposição de tokens: só quando ainda sobrou chave livre e o
 * canônico está vazio. Exige pelo menos 2 tokens em comum e boa cobertura.
 */
function applyTokenOverlapFallback(next: Record<string, string>): void {
  const freeKeys = Object.keys(next).filter((k) => !CANONICAL_AC_KEYS.has(k));
  if (!freeKeys.length) return;

  for (const freeKey of freeKeys) {
    const value = (next[freeKey] ?? "").trim();
    if (!value) {
      delete next[freeKey];
      continue;
    }
    const freeTokens = tokensOf(freeKey);
    if (freeTokens.size < 2) continue;

    let bestKey: string | null = null;
    let bestScore = 0;
    for (const canonical of CANONICAL_AC_KEYS) {
      if ((next[canonical] ?? "").trim()) continue;
      const canonTokens = tokensOf(canonical);
      let overlap = 0;
      for (const t of freeTokens) {
        if (canonTokens.has(t)) overlap += 1;
      }
      if (overlap < 2) continue;
      const score = overlap / Math.max(freeTokens.size, canonTokens.size);
      if (score > bestScore) {
        bestScore = score;
        bestKey = canonical;
      }
    }
    if (bestKey && bestScore >= 0.45) {
      next[bestKey] = bestKey === "tecnologia" ? normalizeTecnologiaValue(value) : value;
      delete next[freeKey];
    }
  }
}

/**
 * Normaliza chaves de technical_data (aliases / nomes inventados pela IA → canônicas)
 * sem sobrescrever um valor canônico já preenchido.
 */
export function normalizeAcTechnicalData(
  values: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined) continue;
    const text = String(v).trim();
    if (text) next[k] = text;
  }
  applyAliasMapping(next);
  applySemanticRules(next);
  applyTorqueFlangeMapping(next);
  applyCableDerivedFields(next);
  applyInferredSelects(next);
  inferTipoFromModelAndContext(next);
  inferTecnologiaFromModelAndContext(next);
  applyTokenOverlapFallback(next);
  return next;
}

export function mapAiExtractionToTechnicalData(
  extraction: EquipmentLabelExtractionOut,
  current: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  if (extraction.capacidade_btus) next.capacity = extraction.capacidade_btus;
  if (extraction.fluido_refrigerante) next.fluid_type = extraction.fluido_refrigerante;
  if (extraction.tensao) next.voltage = extraction.tensao;
  if (extraction.tipo_equipamento) next.tipo_equipamento = extraction.tipo_equipamento;
  if (extraction.tecnologia) next.tecnologia = extraction.tecnologia;
  return normalizeAcTechnicalData(next);
}

export function mapAiExtractionToFormFields(extraction: EquipmentLabelExtractionOut): {
  marca: string;
  modelEvaporator: string;
  modelCondenser: string;
  technicalData: Record<string, string>;
} {
  return {
    marca: extraction.marca ?? "",
    modelEvaporator: extraction.modelo_evaporadora ?? "",
    modelCondenser: extraction.modelo_condensadora ?? "",
    technicalData: mapAiExtractionToTechnicalData(extraction, {}),
  };
}
