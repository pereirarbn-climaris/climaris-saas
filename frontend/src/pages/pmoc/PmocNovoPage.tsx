import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Bot,
  CalendarDays,
  Camera,
  Check,
  Save,
  CheckCircle2,
  CheckIcon,
  ChevronDown,
  Clock3,
  ClipboardList,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  GraduationCap,
  Info,
  ListChecks,
  Loader2,
  Mail,
  MapPinned,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shield,
  Snowflake,
  Trash2,
  User,
  UserCheck,
  UserCircle2,
  Users,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import {
  listClientHvacEquipments,
  listClientsAll,
  listClientSites,
  type ClientOut,
  type ClientSiteOut,
  type EquipmentOut,
} from "../../api/clients";
import { Button } from "../../components/ui/button";
import { ClientCombobox, type ClientComboboxItem } from "../../components/ui/client-combobox";
import { clientsOutToComboboxItems } from "../../lib/clientComboboxAdapter";
import { formatClientSiteAddressLine } from "../../lib/serviceOrderClientSite";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import ui from "./PmocNovoPage.module.css";

type StepId = 1 | 2 | 3 | 4 | 5 | 6;

type PmocNovoDraft = {
  cliente: string;
  unidadeLocal: string;
  nomePmoc: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  periodicidade: string;
  descricao: string;
  usarEnderecoCliente: boolean;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string;
  tipoAmbiente: string;
  classificacao: string;
  responsavelTecnico: {
    nome: string;
    registro: string;
    uf: string;
    titulo: string;
    art: string;
    dataArt: string;
    email: string;
    telefone: string;
    empresa: string;
    endereco: string;
    anexos: Array<{
      name: string;
      size: number;
      type: string;
      lastModified: number;
    }>;
  };
  pmocAmbientes: Array<{
    id: string;
    nome: string;
    tipo: string;
    area_m2: string;
    pe_direito: string;
    volume: string;
    pessoas_fixas: string;
    pessoas_flutuantes: string;
    total_pessoas: string;
    horario_inicio: string;
    horario_fim: string;
    dias_funcionamento: string[];
    observacoes: string;
    equipamentos: Array<{
      tag: string;
      tipo: string;
      fabricante: string;
      modelo: string;
      capacidade_btu: string;
      fluido: string;
      serie: string;
      data_instalacao: string;
      observacao: string;
    }>;
  }>;
  equipamento_cronograma: Array<{
    equipamento_id: string;
    atividades: Array<{
      id: string;
      nome: string;
      descricao: string;
      tempo_estimado: string;
      ativo: boolean;
      personalizado?: boolean;
      servicos: Array<{
        id: string;
        descricao: string;
        periodicidade: string;
        obrigatorio: boolean;
        exige_foto: boolean;
        ativo: boolean;
        tempo_estimado: string;
        observacao: string;
        personalizado?: boolean;
      }>;
    }>;
  }>;
  pmoc_documentos: Array<{
    id: string;
    nome: string;
    categoria: string;
    tipo: string;
    arquivo_url: string;
    arquivo_nome: string;
    tamanho: number;
    data_upload: string;
    validade: string;
    status: string;
    status_label: string;
    obrigatorio: boolean;
    observacoes: string;
  }>;
  documentos_config: {
    exigirObrigatoriosAntesFinalizar: boolean;
    gerarPdfFinalAutomaticamente: boolean;
    anexarRelatoriosManutencoes: boolean;
    inserirFotosExecucoesRelatorio: boolean;
  };
  pmoc_revisao: {
    validacoes: {
      informacoes: boolean;
      responsavel: boolean;
      ambientes: boolean;
      equipamentos: boolean;
      cronograma: boolean;
      documentos: boolean;
    };
    geracao: {
      incluir_cliente: boolean;
      incluir_responsavel: boolean;
      incluir_equipamentos: boolean;
      incluir_cronograma: boolean;
      incluir_servicos: boolean;
      incluir_fotos: boolean;
      incluir_documentos: boolean;
      formato: "pdf";
      status: "idle" | "generating" | "success" | "error";
      arquivo_pdf: string;
    };
  };
};

type PmocAmbiente = PmocNovoDraft["pmocAmbientes"][number];
type PmocAmbienteEquipamento = PmocAmbiente["equipamentos"][number];
type PmocActivityServiceItem = PmocNovoDraft["equipamento_cronograma"][number]["atividades"][number]["servicos"][number];
type PmocActivityItem = PmocNovoDraft["equipamento_cronograma"][number]["atividades"][number];
type PmocEquipmentScheduleBundle = PmocNovoDraft["equipamento_cronograma"][number];

type DefaultServiceTemplate = {
  descricao: string;
  periodicidade: string;
  obrigatorio: boolean;
  exige_foto: boolean;
};

type DefaultActivityTemplate = {
  nome: string;
  descricao?: string;
  tempo_estimado: string;
  servicos: DefaultServiceTemplate[];
};

const SERVICE_OBSERVACAO_MAX = 300;

type ActivityServiceFormField = "descricao" | "periodicidade" | "obrigatorio" | "exige_foto" | "ativo";

type ScheduleServiceApplyScope = "equipment" | "type" | "pmoc";

type CronogramaVencimentoAviso =
  | "data_exata"
  | "3_dias_antes"
  | "7_dias_antes"
  | "15_dias_antes"
  | "30_dias_antes";

type CronogramaResponsavelPadrao =
  | "equipe_tecnica"
  | "tecnico_responsavel"
  | "eletricista"
  | "terceirizado"
  | "outro";

type CronogramaAplicarEm = "pmoc" | "equipamentos_pmoc" | "pmoc_futuros";

type CronogramaConfiguracoes = {
  dataInicial: string;
  dataFinal: string;
  vencimentoAviso: CronogramaVencimentoAviso;
  responsavelPadrao: CronogramaResponsavelPadrao;
  aplicarServicosPorTipo: boolean;
  gerarAutomaticoEquipamento: boolean;
  permitirEditarServicosPadrao: boolean;
  exigirFotoServicosObrigatorios: boolean;
  periodicidadesAtivas: {
    mensal: boolean;
    bimestral: boolean;
    trimestral: boolean;
    semestral: boolean;
    anual: boolean;
    sobDemanda: boolean;
  };
  evidencias: {
    fotoAntes: boolean;
    fotoDepois: boolean;
    concluirSemFotoQuandoNaoObrigatorio: boolean;
    observacaoObrigatoriaNaoExecutado: boolean;
  };
  aplicarEm: CronogramaAplicarEm;
};

type FlattenedEquipmentRow = {
  id: string;
  ambienteId: string;
  ambienteNome: string;
  equipamento: PmocAmbienteEquipamento;
};

type AmbienteForm = {
  nome: string;
  tipo: string;
  area_m2: string;
  pe_direito: string;
  pessoas_fixas: string;
  pessoas_flutuantes: string;
  horario_inicio: string;
  horario_fim: string;
  dias_funcionamento: string[];
  observacoes: string;
};

type EquipamentoForm = {
  tag: string;
  tipo: string;
  fabricante: string;
  modelo: string;
  capacidade_btu: string;
  fluido: string;
  serie: string;
  data_instalacao: string;
  observacao: string;
};

const PMOC_NOVO_STORAGE_KEY = "climaris.pmoc.novo.draft.v1";
const PMOC_NOVO_STATE_STORAGE_KEY = "climaris.pmoc.novo.state.v1";
const PMOC_CRONOGRAMA_CONFIG_KEY = "climaris.pmoc.novo.cronograma-config.v1";
const PMOC_MATRIX_SITE_VALUE = "__matrix__";
const PMOC_MATRIX_SITE_LABEL = "Matriz (cadastro principal)";

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "Geral" },
  { id: 2, label: "Responsável" },
  { id: 3, label: "Ambientes e Equipamentos" },
  { id: 4, label: "Cronograma" },
  { id: 5, label: "Documentos" },
  { id: 6, label: "Revisão" },
];

const REQUIRED_FIELDS_STEP_ONE: (keyof PmocNovoDraft)[] = [
  "cliente",
  "unidadeLocal",
  "nomePmoc",
  "vigenciaInicio",
  "vigenciaFim",
  "periodicidade",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "estado",
  "tipoAmbiente",
  "classificacao",
];

type ResponsibleField = keyof PmocNovoDraft["responsavelTecnico"];
type AmbienteFormField = keyof AmbienteForm;
type EquipamentoFormField = keyof EquipamentoForm;

const REQUIRED_FIELDS_STEP_TWO: ResponsibleField[] = [
  "nome",
  "registro",
  "uf",
  "titulo",
  "art",
  "dataArt",
  "email",
  "telefone",
];

const UF_OPTIONS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const PROFESSIONAL_TITLES = [
  "Engenheiro Mecânico",
  "Engenheiro Civil",
  "Engenheiro Eletricista",
  "Técnico em Refrigeração",
  "Técnico Mecânico",
  "Outro",
];

const ENVIRONMENT_TYPE_OPTIONS = [
  "Recepção",
  "Escritório",
  "Sala administrativa",
  "Sala reunião",
  "Consultório",
  "Sala hospitalar",
  "Restaurante",
  "Cozinha",
  "Loja",
  "Servidor / TI",
  "Industrial",
  "Outro",
] as const;

const EQUIPMENT_TYPE_OPTIONS = [
  "Split Hi Wall",
  "Cassete",
  "Piso Teto",
  "Duto",
  "VRF",
  "Janela",
  "Self",
  "Chiller",
  "Outro",
] as const;

const EQUIPMENT_BRAND_OPTIONS = ["LG", "Samsung", "Midea", "Daikin", "Fujitsu", "Elgin", "Gree", "Outro"] as const;
const REFRIGERANT_OPTIONS = ["R22", "R410A", "R32", "Outro"] as const;
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const SERVICE_PERIODICITY_OPTIONS = ["Mensal", "Bimestral", "Trimestral", "Semestral", "Anual", "Sob demanda"] as const;

const VENCIMENTO_AVISO_OPTIONS: { value: CronogramaVencimentoAviso; label: string }[] = [
  { value: "data_exata", label: "Data exata" },
  { value: "3_dias_antes", label: "3 dias antes" },
  { value: "7_dias_antes", label: "7 dias antes" },
  { value: "15_dias_antes", label: "15 dias antes" },
  { value: "30_dias_antes", label: "30 dias antes" },
];

const RESPONSAVEL_PADRAO_OPTIONS: { value: CronogramaResponsavelPadrao; label: string }[] = [
  { value: "equipe_tecnica", label: "Equipe técnica" },
  { value: "tecnico_responsavel", label: "Técnico responsável" },
  { value: "eletricista", label: "Eletricista" },
  { value: "terceirizado", label: "Terceirizado" },
  { value: "outro", label: "Outro" },
];

const APLICAR_CONFIG_OPTIONS: { value: CronogramaAplicarEm; label: string }[] = [
  { value: "pmoc", label: "Apenas este PMOC" },
  { value: "equipamentos_pmoc", label: "Todos os equipamentos deste PMOC" },
  { value: "pmoc_futuros", label: "Todos os PMOCs futuros da empresa" },
];

const PERIODICIDADE_CONFIG_ITEMS: {
  key: keyof CronogramaConfiguracoes["periodicidadesAtivas"];
  label: string;
}[] = [
  { key: "mensal", label: "Mensal" },
  { key: "bimestral", label: "Bimestral" },
  { key: "trimestral", label: "Trimestral" },
  { key: "semestral", label: "Semestral" },
  { key: "anual", label: "Anual" },
  { key: "sobDemanda", label: "Sob demanda" },
];

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDateOneYearAfter(isoDate: string): string {
  const base = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : isoDateToday();
  const date = new Date(`${base}T12:00:00`);
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function createDefaultCronogramaConfiguracoes(
  vigenciaInicio = "",
  vigenciaFim = "",
): CronogramaConfiguracoes {
  const dataInicial = vigenciaInicio || isoDateToday();
  const dataFinal = vigenciaFim || isoDateOneYearAfter(dataInicial);
  return {
    dataInicial,
    dataFinal,
    vencimentoAviso: "7_dias_antes",
    responsavelPadrao: "equipe_tecnica",
    aplicarServicosPorTipo: true,
    gerarAutomaticoEquipamento: true,
    permitirEditarServicosPadrao: true,
    exigirFotoServicosObrigatorios: true,
    periodicidadesAtivas: {
      mensal: true,
      bimestral: true,
      trimestral: true,
      semestral: true,
      anual: true,
      sobDemanda: true,
    },
    evidencias: {
      fotoAntes: false,
      fotoDepois: true,
      concluirSemFotoQuandoNaoObrigatorio: true,
      observacaoObrigatoriaNaoExecutado: true,
    },
    aplicarEm: "pmoc",
  };
}

function normalizeCronogramaConfiguracoes(
  raw: Partial<CronogramaConfiguracoes> | null | undefined,
  vigenciaInicio = "",
  vigenciaFim = "",
): CronogramaConfiguracoes {
  const defaults = createDefaultCronogramaConfiguracoes(vigenciaInicio, vigenciaFim);
  if (!raw) return defaults;
  return {
    dataInicial: raw.dataInicial || defaults.dataInicial,
    dataFinal: raw.dataFinal || defaults.dataFinal,
    vencimentoAviso: raw.vencimentoAviso ?? defaults.vencimentoAviso,
    responsavelPadrao: raw.responsavelPadrao ?? defaults.responsavelPadrao,
    aplicarServicosPorTipo: raw.aplicarServicosPorTipo ?? defaults.aplicarServicosPorTipo,
    gerarAutomaticoEquipamento: raw.gerarAutomaticoEquipamento ?? defaults.gerarAutomaticoEquipamento,
    permitirEditarServicosPadrao: raw.permitirEditarServicosPadrao ?? defaults.permitirEditarServicosPadrao,
    exigirFotoServicosObrigatorios: raw.exigirFotoServicosObrigatorios ?? defaults.exigirFotoServicosObrigatorios,
    periodicidadesAtivas: {
      mensal: raw.periodicidadesAtivas?.mensal ?? defaults.periodicidadesAtivas.mensal,
      bimestral: raw.periodicidadesAtivas?.bimestral ?? defaults.periodicidadesAtivas.bimestral,
      trimestral: raw.periodicidadesAtivas?.trimestral ?? defaults.periodicidadesAtivas.trimestral,
      semestral: raw.periodicidadesAtivas?.semestral ?? defaults.periodicidadesAtivas.semestral,
      anual: raw.periodicidadesAtivas?.anual ?? defaults.periodicidadesAtivas.anual,
      sobDemanda: raw.periodicidadesAtivas?.sobDemanda ?? defaults.periodicidadesAtivas.sobDemanda,
    },
    evidencias: {
      fotoAntes: raw.evidencias?.fotoAntes ?? defaults.evidencias.fotoAntes,
      fotoDepois: raw.evidencias?.fotoDepois ?? defaults.evidencias.fotoDepois,
      concluirSemFotoQuandoNaoObrigatorio:
        raw.evidencias?.concluirSemFotoQuandoNaoObrigatorio ?? defaults.evidencias.concluirSemFotoQuandoNaoObrigatorio,
      observacaoObrigatoriaNaoExecutado:
        raw.evidencias?.observacaoObrigatoriaNaoExecutado ?? defaults.evidencias.observacaoObrigatoriaNaoExecutado,
    },
    aplicarEm: raw.aplicarEm ?? defaults.aplicarEm,
  };
}

const PERIODICITY_ORDER: Record<string, number> = {
  Mensal: 1,
  Bimestral: 2,
  Trimestral: 3,
  Semestral: 4,
  Anual: 5,
  "Sob demanda": 6,
};

function svc(
  descricao: string,
  periodicidade: string,
  obrigatorio: boolean,
  exige_foto: boolean,
): DefaultServiceTemplate {
  return { descricao, periodicidade, obrigatorio, exige_foto };
}

const DEFAULT_ACTIVITIES_BY_TYPE: Record<string, DefaultActivityTemplate[]> = {
  split_hi_wall: [
    {
      nome: "Limpeza de filtros",
      descricao: "Manutenção preventiva dos filtros de ar do equipamento.",
      tempo_estimado: "30 a 45 min",
      servicos: [
        svc("Remover filtros de ar", "Mensal", true, true),
        svc("Lavar filtros com água corrente", "Mensal", true, false),
        svc("Secar filtros completamente", "Mensal", true, false),
        svc("Reinstalar filtros", "Mensal", true, true),
        svc("Registrar foto final", "Mensal", true, true),
      ],
    },
    {
      nome: "Higienização da evaporadora",
      descricao: "Limpeza e higienização dos componentes internos da evaporadora.",
      tempo_estimado: "45 a 60 min",
      servicos: [
        svc("Remover tampa frontal", "Trimestral", true, true),
        svc("Aplicar produto bactericida", "Trimestral", true, true),
        svc("Limpar serpentina evaporadora", "Trimestral", true, true),
        svc("Limpar turbina", "Trimestral", true, true),
        svc("Verificar dreno", "Trimestral", true, false),
      ],
    },
    {
      nome: "Inspeção elétrica",
      descricao: "Verificações elétricas de segurança e funcionamento.",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Verificar tensão", "Semestral", true, false),
        svc("Verificar corrente", "Semestral", true, false),
        svc("Apertar terminais", "Semestral", true, true),
        svc("Inspecionar cabos", "Semestral", true, true),
      ],
    },
  ],
  cassete: [
    {
      nome: "Limpeza e higienização",
      tempo_estimado: "30 a 45 min",
      servicos: [
        svc("Higienização dos filtros principais", "Mensal", true, true),
        svc("Limpeza e desinfecção da bandeja de condensado", "Mensal", true, true),
        svc("Inspeção física da grelha e fixações", "Mensal", false, true),
      ],
    },
    {
      nome: "Sistema de dreno",
      tempo_estimado: "30 a 40 min",
      servicos: [
        svc("Limpeza da bomba de dreno e linhas associadas", "Trimestral", true, true),
        svc("Teste de acionamento e vazão da bomba", "Trimestral", true, false),
        svc("Verificação de escoamento e obstruções", "Trimestral", true, false),
      ],
    },
    {
      nome: "Direcionamento de ar",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Checagem do movimento das aletas", "Semestral", false, true),
        svc("Verificação do direcionamento de ar", "Semestral", false, false),
        svc("Ajuste dos direcionadores", "Semestral", false, false),
      ],
    },
    {
      nome: "Inspeção elétrica",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Conferência elétrica geral", "Trimestral", true, false),
        svc("Aperto de terminais", "Trimestral", true, true),
        svc("Teste de funcionamento", "Trimestral", true, false),
      ],
    },
  ],
  piso_teto: [
    {
      nome: "Limpeza de filtros e serpentina",
      tempo_estimado: "35 a 50 min",
      servicos: [
        svc("Higienização dos filtros do equipamento", "Mensal", true, true),
        svc("Limpeza da serpentina com produto adequado", "Trimestral", true, true),
        svc("Registro fotográfico", "Mensal", false, true),
      ],
    },
    {
      nome: "Turbina e ventilador",
      tempo_estimado: "40 a 55 min",
      servicos: [
        svc("Limpeza da turbina para garantir vazão de ar", "Trimestral", true, true),
        svc("Inspeção de balanceamento do ventilador", "Semestral", false, true),
        svc("Verificação de fixação do ventilador", "Semestral", false, true),
      ],
    },
    {
      nome: "Verificação estrutural",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Verificação estrutural dos suportes", "Semestral", false, true),
        svc("Inspeção de fixações e ancoragens", "Semestral", false, true),
      ],
    },
    {
      nome: "Teste operacional",
      tempo_estimado: "15 a 25 min",
      servicos: [
        svc("Teste operacional após manutenção", "Mensal", true, false),
        svc("Leitura de temperatura de insuflamento e retorno", "Mensal", true, false),
        svc("Registro final da atividade", "Mensal", true, true),
      ],
    },
  ],
  vrf: [
    {
      nome: "Comunicação e endereçamento",
      tempo_estimado: "30 a 45 min",
      servicos: [
        svc("Checagem da comunicação entre unidades", "Trimestral", true, false),
        svc("Validação de endereçamento das evaporadoras", "Trimestral", false, false),
        svc("Teste de resposta do sistema", "Trimestral", true, false),
      ],
    },
    {
      nome: "Placas e sensores",
      tempo_estimado: "25 a 40 min",
      servicos: [
        svc("Inspeção visual das placas eletrônicas", "Trimestral", false, true),
        svc("Validação dos sensores de temperatura", "Trimestral", true, false),
        svc("Validação dos sensores de pressão", "Trimestral", true, false),
      ],
    },
    {
      nome: "Circuito frigorífico",
      tempo_estimado: "35 a 50 min",
      servicos: [
        svc("Leitura das pressões do circuito frigorífico", "Trimestral", true, false),
        svc("Inspeção dos componentes da condensadora", "Trimestral", true, true),
        svc("Verificação de vazamentos", "Trimestral", true, true),
      ],
    },
    {
      nome: "Conexões elétricas",
      tempo_estimado: "25 a 35 min",
      servicos: [
        svc("Inspeção de conexões elétricas", "Semestral", true, true),
        svc("Inspeção de conexões frigoríficas", "Semestral", true, true),
        svc("Aperto de terminais", "Semestral", true, true),
      ],
    },
  ],
  default: [
    {
      nome: "Inspeção geral",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Inspeção técnica geral e checklist visual", "Mensal", true, true),
        svc("Registro fotográfico", "Mensal", false, true),
      ],
    },
    {
      nome: "Verificação elétrica",
      tempo_estimado: "20 a 30 min",
      servicos: [
        svc("Conferência de conexões elétricas", "Trimestral", true, false),
        svc("Aperto de terminais", "Trimestral", true, true),
      ],
    },
    {
      nome: "Teste operacional",
      tempo_estimado: "15 a 20 min",
      servicos: [
        svc("Teste operacional com validação final", "Mensal", true, false),
        svc("Registro final da atividade", "Mensal", true, true),
      ],
    },
  ],
};

const REQUIRED_AMBIENTE_FIELDS: AmbienteFormField[] = [
  "nome",
  "tipo",
  "area_m2",
  "pessoas_fixas",
  "pessoas_flutuantes",
];

const REQUIRED_EQUIPAMENTO_FIELDS: EquipamentoFormField[] = [
  "tag",
  "tipo",
  "fabricante",
  "capacidade_btu",
];

const INITIAL_AMBIENTES: PmocNovoDraft["pmocAmbientes"] = [
  {
    id: "amb-1",
    nome: "Recepção",
    tipo: "Escritório",
    area_m2: "45",
    pe_direito: "3",
    volume: "135",
    pessoas_fixas: "5",
    pessoas_flutuantes: "20",
    total_pessoas: "25",
    horario_inicio: "08:00",
    horario_fim: "18:00",
    dias_funcionamento: ["Seg", "Ter", "Qua", "Qui", "Sex"],
    observacoes: "",
    equipamentos: [
      {
        tag: "AC-001",
        tipo: "Split Hi Wall",
        fabricante: "LG",
        modelo: "Dual Inverter Voice",
        capacidade_btu: "24.000",
        fluido: "R410A",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
      {
        tag: "AC-002",
        tipo: "Split Hi Wall",
        fabricante: "Samsung",
        modelo: "WindFree",
        capacidade_btu: "18.000",
        fluido: "R32",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
    ],
  },
  {
    id: "amb-2",
    nome: "Sala de Reunião",
    tipo: "Escritório",
    area_m2: "30",
    pe_direito: "3",
    volume: "90",
    pessoas_fixas: "2",
    pessoas_flutuantes: "15",
    total_pessoas: "17",
    horario_inicio: "08:00",
    horario_fim: "18:00",
    dias_funcionamento: ["Seg", "Ter", "Qua", "Qui", "Sex"],
    observacoes: "",
    equipamentos: [
      {
        tag: "AC-003",
        tipo: "Cassete",
        fabricante: "Midea",
        modelo: "Cassete Inverter",
        capacidade_btu: "36.000",
        fluido: "R410A",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
    ],
  },
  {
    id: "amb-3",
    nome: "Auditório",
    tipo: "Auditório",
    area_m2: "120",
    pe_direito: "4",
    volume: "480",
    pessoas_fixas: "10",
    pessoas_flutuantes: "120",
    total_pessoas: "130",
    horario_inicio: "07:00",
    horario_fim: "22:00",
    dias_funcionamento: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    observacoes: "",
    equipamentos: [
      {
        tag: "AC-004",
        tipo: "Piso Teto",
        fabricante: "Elgin",
        modelo: "Eco Inverter",
        capacidade_btu: "60.000",
        fluido: "R410A",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
      {
        tag: "AC-005",
        tipo: "Split Hi Wall",
        fabricante: "Gree",
        modelo: "G-Top Auto",
        capacidade_btu: "24.000",
        fluido: "R32",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
    ],
  },
];

type PmocDocumento = PmocNovoDraft["pmoc_documentos"][number];
type DocumentosConfig = PmocNovoDraft["documentos_config"];

type DocumentCategoryDef = {
  id: string;
  nome: string;
  descricao: string;
  tone: "blue" | "green" | "purple" | "orange" | "cyan" | "pink" | "slate" | "gray";
  icon: typeof FileText;
  itensEsperados: string[];
};

const DOCUMENT_CATEGORIES: DocumentCategoryDef[] = [
  {
    id: "legais",
    nome: "Documentos legais e contratuais",
    descricao: "Alvarás, contratos e licenças obrigatórias.",
    tone: "blue",
    icon: Shield,
    itensEsperados: [
      "Alvará de funcionamento",
      "Contrato de manutenção",
      "ART",
      "Licenças ambientais",
      "Termos técnicos",
      "Documentos do cliente",
    ],
  },
  {
    id: "tecnica",
    nome: "Documentação técnica dos equipamentos",
    descricao: "Manuais, catálogos e especificações técnicas.",
    tone: "green",
    icon: Wrench,
    itensEsperados: [
      "Manual do fabricante",
      "Catálogo técnico",
      "Datasheet",
      "Diagramas elétricos",
      "Fotos instalação",
      "Garantias",
    ],
  },
  {
    id: "qualidade_ar",
    nome: "Análises e relatórios de qualidade do ar",
    descricao: "Relatórios e laudos de qualidade do ar interior.",
    tone: "purple",
    icon: Wind,
    itensEsperados: [
      "Relatório qualidade do ar",
      "Laudo técnico",
      "Medições realizadas",
      "Análise microbiológica",
      "Certificados",
    ],
  },
  {
    id: "procedimentos",
    nome: "Procedimentos e planos",
    descricao: "Procedimentos operacionais e planos de manutenção.",
    tone: "orange",
    icon: ListChecks,
    itensEsperados: [
      "Plano manutenção",
      "Procedimentos operacionais",
      "Plano emergência",
      "Instruções técnicas",
    ],
  },
  {
    id: "registros",
    nome: "Registros de manutenção e execução",
    descricao: "Ordens de serviço, checklists e registros fotográficos.",
    tone: "cyan",
    icon: ClipboardList,
    itensEsperados: [
      "Ordens de serviço",
      "Checklists",
      "Fotos antes/depois",
      "Histórico técnico",
      "Evidências",
    ],
  },
  {
    id: "treinamentos",
    nome: "Treinamentos e qualificações",
    descricao: "Certificados e treinamentos da equipe técnica.",
    tone: "pink",
    icon: GraduationCap,
    itensEsperados: ["Certificados técnicos", "Treinamentos", "NR10", "NR35", "Capacitações"],
  },
  {
    id: "responsavel",
    nome: "Documentos do responsável técnico",
    descricao: "ART, certificados e documentações do RT.",
    tone: "slate",
    icon: UserCheck,
    itensEsperados: ["CREA/CFT", "ART", "Certificados", "Documentos profissionais"],
  },
  {
    id: "outros",
    nome: "Outros documentos complementares",
    descricao: "Outros documentos relevantes ao PMOC.",
    tone: "gray",
    icon: FolderOpen,
    itensEsperados: ["Arquivos diversos", "Observações", "Anexos extras"],
  },
];

const DOCUMENT_TYPE_OPTIONS = ["PDF", "DOC", "DOCX", "XLS", "XLSX", "PNG", "JPG"] as const;
const DOCUMENT_ACCEPT_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

function createDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateBr(iso: string): string {
  if (!iso) return "--";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function createSamplePmocDocumentos(): PmocDocumento[] {
  return [
    {
      id: createDocumentId(),
      nome: "Alvará de funcionamento",
      categoria: "legais",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "alvara_funcionamento.pdf",
      tamanho: 1258291,
      data_upload: "2026-07-10",
      validade: "2026-07-10",
      status: "valido",
      status_label: "Válido até 10/07/2026",
      obrigatorio: true,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "PMOC Climaris 2026",
      categoria: "procedimentos",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "pmoc_climaris_2026.pdf",
      tamanho: 2516582,
      data_upload: "2026-07-05",
      validade: "",
      status: "",
      status_label: "",
      obrigatorio: true,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "Relatório Qualidade do Ar - 2º Trimestre",
      categoria: "qualidade_ar",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "relatorio_qualidade_ar_q2.pdf",
      tamanho: 3250585,
      data_upload: "2026-06-28",
      validade: "",
      status: "aprovado",
      status_label: "Aprovado",
      obrigatorio: false,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "Manual AC-001 - LG Dual Inverter",
      categoria: "tecnica",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "manual_ac001_lg.pdf",
      tamanho: 4194304,
      data_upload: "2026-06-20",
      validade: "",
      status: "",
      status_label: "",
      obrigatorio: false,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "Checklist Manutenção - 06/2026",
      categoria: "registros",
      tipo: "XLSX",
      arquivo_url: "",
      arquivo_nome: "checklist_manutencao_06_2026.xlsx",
      tamanho: 524288,
      data_upload: "2026-06-15",
      validade: "",
      status: "",
      status_label: "",
      obrigatorio: false,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "Contrato de manutenção",
      categoria: "legais",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "contrato_manutencao.pdf",
      tamanho: 943718,
      data_upload: "2026-06-10",
      validade: "2027-06-10",
      status: "valido",
      status_label: "Válido até 10/06/2027",
      obrigatorio: true,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "ART Responsável Técnico",
      categoria: "responsavel",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "art_responsavel.pdf",
      tamanho: 786432,
      data_upload: "2026-06-08",
      validade: "2026-12-31",
      status: "valido",
      status_label: "Válido até 31/12/2026",
      obrigatorio: true,
      observacoes: "",
    },
    {
      id: createDocumentId(),
      nome: "Certificado NR35 - Equipe",
      categoria: "treinamentos",
      tipo: "PDF",
      arquivo_url: "",
      arquivo_nome: "certificado_nr35.pdf",
      tamanho: 655360,
      data_upload: "2026-05-22",
      validade: "2027-05-22",
      status: "",
      status_label: "",
      obrigatorio: false,
      observacoes: "",
    },
  ];
}

function defaultDocumentosConfig(): DocumentosConfig {
  return {
    exigirObrigatoriosAntesFinalizar: true,
    gerarPdfFinalAutomaticamente: true,
    anexarRelatoriosManutencoes: true,
    inserirFotosExecucoesRelatorio: false,
  };
}

function normalizePmocDocumentos(raw: Partial<PmocDocumento>[] | undefined): PmocDocumento[] {
  if (!raw?.length) return createSamplePmocDocumentos();
  return raw.map((doc) => ({
    id: doc.id ?? createDocumentId(),
    nome: doc.nome ?? "Documento",
    categoria: doc.categoria ?? "outros",
    tipo: doc.tipo ?? "PDF",
    arquivo_url: doc.arquivo_url ?? "",
    arquivo_nome: doc.arquivo_nome ?? "",
    tamanho: doc.tamanho ?? 0,
    data_upload: doc.data_upload ?? isoDateToday(),
    validade: doc.validade ?? "",
    status: doc.status ?? "",
    status_label: doc.status_label ?? "",
    obrigatorio: doc.obrigatorio ?? false,
    observacoes: doc.observacoes ?? "",
  }));
}

function getCategoryLabel(categoryId: string): string {
  return DOCUMENT_CATEGORIES.find((row) => row.id === categoryId)?.nome ?? categoryId;
}

function getCategoryToneClass(tone: DocumentCategoryDef["tone"], uiModule: Record<string, string>): string {
  const map: Record<DocumentCategoryDef["tone"], string> = {
    blue: uiModule.docsCatToneBlue,
    green: uiModule.docsCatToneGreen,
    purple: uiModule.docsCatTonePurple,
    orange: uiModule.docsCatToneOrange,
    cyan: uiModule.docsCatToneCyan,
    pink: uiModule.docsCatTonePink,
    slate: uiModule.docsCatToneSlate,
    gray: uiModule.docsCatToneGray,
  };
  return map[tone];
}

const SUMMARY_ITEMS = [
  { label: "Informações gerais", icon: CheckCircle2 },
  { label: "Responsável técnico", icon: UserCircle2 },
  { label: "Ambientes e Equipamentos", icon: Building2 },
  { label: "Cronograma", icon: CalendarDays },
  { label: "Documentos", icon: FileText },
  { label: "Revisão e geração", icon: ClipboardList },
] as const;

const IRIS_DOCUMENT_TIPS = [
  "Alvarás e licenças devem estar atualizados.",
  "Relatórios de qualidade do ar devem ser anexados regularmente.",
  "Mantenha registros fotográficos das manutenções realizadas.",
] as const;

const IRIS_REVIEW_TIPS = [
  "Verifique se todos os ambientes foram cadastrados corretamente.",
  "Confirme periodicidades das atividades e serviços.",
  "Anexe todos documentos obrigatórios.",
  "Após gerar, o documento poderá ser enviado ao cliente.",
] as const;

const PMOC_GENERATE_STEPS = [
  "Organizando dados",
  "Validando informações",
  "Montando cronograma",
  "Inserindo documentos",
  "Gerando PDF",
] as const;

const PMOC_GENERATION_INCLUDE_OPTIONS: { key: keyof PmocNovoDraft["pmoc_revisao"]["geracao"]; label: string }[] = [
  { key: "incluir_cliente", label: "Dados do cliente" },
  { key: "incluir_responsavel", label: "Responsável técnico" },
  { key: "incluir_equipamentos", label: "Lista equipamentos" },
  { key: "incluir_cronograma", label: "Cronograma completo" },
  { key: "incluir_servicos", label: "Atividades e serviços" },
  { key: "incluir_fotos", label: "Fotos anexadas" },
  { key: "incluir_documentos", label: "Documentos" },
];

function defaultPmocRevisao(): PmocNovoDraft["pmoc_revisao"] {
  return {
    validacoes: {
      informacoes: false,
      responsavel: false,
      ambientes: false,
      equipamentos: false,
      cronograma: false,
      documentos: false,
    },
    geracao: {
      incluir_cliente: true,
      incluir_responsavel: true,
      incluir_equipamentos: true,
      incluir_cronograma: true,
      incluir_servicos: true,
      incluir_fotos: true,
      incluir_documentos: true,
      formato: "pdf",
      status: "idle",
      arquivo_pdf: "",
    },
  };
}

function computePmocValidacoes(draft: PmocNovoDraft, flattenedEquipments: FlattenedEquipmentRow[]): PmocNovoDraft["pmoc_revisao"]["validacoes"] {
  const stepOneErrors = validateStepOne(draft);
  const informacoes = !Object.values(stepOneErrors).some(Boolean);
  const stepTwoErrors = validateStepTwo(draft.responsavelTecnico);
  const responsavel = !Object.values(stepTwoErrors).some(Boolean);
  const ambientesOk = draft.pmocAmbientes.length > 0 && draft.pmocAmbientes.every((amb) => amb.equipamentos.length > 0);
  const equipamentosOk = flattenedEquipments.length > 0;
  const cronogramaOk =
    flattenedEquipments.length > 0 &&
    flattenedEquipments.every((row) => {
      const bundle = (draft.equipamento_cronograma ?? []).find((item) => item.equipamento_id === row.id);
      return equipmentHasActiveServices(bundle);
    });
  const obrigatorios = draft.pmoc_documentos.filter((doc) => doc.obrigatorio);
  const documentosOk = draft.documentos_config.exigirObrigatoriosAntesFinalizar
    ? obrigatorios.length > 0 && obrigatorios.every((doc) => Boolean(doc.arquivo_nome))
    : draft.pmoc_documentos.length > 0;
  return {
    informacoes,
    responsavel,
    ambientes: ambientesOk,
    equipamentos: equipamentosOk,
    cronograma: cronogramaOk,
    documentos: documentosOk,
  };
}

function initialDraft(): PmocNovoDraft {
  return {
    cliente: "",
    unidadeLocal: "",
    nomePmoc: "",
    vigenciaInicio: "",
    vigenciaFim: "",
    periodicidade: "",
    descricao: "",
    usarEnderecoCliente: false,
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    referencia: "",
    tipoAmbiente: "",
    classificacao: "",
    responsavelTecnico: {
      nome: "",
      registro: "",
      uf: "",
      titulo: "",
      art: "",
      dataArt: "",
      email: "",
      telefone: "",
      empresa: "",
      endereco: "",
      anexos: [],
    },
    pmocAmbientes: INITIAL_AMBIENTES,
    equipamento_cronograma: buildInitialEquipmentSchedule(INITIAL_AMBIENTES),
    pmoc_documentos: createSamplePmocDocumentos(),
    documentos_config: defaultDocumentosConfig(),
    pmoc_revisao: defaultPmocRevisao(),
  };
}

function requiredError(value: string): string {
  return value.trim() ? "" : "Campo obrigatório";
}

function validateStepOne(draft: PmocNovoDraft): Partial<Record<keyof PmocNovoDraft, string>> {
  const nextErrors: Partial<Record<keyof PmocNovoDraft, string>> = {};
  for (const field of REQUIRED_FIELDS_STEP_ONE) {
    nextErrors[field] = requiredError(draft[field] as string);
  }
  return nextErrors;
}

function validateStepTwo(
  data: PmocNovoDraft["responsavelTecnico"],
): Partial<Record<ResponsibleField, string>> {
  const nextErrors: Partial<Record<ResponsibleField, string>> = {};
  for (const field of REQUIRED_FIELDS_STEP_TWO) {
    nextErrors[field] = requiredError(String(data[field] ?? ""));
  }
  if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    nextErrors.email = "Informe um e-mail válido";
  }
  return nextErrors;
}

function validateAmbienteForm(data: AmbienteForm): Partial<Record<AmbienteFormField, string>> {
  const nextErrors: Partial<Record<AmbienteFormField, string>> = {};
  for (const field of REQUIRED_AMBIENTE_FIELDS) {
    nextErrors[field] = requiredError(String(data[field] ?? ""));
  }
  return nextErrors;
}

function validateEquipamentoForm(data: EquipamentoForm): Partial<Record<EquipamentoFormField, string>> {
  const nextErrors: Partial<Record<EquipamentoFormField, string>> = {};
  for (const field of REQUIRED_EQUIPAMENTO_FIELDS) {
    nextErrors[field] = requiredError(String(data[field] ?? ""));
  }
  return nextErrors;
}

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeCapacity(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number.parseInt(digits, 10).toLocaleString("pt-BR");
}

function numericValue(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

function normalizeEquipmentTypeKey(type: string): string {
  const key = type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key.includes("split")) return "split_hi_wall";
  if (key.includes("cassete")) return "cassete";
  if (key.includes("piso") || key.includes("teto")) return "piso_teto";
  if (key.includes("vrf")) return "vrf";
  return key || "default";
}

function createActivityId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createServiceId(): string {
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function compareActivitiesByName(a: PmocActivityItem, b: PmocActivityItem): number {
  return a.nome.localeCompare(b.nome, "pt-BR");
}

function compareServicesByPeriodicity(a: PmocActivityServiceItem, b: PmocActivityServiceItem): number {
  const orderA = PERIODICITY_ORDER[a.periodicidade] ?? 99;
  const orderB = PERIODICITY_ORDER[b.periodicidade] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return a.descricao.localeCompare(b.descricao, "pt-BR");
}

function sortActivities(activities: PmocActivityItem[]): PmocActivityItem[] {
  return [...activities].sort(compareActivitiesByName);
}

function sortServices(services: PmocActivityServiceItem[]): PmocActivityServiceItem[] {
  return [...services].sort(compareServicesByPeriodicity);
}

function createServiceFromTemplate(service: DefaultServiceTemplate, personalizado = false): PmocActivityServiceItem {
  return {
    id: createServiceId(),
    descricao: service.descricao,
    periodicidade: service.periodicidade,
    obrigatorio: service.obrigatorio,
    exige_foto: service.exige_foto,
    ativo: true,
    tempo_estimado: "",
    observacao: "",
    personalizado,
  };
}

function createActivityFromTemplate(template: DefaultActivityTemplate, personalizado = false): PmocActivityItem {
  return {
    id: createActivityId(),
    nome: template.nome,
    descricao: template.descricao ?? "",
    tempo_estimado: template.tempo_estimado,
    ativo: true,
    personalizado,
    servicos: sortServices(template.servicos.map((service) => createServiceFromTemplate(service, personalizado))),
  };
}

function normalizeActivityItem(activity: PmocActivityItem & { periodicidade?: string }): PmocActivityItem {
  const legacyPeriodicity = activity.periodicidade ?? "Mensal";
  return {
    id: activity.id,
    nome: activity.nome,
    descricao: activity.descricao ?? "",
    tempo_estimado: activity.tempo_estimado ?? "",
    ativo: activity.ativo ?? true,
    personalizado: activity.personalizado,
    servicos: sortServices(
      (activity.servicos ?? []).map((service) => ({
        id: service.id,
        descricao: service.descricao,
        periodicidade: service.periodicidade ?? legacyPeriodicity,
        obrigatorio: service.obrigatorio ?? false,
        exige_foto: service.exige_foto ?? false,
        ativo: service.ativo ?? true,
        tempo_estimado: service.tempo_estimado ?? "",
        observacao: service.observacao ?? "",
        personalizado: service.personalizado,
      })),
    ),
  };
}

function normalizeCronogramaSchedule(
  schedule: PmocNovoDraft["equipamento_cronograma"] | undefined,
  ambientes: PmocNovoDraft["pmocAmbientes"],
): PmocNovoDraft["equipamento_cronograma"] {
  if (!schedule?.length) return buildInitialEquipmentSchedule(ambientes);
  return schedule.map((bundle) => ({
    equipamento_id: bundle.equipamento_id,
    atividades: sortActivities(bundle.atividades.map((activity) => normalizeActivityItem(activity))),
  }));
}

function buildEquipmentScheduleId(ambienteId: string, equipamento: PmocAmbienteEquipamento, index: number): string {
  const rawKey = (equipamento.tag || `${equipamento.fabricante}-${equipamento.modelo}-${index + 1}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${ambienteId}::${rawKey || `equip-${index + 1}`}`;
}

function flattenAmbienteEquipments(ambientes: PmocNovoDraft["pmocAmbientes"]): FlattenedEquipmentRow[] {
  const rows: FlattenedEquipmentRow[] = [];
  ambientes.forEach((ambiente) => {
    ambiente.equipamentos.forEach((equipamento, index) => {
      rows.push({
        id: buildEquipmentScheduleId(ambiente.id, equipamento, index),
        ambienteId: ambiente.id,
        ambienteNome: ambiente.nome,
        equipamento,
      });
    });
  });
  return rows;
}

function defaultActivitiesForEquipmentType(type: string): PmocActivityItem[] {
  const key = normalizeEquipmentTypeKey(type);
  const template = DEFAULT_ACTIVITIES_BY_TYPE[key] ?? DEFAULT_ACTIVITIES_BY_TYPE.default;
  return sortActivities(template.map((activity) => createActivityFromTemplate(activity)));
}

function buildInitialEquipmentSchedule(ambientes: PmocNovoDraft["pmocAmbientes"]): PmocNovoDraft["equipamento_cronograma"] {
  return flattenAmbienteEquipments(ambientes).map((row) => ({
    equipamento_id: row.id,
    atividades: defaultActivitiesForEquipmentType(row.equipamento.tipo),
  }));
}

function equipmentHasActiveServices(bundle: PmocEquipmentScheduleBundle | undefined): boolean {
  if (!bundle) return false;
  return bundle.atividades.some(
    (activity) => activity.ativo && activity.servicos.some((service) => service.ativo),
  );
}

function countActiveServices(bundle: PmocEquipmentScheduleBundle | undefined): number {
  if (!bundle) return 0;
  return bundle.atividades.reduce(
    (acc, activity) => acc + (activity.ativo ? activity.servicos.filter((service) => service.ativo).length : 0),
    0,
  );
}

export function PmocNovoPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [step, setStep] = useState<StepId>(1);
  const [draft, setDraft] = useState<PmocNovoDraft>(initialDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof PmocNovoDraft, string>>>({});
  const [responsavelErrors, setResponsavelErrors] = useState<Partial<Record<ResponsibleField, string>>>({});
  const [ambienteModalOpen, setAmbienteModalOpen] = useState(false);
  const [ambienteEditId, setAmbienteEditId] = useState<string | null>(null);
  const [ambienteForm, setAmbienteForm] = useState<AmbienteForm>({
    nome: "",
    tipo: "",
    area_m2: "",
    pe_direito: "",
    pessoas_fixas: "",
    pessoas_flutuantes: "",
    horario_inicio: "",
    horario_fim: "",
    dias_funcionamento: ["Seg", "Ter", "Qua", "Qui", "Sex"],
    observacoes: "",
  });
  const [ambienteFormErrors, setAmbienteFormErrors] = useState<Partial<Record<AmbienteFormField, string>>>({});

  const [equipamentoModalOpen, setEquipamentoModalOpen] = useState(false);
  const [equipamentoTargetAmbienteId, setEquipamentoTargetAmbienteId] = useState<string | null>(null);
  const [equipamentoEditTag, setEquipamentoEditTag] = useState<string | null>(null);
  const [equipamentoForm, setEquipamentoForm] = useState<EquipamentoForm>({
    tag: "",
    tipo: "",
    fabricante: "",
    modelo: "",
    capacidade_btu: "",
    fluido: "",
    serie: "",
    data_instalacao: "",
    observacao: "",
  });
  const [equipamentoFormErrors, setEquipamentoFormErrors] = useState<Partial<Record<EquipamentoFormField, string>>>({});
  const [clients, setClients] = useState<ClientOut[]>([]);
  const [sites, setSites] = useState<ClientSiteOut[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [createdPmocId, setCreatedPmocId] = useState<number | null>(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [catalogEquipments, setCatalogEquipments] = useState<EquipmentOut[]>([]);
  const [loadingCatalogEquipments, setLoadingCatalogEquipments] = useState(false);
  const [selectedCatalogEquipmentId, setSelectedCatalogEquipmentId] = useState<string>("");
  const [cronogramaSearch, setCronogramaSearch] = useState("");
  const [selectedCronogramaEquipId, setSelectedCronogramaEquipId] = useState<string>("");
  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityCreateModalOpen, setActivityCreateModalOpen] = useState(false);
  const [activityTargetEquipId, setActivityTargetEquipId] = useState<string | null>(null);
  const [activityEditId, setActivityEditId] = useState<string | null>(null);
  const [activityForm, setActivityForm] = useState({
    nome: "",
    descricao: "",
    tempo_estimado: "",
    ativo: true,
  });
  const [activityServiceModalOpen, setActivityServiceModalOpen] = useState(false);
  const [activityServiceCreateModalOpen, setActivityServiceCreateModalOpen] = useState(false);
  const [activityServiceTargetEquipId, setActivityServiceTargetEquipId] = useState<string | null>(null);
  const [activityServiceTargetActivityId, setActivityServiceTargetActivityId] = useState<string | null>(null);
  const [activityServiceEditId, setActivityServiceEditId] = useState<string | null>(null);
  const [serviceApplyScope, setServiceApplyScope] = useState<ScheduleServiceApplyScope>("equipment");
  const [activityServiceForm, setActivityServiceForm] = useState({
    descricao: "",
    periodicidade: "Mensal",
    obrigatorio: true,
    exige_foto: false,
    ativo: true,
    tempo_estimado: "",
    observacao: "",
  });
  const [activityServiceFormErrors, setActivityServiceFormErrors] = useState<
    Partial<Record<ActivityServiceFormField, string>>
  >({});
  const [cronogramaConfigModalOpen, setCronogramaConfigModalOpen] = useState(false);
  const [cronogramaConfiguracoes, setCronogramaConfiguracoes] = useState<CronogramaConfiguracoes>(() =>
    createDefaultCronogramaConfiguracoes(),
  );
  const [cronogramaConfigForm, setCronogramaConfigForm] = useState<CronogramaConfiguracoes>(() =>
    createDefaultCronogramaConfiguracoes(),
  );
  const [documentUploadModalOpen, setDocumentUploadModalOpen] = useState(false);
  const [documentConfigModalOpen, setDocumentConfigModalOpen] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docCategoryFilter, setDocCategoryFilter] = useState("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [docSortOrder, setDocSortOrder] = useState("recent");
  const [documentForm, setDocumentForm] = useState({
    nome: "",
    categoria: "legais",
    tipo: "PDF",
    validade: "",
    observacoes: "",
    arquivo_nome: "",
    tamanho: 0,
    arquivo_url: "",
  });
  const [documentFormErrors, setDocumentFormErrors] = useState<{ nome?: string; categoria?: string; tipo?: string; arquivo?: string }>({});
  const documentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedReviewSteps, setExpandedReviewSteps] = useState<Set<number>>(() => new Set([6]));
  const [pmocGenerateModalOpen, setPmocGenerateModalOpen] = useState(false);
  const [pmocGenerating, setPmocGenerating] = useState(false);
  const [pmocGenerateSuccess, setPmocGenerateSuccess] = useState(false);
  const [pmocGenerateStepDone, setPmocGenerateStepDone] = useState(0);
  const responsibleFilesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activityModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activityModalOpen]);

  useEffect(() => {
    if (!cronogramaConfigModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cronogramaConfigModalOpen]);

  useEffect(() => {
    if (!documentUploadModalOpen && !documentConfigModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [documentUploadModalOpen, documentConfigModalOpen]);

  useEffect(() => {
    if (!pmocGenerateModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pmocGenerateModalOpen]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const hasClientSites = sites.length > 0;
  const selectedSiteName = useMemo(() => {
    if (!selectedClientId) return "";
    if (selectedSiteId == null) return PMOC_MATRIX_SITE_LABEL;
    return selectedSite?.name ?? "Unidade selecionada";
  }, [selectedClientId, selectedSiteId, selectedSite]);
  const clientComboboxItems = useMemo(() => clientsOutToComboboxItems(clients), [clients]);
  const siteComboboxItems = useMemo<ClientComboboxItem[]>(() => {
    if (!selectedClientId) return [];
    return [
      {
        id: PMOC_MATRIX_SITE_VALUE,
        nome: PMOC_MATRIX_SITE_LABEL,
      },
      ...sites.map((site) => ({
        id: String(site.id),
        nome: site.name,
        endereco: formatClientSiteAddressLine(site),
        contato: site.phone ?? undefined,
      })),
    ];
  }, [selectedClientId, sites]);
  const catalogEquipmentItems = useMemo<ClientComboboxItem[]>(() => {
    return catalogEquipments.map((row) => {
      const modelLabel = [row.fabricante, row.modelo].filter(Boolean).join(" ");
      const btuLabel = row.capacidade_btu ? `${row.capacidade_btu.toLocaleString("pt-BR")} BTU/h` : "";
      return {
        id: String(row.id),
        nome: row.identificacao || `Equipamento ${row.id}`,
        endereco: [modelLabel, btuLabel].filter(Boolean).join(" · ") || undefined,
        contato: row.client_site_id ? `Unidade ${row.client_site_id}` : "Matriz",
      };
    });
  }, [catalogEquipments]);
  const selectedSiteComboboxValue = useMemo(() => {
    if (!selectedClientId) return "";
    if (selectedSiteId) return String(selectedSiteId);
    return PMOC_MATRIX_SITE_VALUE;
  }, [selectedClientId, selectedSiteId]);
  const ambientesSummary = useMemo(() => {
    const totalAmbientes = draft.pmocAmbientes.length;
    const areaTotal = draft.pmocAmbientes.reduce((acc, row) => acc + numericValue(row.area_m2), 0);
    const ocupacaoTotal = draft.pmocAmbientes.reduce((acc, row) => acc + numericValue(row.total_pessoas), 0);
    const equipamentosCount = draft.pmocAmbientes.reduce((acc, row) => acc + row.equipamentos.length, 0);
    const cargaTotal = draft.pmocAmbientes.reduce(
      (acc, row) => acc + row.equipamentos.reduce((inner, eq) => inner + numericValue(eq.capacidade_btu), 0),
      0,
    );
    return { totalAmbientes, areaTotal, ocupacaoTotal, equipamentosCount, cargaTotal };
  }, [draft.pmocAmbientes]);
  const flattenedEquipments = useMemo(() => flattenAmbienteEquipments(draft.pmocAmbientes), [draft.pmocAmbientes]);
  const equipamentoCronograma = draft.equipamento_cronograma ?? [];
  const cronogramaEquipamentosFiltrados = useMemo(() => {
    const query = cronogramaSearch.trim().toLowerCase();
    if (!query) return flattenedEquipments;
    return flattenedEquipments.filter((row) => {
      const haystack = `${row.equipamento.tag} ${row.equipamento.fabricante} ${row.equipamento.modelo} ${row.equipamento.tipo}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [flattenedEquipments, cronogramaSearch]);
  const cronogramaEquipamentoSelecionado = useMemo(
    () => flattenedEquipments.find((row) => row.id === selectedCronogramaEquipId) ?? null,
    [flattenedEquipments, selectedCronogramaEquipId],
  );
  const cronogramaAtividadesAtuais = useMemo(() => {
    if (!cronogramaEquipamentoSelecionado) return [];
    return (
      equipamentoCronograma.find((row) => row.equipamento_id === cronogramaEquipamentoSelecionado.id)?.atividades ?? []
    );
  }, [cronogramaEquipamentoSelecionado, equipamentoCronograma]);
  const cronogramaInsights = useMemo(() => {
    const insights: Array<{ key: string; title: string; detail: string }> = [];
    for (const row of flattenedEquipments.slice(0, 2)) {
      const bundle = equipamentoCronograma.find((item) => item.equipamento_id === row.id);
      const activeCount = countActiveServices(bundle);
      const activeActivities = bundle?.atividades.filter((activity) => activity.ativo).length ?? 0;
      insights.push({
        key: `${row.id}-active-count`,
        title: `${row.equipamento.tag || "Equipamento"} ${row.equipamento.tipo}`.trim(),
        detail: `${activeActivities} atividades ativas · ${activeCount} serviços ativos.`,
      });
      if (normalizeEquipmentTypeKey(row.equipamento.tipo) === "cassete") {
        const hasPumpActivity = bundle?.atividades.some(
          (activity) =>
            activity.ativo &&
            activity.nome.toLowerCase().includes("dreno") &&
            activity.servicos.some((service) => service.ativo),
        );
        if (!hasPumpActivity) {
          insights.push({
            key: `${row.id}-pump-recommendation`,
            title: `${row.equipamento.tag || "Cassete"}: recomendação`,
            detail: "Atividade de sistema de dreno recomendada para equipamentos cassete.",
          });
        }
      }
    }
    return insights.slice(0, 3);
  }, [flattenedEquipments, equipamentoCronograma]);

  const documentCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const category of DOCUMENT_CATEGORIES) counts[category.id] = 0;
    for (const doc of draft.pmoc_documentos) {
      counts[doc.categoria] = (counts[doc.categoria] ?? 0) + 1;
    }
    return counts;
  }, [draft.pmoc_documentos]);

  const filteredDocuments = useMemo(() => {
    let rows = [...draft.pmoc_documentos];
    if (docSearch.trim()) {
      const query = docSearch.trim().toLowerCase();
      rows = rows.filter(
        (doc) =>
          doc.nome.toLowerCase().includes(query) ||
          doc.arquivo_nome.toLowerCase().includes(query) ||
          getCategoryLabel(doc.categoria).toLowerCase().includes(query),
      );
    }
    if (docCategoryFilter !== "all") {
      rows = rows.filter((doc) => doc.categoria === docCategoryFilter);
    }
    if (docTypeFilter !== "all") {
      rows = rows.filter((doc) => doc.tipo.toUpperCase() === docTypeFilter.toUpperCase());
    }
    rows.sort((a, b) => {
      if (docSortOrder === "name") return a.nome.localeCompare(b.nome);
      if (docSortOrder === "size") return b.tamanho - a.tamanho;
      return b.data_upload.localeCompare(a.data_upload);
    });
    return rows;
  }, [draft.pmoc_documentos, docSearch, docCategoryFilter, docTypeFilter, docSortOrder]);

  const cronogramaReviewStats = useMemo(() => {
    let atividades = 0;
    let servicos = 0;
    let mensais = 0;
    let trimestrais = 0;
    let semestrais = 0;
    for (const bundle of equipamentoCronograma) {
      for (const activity of bundle.atividades) {
        if (!activity.ativo) continue;
        atividades += 1;
        for (const service of activity.servicos) {
          if (!service.ativo) continue;
          servicos += 1;
          if (service.periodicidade === "Mensal") mensais += 1;
          if (service.periodicidade === "Trimestral") trimestrais += 1;
          if (service.periodicidade === "Semestral") semestrais += 1;
        }
      }
    }
    return {
      equipamentos: flattenedEquipments.length,
      atividades,
      servicos,
      mensais,
      trimestrais,
      semestrais,
    };
  }, [equipamentoCronograma, flattenedEquipments.length]);

  const documentosReviewStats = useMemo(() => {
    const total = draft.pmoc_documentos.length;
    const obrigatorios = draft.pmoc_documentos.filter((doc) => doc.obrigatorio);
    const obrigatoriosOk = obrigatorios.filter((doc) => Boolean(doc.arquivo_nome)).length;
    const completo =
      !draft.documentos_config.exigirObrigatoriosAntesFinalizar ||
      (obrigatorios.length > 0 && obrigatoriosOk === obrigatorios.length);
    return {
      total,
      obrigatorios: obrigatorios.length,
      obrigatoriosOk,
      completo,
    };
  }, [draft.pmoc_documentos, draft.documentos_config.exigirObrigatoriosAntesFinalizar]);

  const pmocValidacoes = useMemo(
    () => computePmocValidacoes(draft, flattenedEquipments),
    [draft, flattenedEquipments],
  );

  const allValidacoesOk = useMemo(
    () => Object.values(pmocValidacoes).every(Boolean),
    [pmocValidacoes],
  );

  useEffect(() => {
    if (step !== 6) return;
    setDraft((prev) => ({
      ...prev,
      pmoc_revisao: {
        ...prev.pmoc_revisao,
        validacoes: computePmocValidacoes(prev, flattenAmbienteEquipments(prev.pmocAmbientes)),
      },
    }));
  }, [step]);

  const irisAlerts = useMemo(() => {
    const alerts: Array<{ key: string; title: string; detail: string }> = [];
    for (const ambiente of draft.pmocAmbientes) {
      const area = numericValue(ambiente.area_m2);
      const pessoas = numericValue(ambiente.total_pessoas);
      const carga = ambiente.equipamentos.reduce((acc, eq) => acc + numericValue(eq.capacidade_btu), 0);
      if (area > 0 && pessoas > 0 && pessoas / area > 0.45) {
        alerts.push({
          key: `${ambiente.id}-ocupacao`,
          title: ambiente.nome,
          detail: `Alta ocupação para o ambiente (${pessoas} pessoas). Verifique a renovação de ar recomendada.`,
        });
      }
      if (carga > 0 && area > 0 && carga / area < 400) {
        alerts.push({
          key: `${ambiente.id}-carga`,
          title: ambiente.nome,
          detail: "Verifique distribuição de ar para garantir o conforto térmico.",
        });
      }
    }
    const missingTag = draft.pmocAmbientes.some((amb) => amb.equipamentos.some((eq) => !eq.tag.trim()));
    if (missingTag) {
      alerts.push({
        key: "missing-tag",
        title: "Equipamento sem TAG identificado",
        detail: "Atribua uma TAG para facilitar identificação e manutenção.",
      });
    }
    return alerts.slice(0, 3);
  }, [draft.pmocAmbientes]);

  useEffect(() => {
    let vigenciaInicio = "";
    let vigenciaFim = "";
    try {
      const raw = window.localStorage.getItem(PMOC_NOVO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PmocNovoDraft> & {
          equipamento_servicos?: unknown;
        };
        vigenciaInicio = parsed.vigenciaInicio ?? "";
        vigenciaFim = parsed.vigenciaFim ?? "";
        setDraft((prev) => {
          const ambientes = parsed.pmocAmbientes ?? prev.pmocAmbientes;
          const next: PmocNovoDraft = {
            ...prev,
            ...parsed,
            pmocAmbientes: ambientes,
            equipamento_cronograma: normalizeCronogramaSchedule(parsed.equipamento_cronograma, ambientes),
            pmoc_documentos: normalizePmocDocumentos(parsed.pmoc_documentos),
            documentos_config: {
              ...defaultDocumentosConfig(),
              ...(parsed.documentos_config ?? {}),
            },
            pmoc_revisao: {
              ...defaultPmocRevisao(),
              ...(parsed.pmoc_revisao ?? {}),
              validacoes: {
                ...defaultPmocRevisao().validacoes,
                ...(parsed.pmoc_revisao?.validacoes ?? {}),
              },
              geracao: {
                ...defaultPmocRevisao().geracao,
                ...(parsed.pmoc_revisao?.geracao ?? {}),
              },
            },
          };
          return next;
        });
      }
    } catch {
      // ignora falha de parse para não bloquear uso da tela
    }

    try {
      const configRaw = window.localStorage.getItem(PMOC_CRONOGRAMA_CONFIG_KEY);
      if (configRaw) {
        const parsedConfig = JSON.parse(configRaw) as Partial<CronogramaConfiguracoes>;
        const normalized = normalizeCronogramaConfiguracoes(parsedConfig, vigenciaInicio, vigenciaFim);
        setCronogramaConfiguracoes(normalized);
        setCronogramaConfigForm(normalized);
      } else if (vigenciaInicio || vigenciaFim) {
        const defaults = createDefaultCronogramaConfiguracoes(vigenciaInicio, vigenciaFim);
        setCronogramaConfiguracoes(defaults);
        setCronogramaConfigForm(defaults);
      }
    } catch {
      // ignora configurações inválidas
    }

    try {
      const stateRaw = window.localStorage.getItem(PMOC_NOVO_STATE_STORAGE_KEY);
      if (!stateRaw) return;
      const parsedState = JSON.parse(stateRaw) as {
        step?: StepId;
        selectedClientId?: number | null;
        selectedSiteId?: number | null;
        createdPmocId?: number | null;
      };
      if (parsedState.step && parsedState.step >= 1 && parsedState.step <= 6) setStep(parsedState.step);
      if (typeof parsedState.selectedClientId === "number") setSelectedClientId(parsedState.selectedClientId);
      if (typeof parsedState.selectedSiteId === "number") setSelectedSiteId(parsedState.selectedSiteId);
      if (typeof parsedState.createdPmocId === "number") setCreatedPmocId(parsedState.createdPmocId);
    } catch {
      // ignora estado inválido no localStorage
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PMOC_NOVO_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    window.localStorage.setItem(
      PMOC_NOVO_STATE_STORAGE_KEY,
      JSON.stringify({ step, selectedClientId, selectedSiteId, createdPmocId }),
    );
  }, [step, selectedClientId, selectedSiteId, createdPmocId]);

  useEffect(() => {
    window.localStorage.setItem(PMOC_CRONOGRAMA_CONFIG_KEY, JSON.stringify(cronogramaConfiguracoes));
  }, [cronogramaConfiguracoes]);

  useEffect(() => {
    let active = true;
    setLoadingClients(true);
    void listClientsAll({ status: "active" })
      .then((rows) => {
        if (!active) return;
        setClients(rows);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar clientes.");
      })
      .finally(() => {
        if (active) setLoadingClients(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setSites([]);
      return;
    }
    let active = true;
    setLoadingSites(true);
    void listClientSites(selectedClientId)
      .then((rows) => {
        if (!active) return;
        setSites(rows);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar unidades.");
        if (active) setSites([]);
      })
      .finally(() => {
        if (active) setLoadingSites(false);
      });
    return () => {
      active = false;
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || loadingSites || hasClientSites) return;
    setSelectedSiteId(null);
    if (draft.unidadeLocal !== PMOC_MATRIX_SITE_LABEL) {
      updateField("unidadeLocal", PMOC_MATRIX_SITE_LABEL);
    }
  }, [selectedClientId, loadingSites, hasClientSites, draft.unidadeLocal]);

  useEffect(() => {
    if (!selectedClientId) {
      setCatalogEquipments([]);
      setSelectedCatalogEquipmentId("");
      return;
    }
    let active = true;
    setLoadingCatalogEquipments(true);
    void listClientHvacEquipments(selectedClientId, selectedSiteId ? { only_active: true, client_site_id: selectedSiteId } : { only_active: true })
      .then((rows) => {
        if (!active) return;
        const filtered =
          selectedSiteId == null ? rows.filter((row) => row.client_site_id == null) : rows.filter((row) => row.client_site_id === selectedSiteId);
        setCatalogEquipments(filtered);
      })
      .catch((error) => {
        if (!active) return;
        setCatalogEquipments([]);
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar os equipamentos cadastrados.");
      })
      .finally(() => {
        if (active) setLoadingCatalogEquipments(false);
      });

    return () => {
      active = false;
    };
  }, [selectedClientId, selectedSiteId]);

  useEffect(() => {
    if (!draft.usarEnderecoCliente || !selectedClient) return;
    const sourceStreet = selectedSite?.street ?? selectedClient.address_street ?? "";
    const sourceNumber = selectedSite?.number ?? selectedClient.address_number ?? "";
    const sourceNeighborhood = selectedSite?.neighborhood ?? selectedClient.address_district ?? "";
    const sourceCity = selectedSite?.city ?? selectedClient.address_city ?? "";
    const sourceState = selectedSite?.state ?? selectedClient.address_state ?? "";
    const sourceCep = selectedSite?.cep ?? selectedClient.address_postal_code ?? "";
    const sourceComplement = selectedSite?.complement ?? selectedClient.address_complement ?? "";

    setDraft((prev) => ({
      ...prev,
      endereco: sourceStreet,
      numero: sourceNumber,
      bairro: sourceNeighborhood,
      cidade: sourceCity,
      estado: sourceState,
      cep: sourceCep,
      complemento: sourceComplement,
    }));
  }, [draft.usarEnderecoCliente, selectedClient, selectedSite]);

  useEffect(() => {
    if (flattenedEquipments.length === 0) {
      if (selectedCronogramaEquipId) setSelectedCronogramaEquipId("");
      return;
    }
    const exists = flattenedEquipments.some((row) => row.id === selectedCronogramaEquipId);
    if (!exists) setSelectedCronogramaEquipId(flattenedEquipments[0].id);
  }, [flattenedEquipments, selectedCronogramaEquipId]);

  useEffect(() => {
    if (!selectedCronogramaEquipId) {
      setExpandedActivityIds(new Set());
      return;
    }
    const atividades =
      equipamentoCronograma.find((row) => row.equipamento_id === selectedCronogramaEquipId)?.atividades ?? [];
    setExpandedActivityIds(new Set(atividades.map((activity) => activity.id)));
  }, [selectedCronogramaEquipId, equipamentoCronograma]);

  useEffect(() => {
    setDraft((prev) => {
      const currentSchedule = prev.equipamento_cronograma ?? [];
      const currentByEquipment = new Map(currentSchedule.map((row) => [row.equipamento_id, row]));
      const nextSchedule: PmocEquipmentScheduleBundle[] = flattenedEquipments.map((equipmentRow) => {
        const existing = currentByEquipment.get(equipmentRow.id);
        if (!existing) {
          return {
            equipamento_id: equipmentRow.id,
            atividades: defaultActivitiesForEquipmentType(equipmentRow.equipamento.tipo),
          };
        }
        const defaultActivities = defaultActivitiesForEquipmentType(equipmentRow.equipamento.tipo);
        const existingByName = new Map(existing.atividades.map((activity) => [activity.nome.trim().toLowerCase(), activity]));
        const mergedDefaults = defaultActivities.map((defaultActivity) => {
          const key = defaultActivity.nome.trim().toLowerCase();
          const previous = existingByName.get(key);
          if (!previous) return defaultActivity;
          const mergedServices = defaultActivity.servicos.map((defaultService) => {
            const previousService = previous.servicos.find(
              (service) => service.descricao.trim().toLowerCase() === defaultService.descricao.trim().toLowerCase(),
            );
            return previousService
              ? {
                  ...previousService,
                  obrigatorio: defaultService.obrigatorio,
                  exige_foto: defaultService.exige_foto,
                  periodicidade: previousService.periodicidade || defaultService.periodicidade,
                }
              : defaultService;
          });
          const extraServices = previous.servicos.filter((service) => {
            const isDefault = defaultActivity.servicos.some(
              (defaultService) =>
                defaultService.descricao.trim().toLowerCase() === service.descricao.trim().toLowerCase(),
            );
            return service.personalizado || !isDefault;
          });
          return {
            ...previous,
            descricao: previous.descricao || defaultActivity.descricao || "",
            tempo_estimado: previous.tempo_estimado || defaultActivity.tempo_estimado,
            servicos: sortServices([...mergedServices, ...extraServices]),
          };
        });
        const extras = existing.atividades.filter((activity) => {
          const isDefault = defaultActivities.some(
            (defaultActivity) => defaultActivity.nome.trim().toLowerCase() === activity.nome.trim().toLowerCase(),
          );
          return activity.personalizado || !isDefault;
        });
        return {
          equipamento_id: equipmentRow.id,
          atividades: sortActivities([...mergedDefaults, ...extras]),
        };
      });
      if (JSON.stringify(nextSchedule) === JSON.stringify(currentSchedule)) return prev;
      return { ...prev, equipamento_cronograma: nextSchedule };
    });
  }, [flattenedEquipments]);

  const progressPercent = useMemo(() => Math.round((step / 6) * 100), [step]);

  function updateField<K extends keyof PmocNovoDraft>(field: K, value: PmocNovoDraft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  }

  function fieldClass(field: keyof PmocNovoDraft): string {
    return `${ui.input} ${errors[field] ? ui.inputError : ""}`;
  }

  function responsibleFieldClass(field: ResponsibleField): string {
    return `${ui.input} ${responsavelErrors[field] ? ui.inputError : ""}`;
  }

  function updateResponsavelField<K extends ResponsibleField>(
    field: K,
    value: PmocNovoDraft["responsavelTecnico"][K],
  ) {
    setDraft((prev) => ({
      ...prev,
      responsavelTecnico: {
        ...prev.responsavelTecnico,
        [field]: value,
      },
    }));
    if (responsavelErrors[field]) {
      setResponsavelErrors((prev) => ({ ...prev, [field]: "" }));
    }
  }

  function handleClientComboboxChange(clientId: string) {
    const parsedId = Number.parseInt(clientId, 10);
    if (!Number.isFinite(parsedId)) {
      setSelectedClientId(null);
      setSelectedSiteId(null);
      setSites([]);
      updateField("cliente", "");
      updateField("unidadeLocal", "");
      return;
    }
    const client = clients.find((row) => row.id === parsedId);
    setSelectedClientId(parsedId);
    setSelectedSiteId(null);
    setSites([]);
    updateField("cliente", client?.name ?? "");
    updateField("unidadeLocal", PMOC_MATRIX_SITE_LABEL);
  }

  function handleSiteComboboxChange(siteId: string) {
    if (siteId === PMOC_MATRIX_SITE_VALUE) {
      setSelectedSiteId(null);
      updateField("unidadeLocal", PMOC_MATRIX_SITE_LABEL);
      return;
    }
    const parsedId = Number.parseInt(siteId, 10);
    if (!Number.isFinite(parsedId)) {
      setSelectedSiteId(null);
      updateField("unidadeLocal", "");
      return;
    }
    const site = sites.find((row) => row.id === parsedId);
    setSelectedSiteId(parsedId);
    updateField("unidadeLocal", site?.name ?? "");
  }

  function handleAttachResponsibleFiles(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files);
    const validMime = new Set(["application/pdf", "image/jpeg", "image/png"]);
    for (const file of incoming) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Arquivo ${file.name} excede 10MB.`);
        return;
      }
      if (!validMime.has(file.type)) {
        toast.error(`Arquivo ${file.name} com formato não suportado.`);
        return;
      }
    }
    setDraft((prev) => ({
      ...prev,
      responsavelTecnico: {
        ...prev.responsavelTecnico,
        anexos: [
          ...prev.responsavelTecnico.anexos,
          ...incoming.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          })),
        ],
      },
    }));
  }

  function equipmentTypeBadgeClass(tipo: string): string {
    const key = tipo.toLowerCase();
    if (key.includes("cassete")) return ui.badgeCassete;
    if (key.includes("piso")) return ui.badgePisoTeto;
    if (key.includes("split")) return ui.badgeSplit;
    return ui.badgeDefault;
  }

  function openAmbienteModal(ambiente?: PmocAmbiente) {
    if (ambiente) {
      setAmbienteEditId(ambiente.id);
      setAmbienteForm({
        nome: ambiente.nome,
        tipo: ambiente.tipo,
        area_m2: ambiente.area_m2,
        pe_direito: ambiente.pe_direito,
        pessoas_fixas: ambiente.pessoas_fixas,
        pessoas_flutuantes: ambiente.pessoas_flutuantes,
        horario_inicio: ambiente.horario_inicio,
        horario_fim: ambiente.horario_fim,
        dias_funcionamento: ambiente.dias_funcionamento,
        observacoes: ambiente.observacoes,
      });
    } else {
      setAmbienteEditId(null);
      setAmbienteForm({
        nome: "",
        tipo: "",
        area_m2: "",
        pe_direito: "",
        pessoas_fixas: "",
        pessoas_flutuantes: "",
        horario_inicio: "",
        horario_fim: "",
        dias_funcionamento: ["Seg", "Ter", "Qua", "Qui", "Sex"],
        observacoes: "",
      });
    }
    setAmbienteFormErrors({});
    setAmbienteModalOpen(true);
  }

  function removeAmbiente(ambienteId: string) {
    setDraft((prev) => ({
      ...prev,
      pmocAmbientes: prev.pmocAmbientes.filter((row) => row.id !== ambienteId),
    }));
  }

  function submitAmbienteModal() {
    const stepErrors = validateAmbienteForm(ambienteForm);
    if (Object.values(stepErrors).some(Boolean)) {
      setAmbienteFormErrors(stepErrors);
      return;
    }
    const area = numericValue(ambienteForm.area_m2);
    const peDireito = numericValue(ambienteForm.pe_direito);
    const pessoasFixas = numericValue(ambienteForm.pessoas_fixas);
    const pessoasFlutuantes = numericValue(ambienteForm.pessoas_flutuantes);
    const payload: PmocAmbiente = {
      id: ambienteEditId ?? `amb-${Date.now()}`,
      nome: ambienteForm.nome.trim(),
      tipo: ambienteForm.tipo,
      area_m2: String(area),
      pe_direito: String(peDireito || 0),
      volume: String(area * (peDireito || 0)),
      pessoas_fixas: String(pessoasFixas),
      pessoas_flutuantes: String(pessoasFlutuantes),
      total_pessoas: String(pessoasFixas + pessoasFlutuantes),
      horario_inicio: ambienteForm.horario_inicio,
      horario_fim: ambienteForm.horario_fim,
      dias_funcionamento: ambienteForm.dias_funcionamento,
      observacoes: ambienteForm.observacoes,
      equipamentos:
        draft.pmocAmbientes.find((row) => row.id === ambienteEditId)?.equipamentos ??
        [],
    };
    setDraft((prev) => ({
      ...prev,
      pmocAmbientes:
        ambienteEditId == null
          ? [...prev.pmocAmbientes, payload]
          : prev.pmocAmbientes.map((row) => (row.id === ambienteEditId ? payload : row)),
    }));
    setAmbienteModalOpen(false);
  }

  function openEquipamentoModal(ambienteId: string, equipment?: PmocAmbienteEquipamento) {
    setEquipamentoTargetAmbienteId(ambienteId);
    setEquipamentoEditTag(equipment?.tag ?? null);
    setEquipamentoForm(
      equipment ?? {
        tag: "",
        tipo: "",
        fabricante: "",
        modelo: "",
        capacidade_btu: "",
        fluido: "",
        serie: "",
        data_instalacao: "",
        observacao: "",
      },
    );
    setEquipamentoFormErrors({});
    setSelectedCatalogEquipmentId("");
    setEquipamentoModalOpen(true);
  }

  function inferEquipmentType(row: EquipmentOut): string {
    const source = `${row.categoria_instalacao ?? ""} ${row.modelo ?? ""}`.toLowerCase();
    if (source.includes("cassete")) return "Cassete";
    if (source.includes("piso")) return "Piso Teto";
    if (source.includes("duto")) return "Duto";
    if (source.includes("vrf")) return "VRF";
    if (source.includes("janela")) return "Janela";
    if (source.includes("self")) return "Self";
    if (source.includes("chiller")) return "Chiller";
    if (source.includes("split")) return "Split Hi Wall";
    return "Outro";
  }

  function inferRefrigerantType(row: EquipmentOut): string {
    const gas = (row.tipo_gas ?? "").toUpperCase();
    if (gas.includes("R22")) return "R22";
    if (gas.includes("R410")) return "R410A";
    if (gas.includes("R32")) return "R32";
    return gas ? "Outro" : "";
  }

  function applyCatalogEquipment(equipmentId: string) {
    setSelectedCatalogEquipmentId(equipmentId);
    const selected = catalogEquipments.find((row) => String(row.id) === equipmentId);
    if (!selected) return;
    setEquipamentoForm((prev) => ({
      ...prev,
      tag: (selected.identificacao ?? "").toUpperCase(),
      tipo: inferEquipmentType(selected),
      fabricante: selected.fabricante?.trim() || "Outro",
      modelo: selected.modelo?.trim() || selected.modelo_evaporadora?.trim() || selected.modelo_condensadora?.trim() || "",
      capacidade_btu: selected.capacidade_btu ? normalizeCapacity(String(selected.capacidade_btu)) : "",
      fluido: inferRefrigerantType(selected),
      serie: selected.serial ?? "",
      observacao: [selected.local_instalacao, selected.installation_reference].filter(Boolean).join(" · "),
    }));
  }

  function removeEquipamento(ambienteId: string, equipmentTag: string) {
    setDraft((prev) => ({
      ...prev,
      pmocAmbientes: prev.pmocAmbientes.map((row) =>
        row.id === ambienteId
          ? { ...row, equipamentos: row.equipamentos.filter((eq) => eq.tag !== equipmentTag) }
          : row,
      ),
    }));
  }

  function submitEquipamentoModal() {
    if (!equipamentoTargetAmbienteId) return;
    const stepErrors = validateEquipamentoForm(equipamentoForm);
    if (Object.values(stepErrors).some(Boolean)) {
      setEquipamentoFormErrors(stepErrors);
      return;
    }
    const payload: PmocAmbienteEquipamento = {
      ...equipamentoForm,
      tag: equipamentoForm.tag.toUpperCase(),
      capacidade_btu: normalizeCapacity(equipamentoForm.capacidade_btu),
    };
    setDraft((prev) => ({
      ...prev,
      pmocAmbientes: prev.pmocAmbientes.map((row) => {
        if (row.id !== equipamentoTargetAmbienteId) return row;
        const exists = row.equipamentos.some((eq) => eq.tag === equipamentoEditTag);
        return {
          ...row,
          equipamentos: exists
            ? row.equipamentos.map((eq) => (eq.tag === equipamentoEditTag ? payload : eq))
            : [...row.equipamentos, payload],
        };
      }),
    }));
    setEquipamentoModalOpen(false);
  }

  function openDocumentUploadModal() {
    setDocumentForm({
      nome: "",
      categoria: "legais",
      tipo: "PDF",
      validade: "",
      observacoes: "",
      arquivo_nome: "",
      tamanho: 0,
      arquivo_url: "",
    });
    setDocumentFormErrors({});
    setDocumentUploadModalOpen(true);
  }

  function handleDocumentFileSelect(file: File | null) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toUpperCase() ?? "PDF";
    const mappedType = DOCUMENT_TYPE_OPTIONS.find((type) => type === extension) ?? extension;
    setDocumentForm((prev) => ({
      ...prev,
      arquivo_nome: file.name,
      tamanho: file.size,
      arquivo_url: URL.createObjectURL(file),
      tipo: mappedType,
      nome: prev.nome || file.name.replace(/\.[^.]+$/, ""),
    }));
    setDocumentFormErrors((prev) => ({ ...prev, arquivo: "" }));
  }

  function saveNewDocument() {
    const nextErrors: { nome?: string; categoria?: string; tipo?: string; arquivo?: string } = {};
    if (!documentForm.nome.trim()) nextErrors.nome = "Informe o nome do documento.";
    if (!documentForm.categoria) nextErrors.categoria = "Selecione a categoria.";
    if (!documentForm.tipo) nextErrors.tipo = "Selecione o tipo.";
    if (!documentForm.arquivo_nome) nextErrors.arquivo = "Selecione um arquivo.";
    setDocumentFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const newDocument: PmocDocumento = {
      id: createDocumentId(),
      nome: documentForm.nome.trim(),
      categoria: documentForm.categoria,
      tipo: documentForm.tipo,
      arquivo_url: documentForm.arquivo_url,
      arquivo_nome: documentForm.arquivo_nome,
      tamanho: documentForm.tamanho,
      data_upload: isoDateToday(),
      validade: documentForm.validade,
      status: documentForm.validade ? "valido" : "",
      status_label: documentForm.validade ? `Válido até ${formatDateBr(documentForm.validade)}` : "",
      obrigatorio: false,
      observacoes: documentForm.observacoes.trim(),
    };

    setDraft((prev) => ({
      ...prev,
      pmoc_documentos: [newDocument, ...prev.pmoc_documentos],
    }));
    setDocumentUploadModalOpen(false);
    toast.success("Documento anexado com sucesso.");
  }

  function removeDocument(documentId: string) {
    setDraft((prev) => ({
      ...prev,
      pmoc_documentos: prev.pmoc_documentos.filter((doc) => doc.id !== documentId),
    }));
    toast.success("Documento removido.");
  }

  function updateDocumentosConfig<K extends keyof DocumentosConfig>(field: K, value: DocumentosConfig[K]) {
    setDraft((prev) => ({
      ...prev,
      documentos_config: { ...prev.documentos_config, [field]: value },
    }));
  }

  function saveDocumentosConfig() {
    setDocumentConfigModalOpen(false);
    toast.success("Configurações de documentos salvas.");
  }

  function toggleReviewStep(stepNumber: number) {
    setExpandedReviewSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) next.delete(stepNumber);
      else next.add(stepNumber);
      return next;
    });
  }

  function updatePmocGeracaoOption<K extends keyof PmocNovoDraft["pmoc_revisao"]["geracao"]>(
    field: K,
    value: PmocNovoDraft["pmoc_revisao"]["geracao"][K],
  ) {
    setDraft((prev) => ({
      ...prev,
      pmoc_revisao: {
        ...prev.pmoc_revisao,
        geracao: { ...prev.pmoc_revisao.geracao, [field]: value },
      },
    }));
  }

  function handlePreviewPmoc() {
    toast.success("Prévia do PMOC será exibida em breve.");
  }

  async function handleGeneratePmoc() {
    if (!allValidacoesOk) {
      toast.error("Corrija os itens pendentes na validação antes de gerar o PMOC.");
      return;
    }
    setPmocGenerateModalOpen(true);
    setPmocGenerating(true);
    setPmocGenerateSuccess(false);
    setPmocGenerateStepDone(0);
    setDraft((prev) => ({
      ...prev,
      pmoc_revisao: {
        ...prev.pmoc_revisao,
        validacoes: pmocValidacoes,
        geracao: { ...prev.pmoc_revisao.geracao, status: "generating" },
      },
    }));

    for (let index = 0; index < PMOC_GENERATE_STEPS.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setPmocGenerateStepDone(index + 1);
    }

    const pdfName = `${(draft.nomePmoc || "pmoc").replace(/\s+/g, "_").toLowerCase()}.pdf`;
    setPmocGenerating(false);
    setPmocGenerateSuccess(true);
    setDraft((prev) => ({
      ...prev,
      pmoc_revisao: {
        ...prev.pmoc_revisao,
        geracao: { ...prev.pmoc_revisao.geracao, status: "success", arquivo_pdf: pdfName },
      },
    }));
    toast.success("PMOC gerado com sucesso.");
  }

  function openCronogramaConfigModal() {
    setCronogramaConfigForm({ ...cronogramaConfiguracoes });
    setCronogramaConfigModalOpen(true);
  }

  function saveCronogramaConfiguracoes() {
    if (!cronogramaConfigForm.dataInicial.trim() || !cronogramaConfigForm.dataFinal.trim()) {
      toast.error("Informe as datas do cronograma.");
      return;
    }
    if (cronogramaConfigForm.dataFinal < cronogramaConfigForm.dataInicial) {
      toast.error("A data final deve ser posterior à data inicial.");
      return;
    }
    const hasPeriodicity = Object.values(cronogramaConfigForm.periodicidadesAtivas).some(Boolean);
    if (!hasPeriodicity) {
      toast.error("Selecione ao menos uma periodicidade disponível.");
      return;
    }
    setCronogramaConfiguracoes({ ...cronogramaConfigForm });
    setCronogramaConfigModalOpen(false);
    toast.success("Configurações salvas com sucesso.");
  }

  function openAddActivityModal(equipamentoId: string) {
    setActivityTargetEquipId(equipamentoId);
    setActivityEditId(null);
    setActivityForm({
      nome: "",
      descricao: "",
      tempo_estimado: "",
      ativo: true,
    });
    setActivityCreateModalOpen(true);
  }

  function openEditActivityModal(equipamentoId: string, activity: PmocActivityItem) {
    setActivityTargetEquipId(equipamentoId);
    setActivityEditId(activity.id);
    setActivityForm({
      nome: activity.nome,
      descricao: activity.descricao,
      tempo_estimado: activity.tempo_estimado,
      ativo: activity.ativo,
    });
    setActivityModalOpen(true);
  }

  function updateScheduleActivities(
    equipamentoId: string,
    updater: (activities: PmocActivityItem[]) => PmocActivityItem[],
  ) {
    setDraft((prev) => ({
      ...prev,
      equipamento_cronograma: (prev.equipamento_cronograma ?? []).map((item) =>
        item.equipamento_id === equipamentoId
          ? { ...item, atividades: sortActivities(updater(item.atividades)) }
          : item,
      ),
    }));
  }

  function toggleActivityExpanded(activityId: string) {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  function removeActivity(equipamentoId: string, activityId: string) {
    updateScheduleActivities(equipamentoId, (activities) =>
      activities.filter((activity) => activity.id !== activityId),
    );
  }

  function duplicateActivity(equipamentoId: string, activity: PmocActivityItem) {
    const copy: PmocActivityItem = {
      ...activity,
      id: createActivityId(),
      nome: `${activity.nome} (cópia)`,
      personalizado: true,
      servicos: activity.servicos.map((service) => ({
        ...service,
        id: createServiceId(),
        personalizado: true,
      })),
    };
    updateScheduleActivities(equipamentoId, (activities) => [...activities, copy]);
    setExpandedActivityIds((prev) => new Set([...prev, copy.id]));
  }

  function saveEditedActivity() {
    if (!activityTargetEquipId || !activityEditId) return;
    if (!activityForm.nome.trim()) {
      toast.error("Informe o nome da atividade.");
      return;
    }
    updateScheduleActivities(activityTargetEquipId, (activities) =>
      activities.map((activity) =>
        activity.id === activityEditId
          ? {
              ...activity,
              nome: activityForm.nome.trim(),
              descricao: activityForm.descricao.trim(),
              tempo_estimado: activityForm.tempo_estimado.trim(),
              ativo: activityForm.ativo,
            }
          : activity,
      ),
    );
    setActivityModalOpen(false);
  }

  function saveNewActivity() {
    if (!activityTargetEquipId) return;
    if (!activityForm.nome.trim()) {
      toast.error("Informe o nome da atividade.");
      return;
    }
    const newActivity: PmocActivityItem = {
      id: createActivityId(),
      nome: activityForm.nome.trim(),
      descricao: activityForm.descricao.trim(),
      tempo_estimado: activityForm.tempo_estimado.trim() || "A definir",
      ativo: activityForm.ativo,
      personalizado: true,
      servicos: [],
    };
    updateScheduleActivities(activityTargetEquipId, (activities) => [...activities, newActivity]);
    setExpandedActivityIds((prev) => new Set([...prev, newActivity.id]));
    setActivityCreateModalOpen(false);
  }

  function openAddActivityServiceModal(equipamentoId: string, activityId: string) {
    setActivityServiceTargetEquipId(equipamentoId);
    setActivityServiceTargetActivityId(activityId);
    setActivityServiceEditId(null);
    setServiceApplyScope("equipment");
    setActivityServiceForm({
      descricao: "",
      periodicidade: "Mensal",
      obrigatorio: true,
      exige_foto: false,
      ativo: true,
      tempo_estimado: "",
      observacao: "",
    });
    setActivityServiceCreateModalOpen(true);
  }

  function clearActivityServiceFieldError(field: ActivityServiceFormField) {
    setActivityServiceFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validateActivityServiceForm(): boolean {
    const nextErrors: Partial<Record<ActivityServiceFormField, string>> = {};
    if (!activityServiceForm.descricao.trim()) {
      nextErrors.descricao = "Informe a descrição do serviço.";
    }
    if (!activityServiceForm.periodicidade.trim()) {
      nextErrors.periodicidade = "Selecione a periodicidade.";
    }
    setActivityServiceFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function openEditActivityServiceModal(
    equipamentoId: string,
    activityId: string,
    service: PmocActivityServiceItem,
  ) {
    setActivityServiceTargetEquipId(equipamentoId);
    setActivityServiceTargetActivityId(activityId);
    setActivityServiceEditId(service.id);
    setActivityServiceForm({
      descricao: service.descricao,
      periodicidade: service.periodicidade,
      obrigatorio: service.obrigatorio,
      exige_foto: service.exige_foto,
      ativo: service.ativo,
      tempo_estimado: service.tempo_estimado ?? "",
      observacao: service.observacao,
    });
    setActivityServiceFormErrors({});
    setActivityServiceModalOpen(true);
  }

  function updateActivityServices(
    equipamentoId: string,
    activityId: string,
    updater: (services: PmocActivityServiceItem[]) => PmocActivityServiceItem[],
  ) {
    updateScheduleActivities(equipamentoId, (activities) =>
      activities.map((activity) =>
        activity.id === activityId ? { ...activity, servicos: sortServices(updater(activity.servicos)) } : activity,
      ),
    );
  }

  function toggleActivityServiceActive(equipamentoId: string, activityId: string, serviceId: string) {
    updateActivityServices(equipamentoId, activityId, (services) =>
      services.map((service) => (service.id === serviceId ? { ...service, ativo: !service.ativo } : service)),
    );
  }

  function toggleActivityServiceObrigatorio(equipamentoId: string, activityId: string, serviceId: string) {
    updateActivityServices(equipamentoId, activityId, (services) =>
      services.map((service) =>
        service.id === serviceId ? { ...service, obrigatorio: !service.obrigatorio } : service,
      ),
    );
  }

  function toggleActivityServiceExigeFoto(equipamentoId: string, activityId: string, serviceId: string) {
    updateActivityServices(equipamentoId, activityId, (services) =>
      services.map((service) => (service.id === serviceId ? { ...service, exige_foto: !service.exige_foto } : service)),
    );
  }

  function removeActivityService(equipamentoId: string, activityId: string, serviceId: string) {
    updateActivityServices(equipamentoId, activityId, (services) =>
      services.filter((service) => service.id !== serviceId),
    );
  }

  function saveEditedActivityService() {
    if (!activityServiceTargetEquipId || !activityServiceTargetActivityId || !activityServiceEditId) return;
    if (!validateActivityServiceForm()) return;
    updateActivityServices(activityServiceTargetEquipId, activityServiceTargetActivityId, (services) =>
      services.map((service) =>
        service.id === activityServiceEditId
          ? {
              ...service,
              descricao: activityServiceForm.descricao.trim(),
              periodicidade: activityServiceForm.periodicidade,
              obrigatorio: activityServiceForm.obrigatorio,
              exige_foto: activityServiceForm.exige_foto,
              ativo: activityServiceForm.ativo,
              tempo_estimado: activityServiceForm.tempo_estimado.trim(),
              observacao: activityServiceForm.observacao.trim().slice(0, SERVICE_OBSERVACAO_MAX),
            }
          : service,
      ),
    );
    setActivityServiceModalOpen(false);
  }

  function saveNewActivityService() {
    if (!activityServiceTargetEquipId || !activityServiceTargetActivityId) return;
    if (!activityServiceForm.descricao.trim()) {
      toast.error("Informe a descrição do serviço.");
      return;
    }
    const targetBundle = equipamentoCronograma.find((row) => row.equipamento_id === activityServiceTargetEquipId);
    const targetActivity = targetBundle?.atividades.find((row) => row.id === activityServiceTargetActivityId);
    if (!targetActivity) return;

    const newService: PmocActivityServiceItem = {
      id: createServiceId(),
      descricao: activityServiceForm.descricao.trim(),
      periodicidade: activityServiceForm.periodicidade,
      obrigatorio: activityServiceForm.obrigatorio,
      exige_foto: activityServiceForm.exige_foto,
      ativo: activityServiceForm.ativo,
      tempo_estimado: "",
      observacao: activityServiceForm.observacao.trim(),
      personalizado: true,
    };

    const targetTypeKey =
      flattenedEquipments.find((row) => row.id === activityServiceTargetEquipId)?.equipamento.tipo ?? "";
    const targetTypeNormalized = normalizeEquipmentTypeKey(targetTypeKey);
    const targetActivityName = targetActivity.nome.trim().toLowerCase();

    setDraft((prev) => ({
      ...prev,
      equipamento_cronograma: (prev.equipamento_cronograma ?? []).map((bundle) => {
        if (serviceApplyScope === "equipment" && bundle.equipamento_id !== activityServiceTargetEquipId) {
          return bundle;
        }
        if (serviceApplyScope === "type") {
          const equipmentRow = flattenedEquipments.find((row) => row.id === bundle.equipamento_id);
          if (!equipmentRow || normalizeEquipmentTypeKey(equipmentRow.equipamento.tipo) !== targetTypeNormalized) {
            return bundle;
          }
        }

        return {
          ...bundle,
          atividades: sortActivities(
            bundle.atividades.map((activity) => {
              if (serviceApplyScope === "equipment" && activity.id !== activityServiceTargetActivityId) {
                return activity;
              }
              if (serviceApplyScope !== "equipment" && activity.nome.trim().toLowerCase() !== targetActivityName) {
                return activity;
              }
              const exists = activity.servicos.some(
                (service) => service.descricao.trim().toLowerCase() === newService.descricao.trim().toLowerCase(),
              );
              if (exists) return activity;
              return {
                ...activity,
                servicos: sortServices([...activity.servicos, { ...newService, id: createServiceId() }]),
              };
            }),
          ),
        };
      }),
    }));
    setActivityServiceCreateModalOpen(false);
  }

  function yesNoLabel(value: boolean): string {
    return value ? "Sim" : "Não";
  }

  function periodicityBadgeClass(periodicidade: string): string {
    const order = PERIODICITY_ORDER[periodicidade] ?? 99;
    if (order <= 1) return ui.schedulePeriodicityMensal;
    if (order <= 3) return ui.schedulePeriodicityTrimestral;
    if (order <= 4) return ui.schedulePeriodicitySemestral;
    return ui.schedulePeriodicityDefault;
  }

  function handleOpenAddEquipmentFromStepFour() {
    const firstAmbiente = draft.pmocAmbientes[0];
    if (!firstAmbiente) {
      toast.error("Adicione um ambiente antes de cadastrar equipamentos.");
      return;
    }
    openEquipamentoModal(firstAmbiente.id);
  }

  async function handleSaveAndContinue() {
    if (step === 1) {
      const stepErrors = validateStepOne(draft);
      const hasError = Object.values(stepErrors).some(Boolean);
      if (hasError) {
        setErrors(stepErrors);
        toast.error("Preencha os campos obrigatórios para continuar.");
        return;
      }

      if (!selectedClientId) {
        setErrors((prev) => ({ ...prev, cliente: "Selecione um cliente válido." }));
        toast.error("Selecione o cliente para criar o PMOC.");
        return;
      }

      // Nesta fase o fluxo salva localmente para evitar validações incompletas no backend.
      // A criação definitiva no backend ocorre nas etapas posteriores do wizard.
    }

    if (step === 2) {
      const stepErrors = validateStepTwo(draft.responsavelTecnico);
      const hasError = Object.values(stepErrors).some(Boolean);
      if (hasError) {
        setResponsavelErrors(stepErrors);
        toast.error("Preencha os dados obrigatórios do responsável técnico.");
        return;
      }
    }

    if (step === 3) {
      if (draft.pmocAmbientes.length < 1) {
        toast.error("Adicione ao menos um ambiente para continuar.");
        return;
      }
      const totalEquip = draft.pmocAmbientes.reduce((acc, row) => acc + row.equipamentos.length, 0);
      if (totalEquip < 1) {
        toast.error("Adicione ao menos um equipamento em algum ambiente.");
        return;
      }
    }

    if (step === 4) {
      if (flattenedEquipments.length < 1) {
        toast.error("Cadastre ao menos um equipamento para montar o cronograma.");
        return;
      }
      const allHaveActive = flattenedEquipments.every((equipmentRow) => {
        const bundle = (draft.equipamento_cronograma ?? []).find((row) => row.equipamento_id === equipmentRow.id);
        return equipmentHasActiveServices(bundle);
      });
      if (!allHaveActive) {
        toast.error("Cada equipamento deve ter ao menos uma atividade com serviço ativo no cronograma.");
        return;
      }
    }

    const nextStep = Math.min(6, step + 1) as StepId;
    setStep(nextStep);
    toast.success(nextStep === step ? "Etapa final concluída." : `Etapa ${step} salva. Avançando...`);
  }

  if (!ctx) return <Navigate to="/login" replace />;

  return (
    <section className={ui.page}>
      <div className={ui.pageContainer}>
        <header className={ui.pageHead}>
          <div>
            <h1 className={ui.title}>Novo PMOC</h1>
            <p className={ui.subtitle}>Siga os passos para criar um novo PMOC</p>
          </div>
        </header>

        <ol className={ui.stepper} aria-label="Etapas do formulário PMOC">
          {STEPS.map((item, index) => {
            const active = item.id === step;
            const done = item.id < step;
            return (
              <li key={item.id} className={ui.stepItem}>
                <div className={ui.stepNodeRow}>
                  <div className={`${ui.stepDot} ${active ? ui.stepDotActive : done ? ui.stepDotDone : ""}`}>
                    {done ? <CheckIcon size={15} /> : item.id}
                  </div>
                  {index < STEPS.length - 1 ? (
                    <span className={`${ui.stepConnector} ${done ? ui.stepConnectorDone : ""}`} aria-hidden />
                  ) : null}
                </div>
                <span className={`${ui.stepLabel} ${active ? ui.stepLabelActive : ""}`}>{item.label}</span>
              </li>
            );
          })}
        </ol>

        <div className={ui.layout}>
          <main className={ui.main}>
            {step === 1 ? (
              <>
                <article className={ui.card}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <ClipboardList size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Informações gerais</h2>
                      <p className={ui.cardSubtitle}>Dados iniciais para identificação do plano PMOC.</p>
                    </div>
                  </div>
                  <div className={ui.gridForm}>
                    <label className={ui.field}>
                      <span className={ui.label}>Cliente *</span>
                      <ClientCombobox
                        id="pmoc-novo-cliente"
                        className={ui.pmocCombobox}
                        clientes={clientComboboxItems}
                        value={selectedClientId ? String(selectedClientId) : ""}
                        onChange={handleClientComboboxChange}
                        placeholder={loadingClients ? "Carregando clientes..." : "Selecione o cliente"}
                        searchPlaceholder="Digite para buscar cliente..."
                        emptyMessage="Nenhum cliente encontrado."
                        error={!!errors.cliente}
                        disabled={loadingClients}
                      />
                      {errors.cliente ? <span className={ui.errorText}>{errors.cliente}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Unidade / Local *</span>
                      <ClientCombobox
                        id="pmoc-novo-site"
                        className={ui.pmocCombobox}
                        clientes={siteComboboxItems}
                        value={selectedSiteComboboxValue}
                        onChange={handleSiteComboboxChange}
                        placeholder={
                          !selectedClientId
                            ? "Selecione o cliente primeiro"
                            : loadingSites
                              ? "Carregando unidades..."
                              : !hasClientSites
                                ? "Cliente sem filial: usando cadastro principal"
                                : "Selecione unidade/local"
                        }
                        searchPlaceholder="Digite para buscar unidade/local..."
                        emptyMessage="Nenhuma unidade encontrada."
                        error={!!errors.unidadeLocal}
                        disabled={!selectedClientId || loadingSites || !hasClientSites}
                      />
                      <div className={ui.fieldHintRow}>
                        {selectedClientId && !loadingSites && !hasClientSites ? (
                          <span className={ui.fieldHint}>
                            Sem filial cadastrada. Será utilizada automaticamente a matriz.
                          </span>
                        ) : null}
                        {errors.unidadeLocal ? <span className={ui.errorText}>{errors.unidadeLocal}</span> : null}
                      </div>
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Nome do PMOC *</span>
                      <input
                        className={fieldClass("nomePmoc")}
                        value={draft.nomePmoc}
                        onChange={(e) => updateField("nomePmoc", e.target.value)}
                        placeholder="Nome de identificação do plano"
                      />
                      {errors.nomePmoc ? <span className={ui.errorText}>{errors.nomePmoc}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Data de início da vigência *</span>
                      <input
                        type="date"
                        className={fieldClass("vigenciaInicio")}
                        value={draft.vigenciaInicio}
                        onChange={(e) => updateField("vigenciaInicio", e.target.value)}
                      />
                      {errors.vigenciaInicio ? <span className={ui.errorText}>{errors.vigenciaInicio}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Data final da vigência *</span>
                      <input
                        type="date"
                        className={fieldClass("vigenciaFim")}
                        value={draft.vigenciaFim}
                        onChange={(e) => updateField("vigenciaFim", e.target.value)}
                      />
                      {errors.vigenciaFim ? <span className={ui.errorText}>{errors.vigenciaFim}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Periodicidade das manutenções *</span>
                      <select
                        className={fieldClass("periodicidade")}
                        value={draft.periodicidade}
                        onChange={(e) => updateField("periodicidade", e.target.value)}
                      >
                        <option value="">Selecione</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                      </select>
                      {errors.periodicidade ? <span className={ui.errorText}>{errors.periodicidade}</span> : null}
                    </label>
                    <label className={`${ui.field} ${ui.fullRow}`}>
                      <span className={ui.label}>Descrição / Observações</span>
                      <textarea
                        className={`${ui.input} ${ui.textarea}`}
                        value={draft.descricao}
                        onChange={(e) => updateField("descricao", e.target.value)}
                        placeholder="Informações adicionais para o PMOC"
                      />
                    </label>
                  </div>
                </article>

                <article className={ui.card}>
                  <div className={ui.cardHeaderInline}>
                    <div className={ui.cardHeader}>
                      <span className={ui.cardHeaderIcon}>
                        <MapPinned size={17} />
                      </span>
                      <div>
                        <h2 className={ui.cardTitle}>Endereço da instalação</h2>
                        <p className={ui.cardSubtitle}>Local de execução das manutenções e inspeções.</p>
                      </div>
                    </div>
                    <label className={ui.switchControl}>
                      <input
                        type="checkbox"
                        checked={draft.usarEnderecoCliente}
                        onChange={(e) => updateField("usarEnderecoCliente", e.target.checked)}
                      />
                      <span className={ui.switchTrack}>
                        <span className={ui.switchThumb} />
                      </span>
                      <span className={ui.switchLabel}>Usar endereço do cliente</span>
                    </label>
                  </div>
                  <div className={ui.gridAddress}>
                    <label className={ui.field}>
                      <span className={ui.label}>CEP</span>
                      <input
                        className={ui.input}
                        value={draft.cep}
                        onChange={(e) => updateField("cep", e.target.value)}
                        placeholder="00000-000"
                      />
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Endereço *</span>
                      <input
                        className={fieldClass("endereco")}
                        value={draft.endereco}
                        onChange={(e) => updateField("endereco", e.target.value)}
                      />
                      {errors.endereco ? <span className={ui.errorText}>{errors.endereco}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Número *</span>
                      <input
                        className={fieldClass("numero")}
                        value={draft.numero}
                        onChange={(e) => updateField("numero", e.target.value)}
                      />
                      {errors.numero ? <span className={ui.errorText}>{errors.numero}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Complemento</span>
                      <input
                        className={ui.input}
                        value={draft.complemento}
                        onChange={(e) => updateField("complemento", e.target.value)}
                      />
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Bairro *</span>
                      <input
                        className={fieldClass("bairro")}
                        value={draft.bairro}
                        onChange={(e) => updateField("bairro", e.target.value)}
                      />
                      {errors.bairro ? <span className={ui.errorText}>{errors.bairro}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Cidade *</span>
                      <input
                        className={fieldClass("cidade")}
                        value={draft.cidade}
                        onChange={(e) => updateField("cidade", e.target.value)}
                      />
                      {errors.cidade ? <span className={ui.errorText}>{errors.cidade}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Estado *</span>
                      <input
                        className={fieldClass("estado")}
                        value={draft.estado}
                        onChange={(e) => updateField("estado", e.target.value)}
                        placeholder="UF"
                      />
                      {errors.estado ? <span className={ui.errorText}>{errors.estado}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Referência</span>
                      <input
                        className={ui.input}
                        value={draft.referencia}
                        onChange={(e) => updateField("referencia", e.target.value)}
                      />
                    </label>
                  </div>
                </article>

                <article className={ui.card}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <Snowflake size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Classificação do ambiente</h2>
                      <p className={ui.cardSubtitle}>Parâmetros que influenciam frequência e criticidade.</p>
                    </div>
                  </div>
                  <div className={ui.gridForm}>
                    <label className={ui.field}>
                      <span className={ui.label}>Tipo de ambiente *</span>
                      <select
                        className={fieldClass("tipoAmbiente")}
                        value={draft.tipoAmbiente}
                        onChange={(e) => updateField("tipoAmbiente", e.target.value)}
                      >
                        <option value="">Selecione</option>
                        <option value="comercial">Comercial</option>
                        <option value="hospitalar">Hospitalar</option>
                        <option value="industrial">Industrial</option>
                        <option value="escolar">Escolar</option>
                      </select>
                      {errors.tipoAmbiente ? <span className={ui.errorText}>{errors.tipoAmbiente}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Classificação *</span>
                      <select
                        className={fieldClass("classificacao")}
                        value={draft.classificacao}
                        onChange={(e) => updateField("classificacao", e.target.value)}
                      >
                        <option value="">Selecione</option>
                        <option value="baixo_risco">Baixo risco</option>
                        <option value="medio_risco">Médio risco</option>
                        <option value="alto_risco">Alto risco</option>
                      </select>
                      {errors.classificacao ? <span className={ui.errorText}>{errors.classificacao}</span> : null}
                    </label>
                  </div>
                  <div className={ui.infoBox}>
                    A classificação do ambiente influencia a periodicidade mínima das manutenções e análises.
                  </div>
                </article>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <article className={ui.card}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <UserCircle2 size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Responsável técnico</h2>
                      <p className={ui.cardSubtitle}>Informe os dados do responsável técnico pelo PMOC.</p>
                    </div>
                  </div>
                  <div className={ui.gridForm}>
                    <label className={ui.field}>
                      <span className={ui.label}>Nome completo *</span>
                      <input
                        className={responsibleFieldClass("nome")}
                        value={draft.responsavelTecnico.nome}
                        onChange={(e) => updateResponsavelField("nome", e.target.value)}
                        placeholder="Digite o nome completo"
                      />
                      {responsavelErrors.nome ? <span className={ui.errorText}>{responsavelErrors.nome}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Registro profissional (CREA/CAU) *</span>
                      <input
                        className={responsibleFieldClass("registro")}
                        value={draft.responsavelTecnico.registro}
                        onChange={(e) => updateResponsavelField("registro", e.target.value)}
                        placeholder="Ex.: 5062440861"
                      />
                      {responsavelErrors.registro ? <span className={ui.errorText}>{responsavelErrors.registro}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>UF do registro *</span>
                      <select
                        className={responsibleFieldClass("uf")}
                        value={draft.responsavelTecnico.uf}
                        onChange={(e) => updateResponsavelField("uf", e.target.value)}
                      >
                        <option value="">Selecione o estado</option>
                        {UF_OPTIONS.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                      {responsavelErrors.uf ? <span className={ui.errorText}>{responsavelErrors.uf}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Título profissional *</span>
                      <select
                        className={responsibleFieldClass("titulo")}
                        value={draft.responsavelTecnico.titulo}
                        onChange={(e) => updateResponsavelField("titulo", e.target.value)}
                      >
                        <option value="">Selecione o título profissional</option>
                        {PROFESSIONAL_TITLES.map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                      </select>
                      {responsavelErrors.titulo ? <span className={ui.errorText}>{responsavelErrors.titulo}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Número ART / RRT *</span>
                      <input
                        className={responsibleFieldClass("art")}
                        value={draft.responsavelTecnico.art}
                        onChange={(e) => updateResponsavelField("art", e.target.value)}
                        placeholder="Digite o número da ART ou RRT"
                      />
                      {responsavelErrors.art ? <span className={ui.errorText}>{responsavelErrors.art}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Data da ART / RRT *</span>
                      <input
                        type="date"
                        className={responsibleFieldClass("dataArt")}
                        value={draft.responsavelTecnico.dataArt}
                        onChange={(e) => updateResponsavelField("dataArt", e.target.value)}
                      />
                      {responsavelErrors.dataArt ? <span className={ui.errorText}>{responsavelErrors.dataArt}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>E-mail *</span>
                      <input
                        type="email"
                        className={responsibleFieldClass("email")}
                        value={draft.responsavelTecnico.email}
                        onChange={(e) => updateResponsavelField("email", e.target.value)}
                        placeholder="exemplo@email.com"
                      />
                      {responsavelErrors.email ? <span className={ui.errorText}>{responsavelErrors.email}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Telefone *</span>
                      <input
                        className={responsibleFieldClass("telefone")}
                        value={draft.responsavelTecnico.telefone}
                        onChange={(e) => updateResponsavelField("telefone", applyPhoneMask(e.target.value))}
                        placeholder="(11) 99999-9999"
                      />
                      {responsavelErrors.telefone ? <span className={ui.errorText}>{responsavelErrors.telefone}</span> : null}
                    </label>
                    <label className={ui.field}>
                      <span className={ui.label}>Empresa / Contratada</span>
                      <input
                        className={ui.input}
                        value={draft.responsavelTecnico.empresa}
                        onChange={(e) => updateResponsavelField("empresa", e.target.value)}
                        placeholder="Nome da empresa (opcional)"
                      />
                    </label>
                    <label className={`${ui.field} ${ui.fullRow}`}>
                      <span className={ui.label}>Endereço profissional</span>
                      <input
                        className={ui.input}
                        value={draft.responsavelTecnico.endereco}
                        onChange={(e) => updateResponsavelField("endereco", e.target.value)}
                        placeholder="Endereço profissional (opcional)"
                      />
                    </label>
                  </div>
                </article>

                <article className={ui.card}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <Paperclip size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Anexos do responsável técnico</h2>
                      <p className={ui.cardSubtitle}>Envie os documentos do responsável técnico.</p>
                    </div>
                  </div>
                  <input
                    ref={responsibleFilesInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    className={ui.hiddenFileInput}
                    onChange={(e) => handleAttachResponsibleFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    className={ui.uploadArea}
                    onClick={() => responsibleFilesInputRef.current?.click()}
                  >
                    <CloudUpload size={30} />
                    <p className={ui.uploadTitle}>Arraste os arquivos aqui ou clique para selecionar</p>
                    <p className={ui.uploadHint}>PDF, JPG ou PNG até 10MB</p>
                  </button>
                  {draft.responsavelTecnico.anexos.length > 0 ? (
                    <p className={ui.uploadCount}>
                      {draft.responsavelTecnico.anexos.length} arquivo(s) selecionado(s).
                    </p>
                  ) : null}
                  <div className={ui.suggestedDocs}>
                    <span className={ui.suggestedLabel}>Documentos sugeridos:</span>
                    <div className={ui.suggestedChips}>
                      <span className={ui.suggestedChip}>ART / RRT</span>
                      <span className={ui.suggestedChip}>Certidão</span>
                      <span className={ui.suggestedChip}>Comprovante de registro</span>
                    </div>
                  </div>
                </article>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <article className={`${ui.card} ${ui.step3Card}`}>
                  <div className={ui.cardHeaderActions}>
                    <div className={ui.cardHeader}>
                      <span className={ui.cardHeaderIcon}>
                        <Building2 size={17} />
                      </span>
                      <div>
                        <h2 className={ui.cardTitle}>Ambientes climatizados</h2>
                        <p className={ui.cardSubtitle}>Cadastre os ambientes atendidos pelo PMOC e seus equipamentos.</p>
                        {selectedClientId ? (
                          <p className={ui.cardSubtitle}>
                            Equipamentos da base do cliente em <strong>{selectedSiteName}</strong>:{" "}
                            {loadingCatalogEquipments ? "carregando..." : catalogEquipments.length}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className={ui.inlineActions}>
                      <button type="button" className={ui.btnPrimaryInline} onClick={() => openAmbienteModal()}>
                        <Plus size={15} />
                        Adicionar ambiente
                      </button>
                    </div>
                  </div>

                  <div className={ui.step3List}>
                    {draft.pmocAmbientes.map((ambiente) => (
                      <article key={ambiente.id} className={ui.step3Row}>
                        <section className={ui.step3ColInfo}>
                          <div className={ui.step3Head}>
                            <h4 className={ui.step3Name}>
                              <Building2 size={15} />
                              {ambiente.nome}
                            </h4>
                            <span className={ui.step3TypeBadge}>{ambiente.tipo}</span>
                          </div>

                          <div className={ui.step3Metrics}>
                            <div className={ui.step3Metric}>
                              <span>Área</span>
                              <strong>{ambiente.area_m2} m²</strong>
                            </div>
                            <div className={ui.step3Metric}>
                              <span>Pé direito</span>
                              <strong>{ambiente.pe_direito} m</strong>
                            </div>
                            <div className={ui.step3Metric}>
                              <span>Volume</span>
                              <strong>{ambiente.volume} m³</strong>
                            </div>
                          </div>

                          <div className={ui.step3Schedule}>
                            <span className={ui.step3ScheduleLabel}>
                              <Clock3 size={11} />
                              Horário de funcionamento
                            </span>
                            <span className={ui.step3ScheduleTime}>
                              {ambiente.horario_inicio || "--:--"} às {ambiente.horario_fim || "--:--"}
                            </span>
                            {ambiente.dias_funcionamento.length > 0 ? (
                              <div className={ui.step3Days}>
                                {ambiente.dias_funcionamento.map((day) => (
                                  <span key={`${ambiente.id}-${day}`} className={ui.step3DayChip}>
                                    {day}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </section>

                        <section className={ui.step3ColOccupation}>
                          <span className={ui.step3SectionLabel}>Ocupação</span>
                          <div className={ui.step3OccupationList}>
                            <div className={ui.step3OccupationItem}>
                              <span>
                                <User size={12} />
                                Pessoas fixas
                              </span>
                              <strong>{ambiente.pessoas_fixas}</strong>
                            </div>
                            <div className={ui.step3OccupationItem}>
                              <span>
                                <Users size={12} />
                                Pessoas flutuantes
                              </span>
                              <strong>{ambiente.pessoas_flutuantes}</strong>
                            </div>
                          </div>
                          <span className={ui.step3TotalBadge}>Total {ambiente.total_pessoas} pessoas</span>
                        </section>

                        <section className={ui.step3ColEquip}>
                          <span className={ui.step3SectionLabel}>
                            Equipamentos instalados ({ambiente.equipamentos.length})
                          </span>
                          {ambiente.equipamentos.length > 0 ? (
                            <div className={ui.step3EquipTable}>
                              <div className={ui.step3EquipHead}>
                                <span>TAG</span>
                                <span>Modelo</span>
                                <span>Tipo</span>
                                <span>BTU</span>
                                <span />
                              </div>
                              {ambiente.equipamentos.map((eq) => (
                                <div key={`${ambiente.id}-${eq.tag}`} className={ui.step3EquipRow}>
                                  <span className={ui.step3EquipTag}>{eq.tag || "Sem TAG"}</span>
                                  <span className={ui.step3EquipModel}>
                                    {eq.fabricante} {eq.modelo}
                                  </span>
                                  <span className={`${ui.typeBadge} ${equipmentTypeBadgeClass(eq.tipo)}`}>{eq.tipo}</span>
                                  <span className={ui.step3EquipBtu}>{eq.capacidade_btu} BTU/h</span>
                                  <button
                                    type="button"
                                    className={ui.step3EquipDelete}
                                    onClick={() => removeEquipamento(ambiente.id, eq.tag)}
                                    aria-label={`Remover equipamento ${eq.tag}`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={ui.step3EquipEmpty}>Nenhum equipamento vinculado.</p>
                          )}
                        </section>

                        <aside className={ui.step3ColActions}>
                          <div className={ui.step3Actions}>
                            <button type="button" className={ui.step3ActionBtn} onClick={() => openAmbienteModal(ambiente)}>
                              <Pencil size={14} />
                              Editar ambiente
                            </button>
                            <button
                              type="button"
                              className={`${ui.step3ActionBtn} ${ui.step3ActionBtnAccent}`}
                              onClick={() => openEquipamentoModal(ambiente.id)}
                            >
                              <Plus size={14} />
                              Equipamento
                            </button>
                            <button
                              type="button"
                              className={`${ui.step3ActionBtn} ${ui.step3ActionBtnDanger}`}
                              onClick={() => removeAmbiente(ambiente.id)}
                              aria-label="Excluir ambiente"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </aside>
                      </article>
                    ))}
                  </div>

                  <div className={ui.step3Summary}>
                    <div className={ui.step3SummaryTitle}>
                      <ClipboardList size={16} />
                      Resumo técnico geral
                    </div>
                    <div className={ui.step3SummaryStats}>
                      <div className={ui.step3SummaryStat}>
                        <span>Ambientes</span>
                        <strong>{ambientesSummary.totalAmbientes}</strong>
                      </div>
                      <div className={ui.step3SummaryStat}>
                        <span>Área</span>
                        <strong>{ambientesSummary.areaTotal.toLocaleString("pt-BR")} m²</strong>
                      </div>
                      <div className={ui.step3SummaryStat}>
                        <span>Pessoas</span>
                        <strong>{ambientesSummary.ocupacaoTotal.toLocaleString("pt-BR")}</strong>
                      </div>
                      <div className={ui.step3SummaryStat}>
                        <span>Equipamentos</span>
                        <strong>{ambientesSummary.equipamentosCount}</strong>
                      </div>
                      <div className={ui.step3SummaryStat}>
                        <span>BTU</span>
                        <strong>{ambientesSummary.cargaTotal.toLocaleString("pt-BR")}</strong>
                      </div>
                    </div>
                  </div>
                </article>
              </>
            ) : null}

            {step === 4 ? (
              <article className={ui.card}>
                <div className={ui.cardHeaderActions}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <CalendarDays size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Cronograma de manutenção por equipamento</h2>
                      <p className={ui.cardSubtitle}>
                        Defina as atividades e serviços que serão realizados em cada equipamento conforme sua periodicidade.
                      </p>
                    </div>
                  </div>
                  <div className={ui.inlineActions}>
                    <button type="button" className={ui.btnSecondaryInline} onClick={openCronogramaConfigModal}>
                      <Settings2 size={14} />
                      Configurações gerais
                    </button>
                    <button type="button" className={ui.btnPrimaryInline} onClick={handleOpenAddEquipmentFromStepFour}>
                      <Plus size={14} />
                      Adicionar equipamento
                    </button>
                  </div>
                </div>

                <div className={ui.scheduleGrid}>
                  <section className={ui.scheduleEquipmentsPanel}>
                    <header className={ui.schedulePanelHeader}>
                      <h3>
                        <Snowflake size={16} />
                        Equipamentos cadastrados
                      </h3>
                      <span>{cronogramaEquipamentosFiltrados.length}</span>
                    </header>
                    <label className={ui.scheduleSearchWrap}>
                      <Search size={14} />
                      <input
                        value={cronogramaSearch}
                        onChange={(e) => setCronogramaSearch(e.target.value)}
                        placeholder="Buscar equipamento..."
                      />
                    </label>
                    <div className={ui.scheduleEquipmentsList}>
                      {cronogramaEquipamentosFiltrados.map((row) => {
                        const active = row.id === selectedCronogramaEquipId;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            className={`${ui.scheduleEquipmentItem} ${active ? ui.scheduleEquipmentItemActive : ""}`}
                            onClick={() => setSelectedCronogramaEquipId(row.id)}
                          >
                            <div className={ui.scheduleEquipmentHead}>
                              <strong>{row.equipamento.tag || "Sem TAG"}</strong>
                              <span>{row.equipamento.capacidade_btu || "--"} BTU/h</span>
                            </div>
                            <p>{row.equipamento.fabricante} {row.equipamento.modelo}</p>
                            <small>{row.equipamento.tipo}</small>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" className={ui.scheduleAddEquipmentBtn} onClick={handleOpenAddEquipmentFromStepFour}>
                      <Plus size={14} />
                      Adicionar equipamento
                    </button>
                  </section>

                  <section className={ui.scheduleDetailsPanel}>
                    {cronogramaEquipamentoSelecionado ? (
                      <>
                        <header className={ui.scheduleDetailsHeader}>
                          <div>
                            <h3>
                              {cronogramaEquipamentoSelecionado.equipamento.tag} - {cronogramaEquipamentoSelecionado.equipamento.fabricante}{" "}
                              {cronogramaEquipamentoSelecionado.equipamento.modelo}
                            </h3>
                            <div className={ui.scheduleEquipmentMeta}>
                              <span className={`${ui.typeBadge} ${equipmentTypeBadgeClass(cronogramaEquipamentoSelecionado.equipamento.tipo)}`}>
                                {cronogramaEquipamentoSelecionado.equipamento.tipo}
                              </span>
                              <span>{cronogramaEquipamentoSelecionado.equipamento.capacidade_btu || "--"} BTU/h</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={ui.iconBtnWide}
                            onClick={() => openEquipamentoModal(cronogramaEquipamentoSelecionado.ambienteId, cronogramaEquipamentoSelecionado.equipamento)}
                          >
                            <Pencil size={14} />
                            Editar equipamento
                          </button>
                        </header>

                        <div className={ui.scheduleInfoGrid}>
                          <article>
                            <small>Ambiente</small>
                            <strong>{cronogramaEquipamentoSelecionado.ambienteNome}</strong>
                          </article>
                          <article>
                            <small>Periodicidade padrão</small>
                            <strong>{draft.periodicidade ? draft.periodicidade[0].toUpperCase() + draft.periodicidade.slice(1) : "Mensal"}</strong>
                          </article>
                          <article>
                            <small>Última execução</small>
                            <strong>--</strong>
                          </article>
                          <article>
                            <small>Próxima execução</small>
                            <strong>10/07/2026</strong>
                          </article>
                          <article>
                            <small>Responsável</small>
                            <strong>Equipe técnica</strong>
                          </article>
                        </div>

                        <section className={ui.scheduleServicesSection}>
                          <div className={ui.scheduleServicesHead}>
                            <div>
                              <h4>Serviços deste equipamento</h4>
                              <p>
                                As atividades abaixo são sugeridas conforme o tipo do equipamento. Você pode editar,
                                adicionar ou remover serviços.
                              </p>
                            </div>
                            <button
                              type="button"
                              className={ui.btnPrimaryInline}
                              onClick={() => openAddActivityModal(cronogramaEquipamentoSelecionado.id)}
                            >
                              <Plus size={14} />
                              Adicionar atividade
                            </button>
                          </div>

                          <div className={ui.scheduleActivitiesList}>
                            {cronogramaAtividadesAtuais.map((activity) => {
                              const expanded = expandedActivityIds.has(activity.id);
                              const activeServicesCount = activity.servicos.filter((service) => service.ativo).length;
                              return (
                                <article
                                  key={activity.id}
                                  className={`${ui.scheduleActivityCard} ${!activity.ativo ? ui.scheduleActivityCardInactive : ""}`}
                                >
                                  <header className={ui.scheduleActivityHeader}>
                                    <button
                                      type="button"
                                      className={ui.scheduleActivityToggle}
                                      onClick={() => toggleActivityExpanded(activity.id)}
                                      aria-expanded={expanded}
                                    >
                                      <ChevronDown
                                        size={16}
                                        className={expanded ? ui.scheduleActivityChevronOpen : ui.scheduleActivityChevron}
                                      />
                                      <div className={ui.scheduleActivityTitleWrap}>
                                        <strong>{activity.nome}</strong>
                                        <span className={ui.scheduleActivitySummary}>
                                          {activity.servicos.length} serviços • {activeServicesCount} ativos
                                          {activity.tempo_estimado ? ` • ${activity.tempo_estimado}` : ""}
                                        </span>
                                      </div>
                                    </button>
                                    <div className={ui.scheduleActivityActions}>
                                      <button
                                        type="button"
                                        className={ui.iconBtn}
                                        onClick={() => openEditActivityModal(cronogramaEquipamentoSelecionado.id, activity)}
                                        aria-label={`Editar atividade ${activity.nome}`}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className={ui.iconBtn}
                                        onClick={() => duplicateActivity(cronogramaEquipamentoSelecionado.id, activity)}
                                        aria-label={`Duplicar atividade ${activity.nome}`}
                                      >
                                        <Copy size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                                        onClick={() => removeActivity(cronogramaEquipamentoSelecionado.id, activity.id)}
                                        aria-label={`Excluir atividade ${activity.nome}`}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </header>

                                  {expanded ? (
                                    <div className={ui.scheduleActivityBody}>
                                      <div className={ui.scheduleActivityServicesHead}>
                                        <span>Serviços da atividade</span>
                                        <button
                                          type="button"
                                          className={ui.scheduleAddServiceBtn}
                                          onClick={() =>
                                            openAddActivityServiceModal(cronogramaEquipamentoSelecionado.id, activity.id)
                                          }
                                        >
                                          <Plus size={13} />
                                          Serviço
                                        </button>
                                      </div>
                                      {activity.servicos.length > 0 ? (
                                        <div className={ui.scheduleActivityTableWrap}>
                                          <table className={ui.scheduleActivityTable}>
                                            <thead>
                                              <tr>
                                                <th>Serviço</th>
                                                <th>Periodicidade</th>
                                                <th>Obrigatório</th>
                                                <th>Exige foto</th>
                                                <th>Status</th>
                                                <th>Ações</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {activity.servicos.map((service) => (
                                                <tr key={service.id}>
                                                  <td>
                                                    <strong className={!service.ativo ? ui.scheduleActivityServiceTextInactive : ""}>
                                                      {service.descricao}
                                                    </strong>
                                                  </td>
                                                  <td>
                                                    <span
                                                      className={`${ui.schedulePeriodicityBadge} ${periodicityBadgeClass(service.periodicidade)}`}
                                                    >
                                                      {service.periodicidade}
                                                    </span>
                                                  </td>
                                                  <td>
                                                    <button
                                                      type="button"
                                                      className={`${ui.scheduleMiniToggle} ${service.obrigatorio ? ui.scheduleMiniToggleOn : ""}`}
                                                      onClick={() =>
                                                        toggleActivityServiceObrigatorio(
                                                          cronogramaEquipamentoSelecionado.id,
                                                          activity.id,
                                                          service.id,
                                                        )
                                                      }
                                                    >
                                                      {yesNoLabel(service.obrigatorio)}
                                                    </button>
                                                  </td>
                                                  <td>
                                                    <button
                                                      type="button"
                                                      className={`${ui.scheduleMiniToggle} ${service.exige_foto ? ui.scheduleMiniToggleOn : ""}`}
                                                      onClick={() =>
                                                        toggleActivityServiceExigeFoto(
                                                          cronogramaEquipamentoSelecionado.id,
                                                          activity.id,
                                                          service.id,
                                                        )
                                                      }
                                                    >
                                                      {yesNoLabel(service.exige_foto)}
                                                    </button>
                                                  </td>
                                                  <td>
                                                    <label className={ui.scheduleSwitch}>
                                                      <input
                                                        type="checkbox"
                                                        checked={service.ativo}
                                                        onChange={() =>
                                                          toggleActivityServiceActive(
                                                            cronogramaEquipamentoSelecionado.id,
                                                            activity.id,
                                                            service.id,
                                                          )
                                                        }
                                                      />
                                                      <span className={ui.scheduleSwitchTrack}>
                                                        <span className={ui.scheduleSwitchThumb} />
                                                      </span>
                                                    </label>
                                                  </td>
                                                  <td>
                                                    <div className={ui.scheduleActions}>
                                                      <button
                                                        type="button"
                                                        className={ui.iconBtn}
                                                        onClick={() =>
                                                          openEditActivityServiceModal(
                                                            cronogramaEquipamentoSelecionado.id,
                                                            activity.id,
                                                            service,
                                                          )
                                                        }
                                                        aria-label={`Editar serviço ${service.descricao}`}
                                                      >
                                                        <Pencil size={12} />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                                                        onClick={() =>
                                                          removeActivityService(
                                                            cronogramaEquipamentoSelecionado.id,
                                                            activity.id,
                                                            service.id,
                                                          )
                                                        }
                                                        aria-label={`Remover serviço ${service.descricao}`}
                                                      >
                                                        <Trash2 size={12} />
                                                      </button>
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className={ui.scheduleActivityEmpty}>Nenhum serviço nesta atividade.</p>
                                      )}
                                      <button
                                        type="button"
                                        className={ui.scheduleAddServiceInlineBtn}
                                        onClick={() =>
                                          openAddActivityServiceModal(cronogramaEquipamentoSelecionado.id, activity.id)
                                        }
                                      >
                                        <Plus size={14} />
                                        Adicionar serviço nesta atividade
                                      </button>
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      </>
                    ) : (
                      <p className={ui.sideText}>Selecione um equipamento para configurar o cronograma.</p>
                    )}
                  </section>
                </div>
              </article>
            ) : null}

            {step === 5 ? (
              <article className={ui.card}>
                <div className={ui.cardHeaderActions}>
                  <div className={ui.cardHeader}>
                    <span className={ui.cardHeaderIcon}>
                      <FileText size={17} />
                    </span>
                    <div>
                      <h2 className={ui.cardTitle}>Documentos do PMOC</h2>
                      <p className={ui.cardSubtitle}>
                        Anexe e organize todos os documentos necessários para o Plano de Manutenção, Operação e
                        Controle.
                      </p>
                    </div>
                  </div>
                  <div className={ui.inlineActions}>
                    <button type="button" className={ui.btnSecondaryInline} onClick={() => setDocumentConfigModalOpen(true)}>
                      <Settings2 size={14} />
                      Configurações de documentos
                    </button>
                    <button type="button" className={ui.btnPrimaryInline} onClick={openDocumentUploadModal}>
                      <Plus size={14} />
                      Adicionar documento
                    </button>
                  </div>
                </div>

                <section className={ui.docsCategoriesSection}>
                  <h3 className={ui.docsSectionTitle}>Categorias de documentos</h3>
                  <div className={ui.docsCategoriesGrid}>
                    {DOCUMENT_CATEGORIES.map((category) => {
                      const Icon = category.icon;
                      return (
                        <article key={category.id} className={ui.docsCategoryCard}>
                          <div className={`${ui.docsCategoryIcon} ${getCategoryToneClass(category.tone, ui)}`}>
                            <Icon size={20} />
                          </div>
                          <h4>{category.nome}</h4>
                          <p>{category.descricao}</p>
                          <span className={ui.docsCategoryCount}>
                            {documentCategoryCounts[category.id] ?? 0} documento
                            {(documentCategoryCounts[category.id] ?? 0) === 1 ? "" : "s"}
                          </span>
                          <ul className={ui.docsCategoryItems}>
                            {category.itensEsperados.slice(0, 3).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                            {category.itensEsperados.length > 3 ? (
                              <li className={ui.docsCategoryMore}>+{category.itensEsperados.length - 3} itens</li>
                            ) : null}
                          </ul>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className={ui.docsTableSection}>
                  <div className={ui.docsTableHeader}>
                    <h3 className={ui.docsSectionTitle}>Documentos anexados</h3>
                    <div className={ui.docsFilters}>
                      <label className={ui.docsSearchWrap}>
                        <Search size={14} />
                        <input
                          value={docSearch}
                          onChange={(e) => setDocSearch(e.target.value)}
                          placeholder="Buscar documentos..."
                        />
                      </label>
                      <select
                        className={ui.docsFilterSelect}
                        value={docCategoryFilter}
                        onChange={(e) => setDocCategoryFilter(e.target.value)}
                      >
                        <option value="all">Todas as categorias</option>
                        {DOCUMENT_CATEGORIES.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.nome}
                          </option>
                        ))}
                      </select>
                      <select
                        className={ui.docsFilterSelect}
                        value={docTypeFilter}
                        onChange={(e) => setDocTypeFilter(e.target.value)}
                      >
                        <option value="all">Todos os tipos</option>
                        {DOCUMENT_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select
                        className={ui.docsFilterSelect}
                        value={docSortOrder}
                        onChange={(e) => setDocSortOrder(e.target.value)}
                      >
                        <option value="recent">Mais recentes</option>
                        <option value="name">Nome A-Z</option>
                        <option value="size">Maior tamanho</option>
                      </select>
                    </div>
                  </div>

                  <div className={ui.docsTableWrap}>
                    <table className={ui.docsTable}>
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Categoria</th>
                          <th>Tipo</th>
                          <th>Arquivo</th>
                          <th>Data</th>
                          <th>Tamanho</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocuments.length > 0 ? (
                          filteredDocuments.map((doc) => (
                            <tr key={doc.id}>
                              <td>
                                <div className={ui.docsDocCell}>
                                  <strong>{doc.nome}</strong>
                                  {doc.status_label ? (
                                    <span
                                      className={`${ui.docsStatusBadge} ${
                                        doc.status === "aprovado"
                                          ? ui.docsStatusApproved
                                          : doc.status === "valido"
                                            ? ui.docsStatusValid
                                            : ""
                                      }`}
                                    >
                                      {doc.status_label}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td>{getCategoryLabel(doc.categoria)}</td>
                              <td>
                                <span className={ui.docsTypeBadge}>{doc.tipo}</span>
                              </td>
                              <td className={ui.docsFileName}>{doc.arquivo_nome || "--"}</td>
                              <td>{formatDateBr(doc.data_upload)}</td>
                              <td>{formatFileSize(doc.tamanho)}</td>
                              <td>
                                <div className={ui.docsActions}>
                                  <button
                                    type="button"
                                    className={ui.iconBtn}
                                    aria-label={`Visualizar ${doc.nome}`}
                                    onClick={() => {
                                      if (doc.arquivo_url) window.open(doc.arquivo_url, "_blank");
                                      else toast.success("Visualização disponível após anexar o arquivo.");
                                    }}
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={ui.iconBtn}
                                    aria-label={`Baixar ${doc.nome}`}
                                    onClick={() => {
                                      if (!doc.arquivo_url) {
                                        toast.success("Download disponível após anexar o arquivo.");
                                        return;
                                      }
                                      const link = document.createElement("a");
                                      link.href = doc.arquivo_url;
                                      link.download = doc.arquivo_nome || doc.nome;
                                      link.click();
                                    }}
                                  >
                                    <Download size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                                    aria-label={`Excluir ${doc.nome}`}
                                    onClick={() => removeDocument(doc.id)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className={ui.docsEmptyRow}>
                              Nenhum documento encontrado com os filtros atuais.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className={ui.docsViewAllBtn}>
                    Ver todos os documentos ({draft.pmoc_documentos.length}) →
                  </button>
                </section>
              </article>
            ) : null}

            {step === 6 ? (
              <article className={ui.card}>
                <div className={ui.cardHeader}>
                  <span className={ui.cardHeaderIcon}>
                    <ClipboardList size={17} />
                  </span>
                  <div>
                    <h2 className={ui.cardTitle}>Revisão e geração do PMOC</h2>
                    <p className={ui.cardSubtitle}>
                      Revise todas as informações antes de gerar o documento final do PMOC.
                    </p>
                  </div>
                </div>

                <div className={ui.reviewNotice} role="note">
                  <Info size={18} aria-hidden />
                  <div>
                    <strong>Quase pronto!</strong>
                    <p>
                      Confira o resumo de todas as etapas. Se necessário, volte e ajuste as informações antes de
                      gerar o documento final.
                    </p>
                  </div>
                </div>

                <div className={ui.reviewStepsList}>
                  {[
                    {
                      id: 1,
                      title: "1. Informações gerais",
                      description: "Dados básicos do PMOC e da empresa",
                      status: "Concluído",
                      icon: CheckCircle2,
                      iconTone: ui.reviewIconGreen,
                      active: false,
                    },
                    {
                      id: 2,
                      title: "2. Responsável técnico",
                      description: "Profissional responsável e equipe técnica",
                      status: "Concluído",
                      icon: UserCircle2,
                      iconTone: ui.reviewIconBlue,
                      active: false,
                    },
                    {
                      id: 3,
                      title: "3. Ambientes e Equipamentos",
                      description: "Ambientes climatizados e equipamentos cadastrados",
                      status: "Concluído",
                      icon: Building2,
                      iconTone: ui.reviewIconPurple,
                      active: false,
                    },
                    {
                      id: 4,
                      title: "4. Cronograma",
                      description: "Atividades, serviços e periodicidades",
                      status: "Concluído",
                      icon: CalendarDays,
                      iconTone: ui.reviewIconOrange,
                      active: false,
                    },
                    {
                      id: 5,
                      title: "5. Documentos",
                      description: "Documentos anexados e organizados",
                      status: "Concluído",
                      icon: FileText,
                      iconTone: ui.reviewIconCyan,
                      active: false,
                    },
                    {
                      id: 6,
                      title: "6. Revisão e geração",
                      description: "Validação final e geração do documento",
                      status: "Em revisão",
                      icon: ClipboardList,
                      iconTone: ui.reviewIconActive,
                      active: true,
                    },
                  ].map((reviewStep) => {
                    const StepIcon = reviewStep.icon;
                    const expanded = expandedReviewSteps.has(reviewStep.id);
                    return (
                      <article
                        key={reviewStep.id}
                        className={`${ui.reviewStepCard} ${reviewStep.active ? ui.reviewStepCardActive : ""}`}
                      >
                        <div className={ui.reviewStepHead}>
                          <span className={`${ui.reviewStepIcon} ${reviewStep.iconTone}`}>
                            {reviewStep.id < 6 ? <CheckCircle2 size={18} /> : <StepIcon size={18} />}
                          </span>
                          <div className={ui.reviewStepMain}>
                            <strong>{reviewStep.title}</strong>
                            <p>{reviewStep.description}</p>
                          </div>
                          <span className={`${ui.reviewStepBadge} ${reviewStep.active ? ui.reviewStepBadgeActive : ui.reviewStepBadgeDone}`}>
                            {reviewStep.status}
                          </span>
                          {reviewStep.id < 6 ? (
                            <button type="button" className={ui.reviewEditBtn} onClick={() => setStep(reviewStep.id as StepId)}>
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={ui.reviewExpandBtn}
                            aria-expanded={expanded}
                            onClick={() => toggleReviewStep(reviewStep.id)}
                          >
                            <ChevronDown size={18} className={expanded ? ui.reviewChevronOpen : ""} />
                          </button>
                        </div>

                        {expanded ? (
                          <div className={ui.reviewStepBody}>
                            {reviewStep.id === 1 ? (
                              <dl className={ui.reviewDetailsGrid}>
                                <div><dt>Cliente</dt><dd>{draft.cliente || selectedClient?.name || "—"}</dd></div>
                                <div><dt>Unidade</dt><dd>{draft.unidadeLocal || selectedSiteName || "—"}</dd></div>
                                <div><dt>Nome PMOC</dt><dd>{draft.nomePmoc || "—"}</dd></div>
                                <div>
                                  <dt>Vigência</dt>
                                  <dd>
                                    {formatDateBr(draft.vigenciaInicio)} até {formatDateBr(draft.vigenciaFim)}
                                  </dd>
                                </div>
                              </dl>
                            ) : null}

                            {reviewStep.id === 2 ? (
                              <dl className={ui.reviewDetailsGrid}>
                                <div><dt>Nome</dt><dd>{draft.responsavelTecnico.nome || "—"}</dd></div>
                                <div>
                                  <dt>CREA/CFT</dt>
                                  <dd>
                                    {[draft.responsavelTecnico.registro, draft.responsavelTecnico.uf].filter(Boolean).join(" / ") || "—"}
                                  </dd>
                                </div>
                                <div><dt>Empresa</dt><dd>{draft.responsavelTecnico.empresa || "—"}</dd></div>
                                <div>
                                  <dt>Contato</dt>
                                  <dd>
                                    {[draft.responsavelTecnico.email, draft.responsavelTecnico.telefone].filter(Boolean).join(" · ") || "—"}
                                  </dd>
                                </div>
                              </dl>
                            ) : null}

                            {reviewStep.id === 3 ? (
                              <dl className={ui.reviewDetailsGrid}>
                                <div><dt>Ambientes</dt><dd>{ambientesSummary.totalAmbientes}</dd></div>
                                <div><dt>Área climatizada</dt><dd>{ambientesSummary.areaTotal.toLocaleString("pt-BR")} m²</dd></div>
                                <div><dt>Pessoas</dt><dd>{ambientesSummary.ocupacaoTotal}</dd></div>
                                <div><dt>Equipamentos</dt><dd>{ambientesSummary.equipamentosCount}</dd></div>
                                <div><dt>Carga térmica</dt><dd>{ambientesSummary.cargaTotal.toLocaleString("pt-BR")} BTU/h</dd></div>
                              </dl>
                            ) : null}

                            {reviewStep.id === 4 ? (
                              <dl className={ui.reviewDetailsGrid}>
                                <div><dt>Equipamentos</dt><dd>{cronogramaReviewStats.equipamentos}</dd></div>
                                <div><dt>Atividades</dt><dd>{cronogramaReviewStats.atividades}</dd></div>
                                <div><dt>Serviços</dt><dd>{cronogramaReviewStats.servicos}</dd></div>
                                <div><dt>Mensais</dt><dd>{cronogramaReviewStats.mensais}</dd></div>
                                <div><dt>Trimestrais</dt><dd>{cronogramaReviewStats.trimestrais}</dd></div>
                                <div><dt>Semestrais</dt><dd>{cronogramaReviewStats.semestrais}</dd></div>
                              </dl>
                            ) : null}

                            {reviewStep.id === 5 ? (
                              <dl className={ui.reviewDetailsGrid}>
                                <div><dt>Documentos anexados</dt><dd>{documentosReviewStats.total}</dd></div>
                                <div>
                                  <dt>Obrigatórios</dt>
                                  <dd>
                                    {documentosReviewStats.obrigatoriosOk}/{documentosReviewStats.obrigatorios || documentosReviewStats.obrigatoriosOk}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Status</dt>
                                  <dd>{documentosReviewStats.completo ? "Completo" : "Pendente"}</dd>
                                </div>
                              </dl>
                            ) : null}

                            {reviewStep.id === 6 ? (
                              <>
                                <section className={ui.reviewValidationSection}>
                                  <h4>Validação do PMOC</h4>
                                  <p>Verificamos os principais pontos para garantir que seu PMOC está completo.</p>
                                  <div className={ui.reviewValidationGrid}>
                                    {[
                                      { ok: pmocValidacoes.informacoes, title: "Informações completas", text: "Todas informações obrigatórias preenchidas." },
                                      { ok: pmocValidacoes.ambientes && pmocValidacoes.equipamentos, title: "Ambientes e equipamentos", text: "Todos ambientes possuem equipamentos vinculados." },
                                      { ok: pmocValidacoes.cronograma, title: "Cronograma", text: "Todos equipamentos possuem atividades e serviços definidos." },
                                      { ok: pmocValidacoes.documentos, title: "Documentos", text: "Documentos obrigatórios anexados." },
                                      { ok: allValidacoesOk, title: "Conformidade", text: "PMOC conforme RDC 9/2003, RE 176/2000 e boas práticas." },
                                    ].map((item) => (
                                      <article key={item.title} className={ui.reviewValidationCard}>
                                        <CheckCircle2 size={18} className={item.ok ? ui.reviewCheckOk : ui.reviewCheckPending} />
                                        <div>
                                          <strong>{item.title}</strong>
                                          <p>{item.text}</p>
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                </section>

                                <section className={ui.reviewGenerateSection}>
                                  <h4>Gerar documento PMOC</h4>
                                  <div className={ui.reviewFormatRow}>
                                    <span>Formato</span>
                                    <label className={ui.reviewFormatOption}>
                                      <input type="radio" name="pmoc-format" checked readOnly />
                                      PDF
                                    </label>
                                  </div>
                                  <div className={ui.reviewIncludeList}>
                                    <span className={ui.reviewIncludeLabel}>Incluir</span>
                                    {PMOC_GENERATION_INCLUDE_OPTIONS.map((option) => (
                                      <label key={option.key} className={ui.reviewIncludeItem}>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(draft.pmoc_revisao.geracao[option.key])}
                                          onChange={(e) => updatePmocGeracaoOption(option.key, e.target.checked)}
                                        />
                                        <span className={ui.reviewIncludeBox} aria-hidden />
                                        {option.label}
                                      </label>
                                    ))}
                                  </div>
                                  <button type="button" className={ui.reviewGenerateMainBtn} onClick={handleGeneratePmoc}>
                                    <FileText size={18} />
                                    Gerar PMOC
                                  </button>
                                </section>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </article>
            ) : null}
          </main>

          <aside className={ui.side}>
            <div className={ui.sideSticky}>
              <article className={ui.card}>
                <h3 className={ui.sideTitle}>Resumo do PMOC</h3>
                {createdPmocId ? <p className={ui.sideText}>Rascunho conectado ao backend: PMOC #{createdPmocId}.</p> : null}
                <ul className={ui.summaryList}>
                  {SUMMARY_ITEMS.map((item, index) => {
                    const Icon = item.icon;
                    const status =
                      index + 1 < step
                        ? { text: "Concluído", className: ui.ok }
                        : index + 1 === step
                          ? {
                              text: step === 6 ? "Em revisão" : "Em preenchimento",
                              className: ui.progress,
                            }
                          : { text: "Pendente", className: ui.pending };
                    return (
                      <li key={item.label} className={ui.summaryItem}>
                        <span className={ui.summaryIconWrap}>
                          <Icon size={16} />
                        </span>
                        <div className={ui.summaryInfo}>
                          <span>{item.label}</span>
                          <strong className={status.className}>{status.text}</strong>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>

              <article className={ui.card}>
                <h3 className={ui.sideTitleWithIcon}>
                  <span className={ui.sideTitleAvatar}>
                    <Bot size={16} />
                  </span>
                  Dicas da Iris
                </h3>
                <p className={ui.sideText}>
                  {step === 2
                    ? "Complete os dados técnicos para validar o responsável pelo PMOC."
                    : step === 3
                      ? "Analisei os ambientes cadastrados. Confira as observações abaixo."
                      : step === 4
                        ? "Cada tipo de equipamento possui serviços específicos conforme sua necessidade técnica."
                        : step === 5
                          ? "Organize bem seus documentos para facilitar auditorias e inspeções."
                          : step === 6
                            ? "Revise atentamente todas as informações antes de gerar o documento final."
                            : "Complete todas as etapas para gerar seu PMOC."}
                </p>
                {step === 3 || step === 4 ? (
                  <div className={ui.irisAlerts}>
                    {(step === 3 ? irisAlerts : cronogramaInsights).length > 0 ? (
                      (step === 3 ? irisAlerts : cronogramaInsights).map((alert) => (
                        <article key={alert.key} className={ui.irisAlertCard}>
                          <p className={ui.irisAlertTitle}>
                            <AlertTriangle size={14} />
                            {alert.title}
                          </p>
                          <p className={ui.irisAlertText}>{alert.detail}</p>
                        </article>
                      ))
                    ) : (
                      <article className={ui.irisAlertCard}>
                        <p className={ui.irisAlertTitle}>
                          <AlertTriangle size={14} />
                          Sem alertas críticos
                        </p>
                        <p className={ui.irisAlertText}>
                          {step === 3
                            ? "Os ambientes e equipamentos cadastrados estão consistentes."
                            : "As atividades padrão do cronograma estão consistentes para os equipamentos selecionados."}
                        </p>
                      </article>
                    )}
                  </div>
                ) : null}
                {step === 5 ? (
                  <div className={ui.irisDocTips}>
                    {IRIS_DOCUMENT_TIPS.map((tip) => (
                      <article key={tip} className={ui.irisDocTipItem}>
                        <CheckCircle2 size={14} />
                        <span>{tip}</span>
                      </article>
                    ))}
                  </div>
                ) : null}
                {step === 6 ? (
                  <div className={ui.irisDocTips}>
                    {IRIS_REVIEW_TIPS.map((tip) => (
                      <article key={tip} className={ui.irisDocTipItem}>
                        <CheckCircle2 size={14} />
                        <span>{tip}</span>
                      </article>
                    ))}
                  </div>
                ) : null}
                <div className={ui.progressTrack}>
                  <div className={ui.progressBar} style={{ width: `${progressPercent}%` }} />
                </div>
                <p className={ui.progressCaption}>
                  {step} de 6 etapas — {progressPercent}%
                </p>
                <div className={ui.successBox}>
                  Fique tranquilo! Seus dados são salvos automaticamente em cada etapa preenchida.
                </div>
              </article>
            </div>
          </aside>
        </div>

        <footer className={ui.footer}>
          {step > 1 ? (
            <button
              type="button"
              className={ui.backBtn}
              onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as StepId) : prev))}
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
          ) : (
            <Link to="/app/pmoc" className={ui.cancelBtn}>
              Cancelar
            </Link>
          )}
          {step === 6 ? (
            <div className={ui.reviewFooterActions}>
              <button type="button" className={ui.reviewFooterPreviewBtn} onClick={handlePreviewPmoc}>
                <Eye size={16} />
                Visualizar prévia
              </button>
              <button type="button" className={ui.reviewFooterGenerateBtn} onClick={handleGeneratePmoc}>
                <FileText size={16} />
                Gerar PMOC
              </button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleSaveAndContinue}
              style={{
                height: "52px",
                borderRadius: "14px",
                fontWeight: 700,
                padding: "0 1.5rem",
                background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                boxShadow: "0 10px 25px rgba(37,99,235,.35)",
              }}
            >
              Salvar e continuar →
            </Button>
          )}
        </footer>
      </div>

      {ambienteModalOpen ? (
        <div className={ui.modalOverlay} role="dialog" aria-modal="true">
          <div className={ui.modalDialog}>
            <div className={ui.modalHeader}>
              <h3>Novo ambiente climatizado</h3>
              <button type="button" className={ui.modalClose} onClick={() => setAmbienteModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={ui.modalGrid}>
              <label className={ui.field}>
                <span className={ui.label}>Nome do ambiente *</span>
                <input
                  className={`${ui.input} ${ambienteFormErrors.nome ? ui.inputError : ""}`}
                  placeholder="Recepção"
                  value={ambienteForm.nome}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Tipo do ambiente *</span>
                <select
                  className={`${ui.input} ${ambienteFormErrors.tipo ? ui.inputError : ""}`}
                  value={ambienteForm.tipo}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, tipo: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {ENVIRONMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Área do ambiente (m²) *</span>
                <input
                  className={`${ui.input} ${ambienteFormErrors.area_m2 ? ui.inputError : ""}`}
                  value={ambienteForm.area_m2}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, area_m2: e.target.value.replace(/\D/g, "") }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Pé direito (metros)</span>
                <input
                  className={ui.input}
                  value={ambienteForm.pe_direito}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, pe_direito: e.target.value.replace(/\D/g, "") }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Volume (m³)</span>
                <input
                  className={ui.input}
                  disabled
                  value={(numericValue(ambienteForm.area_m2) * numericValue(ambienteForm.pe_direito)).toLocaleString("pt-BR")}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Pessoas fixas *</span>
                <input
                  className={`${ui.input} ${ambienteFormErrors.pessoas_fixas ? ui.inputError : ""}`}
                  value={ambienteForm.pessoas_fixas}
                  onChange={(e) =>
                    setAmbienteForm((prev) => ({ ...prev, pessoas_fixas: e.target.value.replace(/\D/g, "") }))
                  }
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Pessoas flutuantes *</span>
                <input
                  className={`${ui.input} ${ambienteFormErrors.pessoas_flutuantes ? ui.inputError : ""}`}
                  value={ambienteForm.pessoas_flutuantes}
                  onChange={(e) =>
                    setAmbienteForm((prev) => ({ ...prev, pessoas_flutuantes: e.target.value.replace(/\D/g, "") }))
                  }
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Total de pessoas</span>
                <input
                  className={ui.input}
                  disabled
                  value={numericValue(ambienteForm.pessoas_fixas) + numericValue(ambienteForm.pessoas_flutuantes)}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Hora inicial</span>
                <input
                  type="time"
                  className={ui.input}
                  value={ambienteForm.horario_inicio}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, horario_inicio: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Hora final</span>
                <input
                  type="time"
                  className={ui.input}
                  value={ambienteForm.horario_fim}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, horario_fim: e.target.value }))}
                />
              </label>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Dias de funcionamento</span>
                <div className={ui.weekdayCheckRow}>
                  {WEEKDAYS.map((day) => {
                    const checked = ambienteForm.dias_funcionamento.includes(day);
                    return (
                      <label key={`weekday-${day}`} className={ui.weekdayCheck}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setAmbienteForm((prev) => ({
                              ...prev,
                              dias_funcionamento: e.target.checked
                                ? [...prev.dias_funcionamento, day]
                                : prev.dias_funcionamento.filter((item) => item !== day),
                            }));
                          }}
                        />
                        <span>{day}</span>
                      </label>
                    );
                  })}
                </div>
              </label>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Observações</span>
                <textarea
                  className={`${ui.input} ${ui.textarea}`}
                  value={ambienteForm.observacoes}
                  onChange={(e) => setAmbienteForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                />
              </label>
            </div>
            <div className={ui.modalActions}>
              <button type="button" className={ui.btnSecondaryInline} onClick={() => setAmbienteModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.btnPrimaryInline} onClick={submitAmbienteModal}>
                Salvar ambiente
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {equipamentoModalOpen ? (
        <div className={ui.modalOverlay} role="dialog" aria-modal="true">
          <div className={ui.modalDialog}>
            <div className={ui.modalHeader}>
              <h3>Novo equipamento</h3>
              <button type="button" className={ui.modalClose} onClick={() => setEquipamentoModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={ui.modalGrid}>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Equipamento cadastrado (opcional)</span>
                <ClientCombobox
                  id="pmoc-novo-equip-catalogo"
                  className={ui.pmocCombobox}
                  clientes={catalogEquipmentItems}
                  value={selectedCatalogEquipmentId}
                  onChange={applyCatalogEquipment}
                  placeholder={
                    !selectedClientId
                      ? "Selecione o cliente e unidade/local na etapa Geral"
                      : loadingCatalogEquipments
                        ? "Carregando equipamentos cadastrados..."
                        : catalogEquipmentItems.length > 0
                          ? "Escolha um equipamento da base para preencher automático"
                          : "Nenhum equipamento cadastrado para este cliente/unidade"
                  }
                  searchPlaceholder="Digite TAG, modelo, fabricante..."
                  emptyMessage="Nenhum equipamento encontrado."
                  disabled={!selectedClientId || loadingCatalogEquipments || catalogEquipmentItems.length === 0}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>TAG *</span>
                <input
                  className={`${ui.input} ${equipamentoFormErrors.tag ? ui.inputError : ""}`}
                  value={equipamentoForm.tag}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, tag: e.target.value.toUpperCase() }))}
                  placeholder="AC-001"
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Tipo *</span>
                <select
                  className={`${ui.input} ${equipamentoFormErrors.tipo ? ui.inputError : ""}`}
                  value={equipamentoForm.tipo}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, tipo: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Fabricante *</span>
                <select
                  className={`${ui.input} ${equipamentoFormErrors.fabricante ? ui.inputError : ""}`}
                  value={equipamentoForm.fabricante}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, fabricante: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {EQUIPMENT_BRAND_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Modelo *</span>
                <input
                  className={`${ui.input} ${equipamentoFormErrors.modelo ? ui.inputError : ""}`}
                  value={equipamentoForm.modelo}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, modelo: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Capacidade térmica *</span>
                <input
                  className={`${ui.input} ${equipamentoFormErrors.capacidade_btu ? ui.inputError : ""}`}
                  value={equipamentoForm.capacidade_btu}
                  onChange={(e) =>
                    setEquipamentoForm((prev) => ({ ...prev, capacidade_btu: normalizeCapacity(e.target.value) }))
                  }
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Fluido refrigerante</span>
                <select
                  className={ui.input}
                  value={equipamentoForm.fluido}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, fluido: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {REFRIGERANT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Número série</span>
                <input
                  className={ui.input}
                  value={equipamentoForm.serie}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, serie: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Data instalação</span>
                <input
                  type="date"
                  className={ui.input}
                  value={equipamentoForm.data_instalacao}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, data_instalacao: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Ambiente vinculado</span>
                <input
                  className={ui.input}
                  disabled
                  value={draft.pmocAmbientes.find((row) => row.id === equipamentoTargetAmbienteId)?.nome ?? ""}
                />
              </label>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Observações</span>
                <textarea
                  className={`${ui.input} ${ui.textarea}`}
                  value={equipamentoForm.observacao}
                  onChange={(e) => setEquipamentoForm((prev) => ({ ...prev, observacao: e.target.value }))}
                />
              </label>
            </div>
            <div className={ui.modalActions}>
              <button type="button" className={ui.btnSecondaryInline} onClick={() => setEquipamentoModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.btnPrimaryInline} onClick={submitEquipamentoModal}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityModalOpen ? (
        <div className={ui.activityEditOverlay} role="dialog" aria-modal="true" aria-labelledby="activity-edit-title">
          <div className={ui.activityEditDialog}>
            <header className={ui.activityEditHeader}>
              <h3 id="activity-edit-title" className={ui.activityEditTitle}>
                Editar atividade
              </h3>
              <button
                type="button"
                className={ui.activityEditClose}
                aria-label="Fechar"
                onClick={() => setActivityModalOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className={ui.activityEditBody}>
              <div className={ui.activityEditField}>
                <label className={ui.activityEditLabel} htmlFor="activity-edit-nome">
                  Nome da atividade *
                </label>
                <input
                  id="activity-edit-nome"
                  type="text"
                  className={ui.activityEditInput}
                  value={activityForm.nome}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Higienização da evaporadora"
                />
              </div>

              <div className={ui.activityEditField}>
                <label className={ui.activityEditLabel} htmlFor="activity-edit-descricao">
                  Descrição da atividade
                </label>
                <textarea
                  id="activity-edit-descricao"
                  className={`${ui.activityEditInput} ${ui.activityEditTextarea}`}
                  value={activityForm.descricao}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Limpeza e higienização dos componentes internos da evaporadora."
                />
              </div>

              <div className={ui.activityEditRow}>
                <div className={ui.activityEditField}>
                  <label className={ui.activityEditLabel} htmlFor="activity-edit-tempo">
                    Tempo estimado total
                  </label>
                  <input
                    id="activity-edit-tempo"
                    type="text"
                    className={ui.activityEditInput}
                    value={activityForm.tempo_estimado}
                    onChange={(e) => setActivityForm((prev) => ({ ...prev, tempo_estimado: e.target.value }))}
                    placeholder="45 a 60 min"
                  />
                </div>

                <div className={ui.activityEditField}>
                  <label className={ui.activityEditLabel} htmlFor="activity-edit-status">
                    Status
                  </label>
                  <div className={ui.activityEditSelectWrap}>
                    <select
                      id="activity-edit-status"
                      className={ui.activityEditSelect}
                      value={activityForm.ativo ? "ativa" : "inativa"}
                      onChange={(e) =>
                        setActivityForm((prev) => ({ ...prev, ativo: e.target.value === "ativa" }))
                      }
                    >
                      <option value="ativa">Ativa</option>
                      <option value="inativa">Inativa</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={ui.activityEditNotice} role="note">
                <Info size={18} className={ui.activityEditNoticeIcon} aria-hidden />
                <div className={ui.activityEditNoticeContent}>
                  <p className={ui.activityEditNoticeTitle}>
                    A periodicidade é definida em cada serviço desta atividade.
                  </p>
                  <p className={ui.activityEditNoticeText}>
                    Cada serviço pode ter uma periodicidade diferente conforme sua necessidade.
                  </p>
                </div>
              </div>
            </div>

            <footer className={ui.activityEditFooter}>
              <button type="button" className={ui.activityEditBtnCancel} onClick={() => setActivityModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.activityEditBtnSave} onClick={saveEditedActivity}>
                Salvar
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {activityCreateModalOpen ? (
        <div className={ui.modalOverlay} role="dialog" aria-modal="true">
          <div className={ui.modalDialog}>
            <div className={ui.modalHeader}>
              <h3>Nova atividade</h3>
              <button type="button" className={ui.modalClose} onClick={() => setActivityCreateModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={ui.modalGrid}>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Nome da atividade *</span>
                <input
                  className={ui.input}
                  value={activityForm.nome}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Limpeza de filtros"
                />
              </label>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Descrição da atividade</span>
                <textarea
                  className={`${ui.input} ${ui.textarea}`}
                  value={activityForm.descricao}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, descricao: e.target.value }))}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Tempo estimado total</span>
                <input
                  className={ui.input}
                  value={activityForm.tempo_estimado}
                  onChange={(e) => setActivityForm((prev) => ({ ...prev, tempo_estimado: e.target.value }))}
                  placeholder="Ex: 30 a 45 min"
                />
              </label>
            </div>
            <div className={ui.modalActions}>
              <button type="button" className={ui.btnSecondaryInline} onClick={() => setActivityCreateModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.btnPrimaryInline} onClick={saveNewActivity}>
                Adicionar atividade
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityServiceModalOpen ? (
        <div className={ui.serviceEditOverlay} role="dialog" aria-modal="true" aria-labelledby="service-edit-title">
          <div className={ui.serviceEditDialog}>
            <header className={ui.serviceEditHeader}>
              <div className={ui.serviceEditHeaderMain}>
                <h3 id="service-edit-title" className={ui.serviceEditTitle}>
                  Editar serviço
                </h3>
                <p className={ui.serviceEditSubtitle}>Edite as informações do serviço desta atividade.</p>
              </div>
              <div className={ui.serviceEditHeaderActions}>
                <span
                  className={`${ui.serviceEditStatusBadge} ${
                    activityServiceForm.ativo ? ui.serviceEditStatusBadgeActive : ui.serviceEditStatusBadgeInactive
                  }`}
                >
                  ● {activityServiceForm.ativo ? "Ativo" : "Inativo"}
                </span>
                <button
                  type="button"
                  className={ui.serviceEditClose}
                  aria-label="Fechar"
                  onClick={() => setActivityServiceModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className={ui.serviceEditBody}>
              <div className={`${ui.serviceEditField} ${ui.serviceEditFieldFull}`}>
                <label className={ui.serviceEditLabel} htmlFor="service-edit-descricao">
                  Descrição do serviço *
                </label>
                <textarea
                  id="service-edit-descricao"
                  className={`${ui.serviceEditTextarea} ${ui.serviceEditTextareaMain} ${
                    activityServiceFormErrors.descricao ? ui.serviceEditInputError : ""
                  }`}
                  value={activityServiceForm.descricao}
                  onChange={(e) => {
                    clearActivityServiceFieldError("descricao");
                    setActivityServiceForm((prev) => ({ ...prev, descricao: e.target.value }));
                  }}
                  placeholder="Limpeza da serpentina evaporadora"
                />
                {activityServiceFormErrors.descricao ? (
                  <span className={ui.serviceEditError}>{activityServiceFormErrors.descricao}</span>
                ) : null}
              </div>

              <div className={ui.serviceEditConfigGrid}>
                <div className={ui.serviceEditField}>
                  <label className={ui.serviceEditLabel} htmlFor="service-edit-periodicidade">
                    Periodicidade *
                  </label>
                  <div
                    className={`${ui.serviceEditSelectWrap} ${
                      activityServiceFormErrors.periodicidade ? ui.serviceEditInputError : ""
                    }`}
                  >
                    <CalendarDays size={18} className={ui.serviceEditSelectIconCalendar} aria-hidden />
                    <select
                      id="service-edit-periodicidade"
                      className={ui.serviceEditSelect}
                      value={activityServiceForm.periodicidade}
                      onChange={(e) => {
                        clearActivityServiceFieldError("periodicidade");
                        setActivityServiceForm((prev) => ({ ...prev, periodicidade: e.target.value }));
                      }}
                    >
                      {SERVICE_PERIODICITY_OPTIONS.map((periodicity) => (
                        <option key={periodicity} value={periodicity}>
                          {periodicity}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activityServiceFormErrors.periodicidade ? (
                    <span className={ui.serviceEditError}>{activityServiceFormErrors.periodicidade}</span>
                  ) : null}
                </div>

                <div className={ui.serviceEditField}>
                  <label className={ui.serviceEditLabel} htmlFor="service-edit-obrigatorio">
                    Obrigatório? *
                  </label>
                  <div className={ui.serviceEditSelectWrap}>
                    <Check size={18} className={ui.serviceEditSelectIconCheck} aria-hidden />
                    <select
                      id="service-edit-obrigatorio"
                      className={ui.serviceEditSelect}
                      value={activityServiceForm.obrigatorio ? "sim" : "nao"}
                      onChange={(e) =>
                        setActivityServiceForm((prev) => ({ ...prev, obrigatorio: e.target.value === "sim" }))
                      }
                    >
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                </div>

                <div className={ui.serviceEditField}>
                  <label className={ui.serviceEditLabel} htmlFor="service-edit-exige-foto">
                    Exige foto? *
                  </label>
                  <div className={ui.serviceEditSelectWrap}>
                    <Camera size={18} className={ui.serviceEditSelectIconCamera} aria-hidden />
                    <select
                      id="service-edit-exige-foto"
                      className={ui.serviceEditSelect}
                      value={activityServiceForm.exige_foto ? "sim" : "nao"}
                      onChange={(e) =>
                        setActivityServiceForm((prev) => ({ ...prev, exige_foto: e.target.value === "sim" }))
                      }
                    >
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={ui.serviceEditStatusGrid}>
                <div className={ui.serviceEditField}>
                  <span className={ui.serviceEditLabel}>Status *</span>
                  <div className={ui.serviceEditSwitchRow}>
                    <label className={ui.serviceEditSwitch}>
                      <input
                        type="checkbox"
                        checked={activityServiceForm.ativo}
                        onChange={(e) =>
                          setActivityServiceForm((prev) => ({ ...prev, ativo: e.target.checked }))
                        }
                      />
                      <span className={ui.serviceEditSwitchTrack}>
                        <span className={ui.serviceEditSwitchThumb} />
                      </span>
                    </label>
                    <span className={ui.serviceEditSwitchLabel}>
                      {activityServiceForm.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className={ui.serviceEditSwitchHint}>
                    Serviço ativo será incluído no cronograma.
                  </p>
                </div>

                <div className={ui.serviceEditField}>
                  <label className={ui.serviceEditLabel} htmlFor="service-edit-tempo">
                    Tempo estimado
                  </label>
                  <div className={ui.serviceEditInputWrap}>
                    <Clock3 size={18} className={ui.serviceEditInputIcon} aria-hidden />
                    <input
                      id="service-edit-tempo"
                      type="text"
                      className={ui.serviceEditInput}
                      value={activityServiceForm.tempo_estimado}
                      onChange={(e) =>
                        setActivityServiceForm((prev) => ({ ...prev, tempo_estimado: e.target.value }))
                      }
                      placeholder="15 a 20 min"
                    />
                  </div>
                </div>
              </div>

              <div className={`${ui.serviceEditField} ${ui.serviceEditFieldFull}`}>
                <label className={ui.serviceEditLabel} htmlFor="service-edit-observacao">
                  Observação interna (opcional)
                </label>
                <div className={ui.serviceEditTextareaWrap}>
                  <textarea
                    id="service-edit-observacao"
                    className={`${ui.serviceEditTextarea} ${ui.serviceEditTextareaObs}`}
                    value={activityServiceForm.observacao}
                    maxLength={SERVICE_OBSERVACAO_MAX}
                    onChange={(e) =>
                      setActivityServiceForm((prev) => ({ ...prev, observacao: e.target.value }))
                    }
                    placeholder={
                      "Informações adicionais para execução do serviço,\nobservações técnicas,\nprodutos recomendados..."
                    }
                  />
                  <span className={ui.serviceEditCharCount}>
                    {activityServiceForm.observacao.length}/{SERVICE_OBSERVACAO_MAX}
                  </span>
                </div>
              </div>

              <div className={ui.serviceEditSummary}>
                <h4 className={ui.serviceEditSummaryTitle}>Resumo deste serviço</h4>
                <div className={ui.serviceEditSummaryGrid}>
                  <div className={ui.serviceEditSummaryItem}>
                    <span className={ui.serviceEditSummaryLabel}>
                      <CalendarDays size={15} aria-hidden />
                      Periodicidade
                    </span>
                    <strong>{activityServiceForm.periodicidade || "—"}</strong>
                  </div>
                  <div className={ui.serviceEditSummaryItem}>
                    <span className={ui.serviceEditSummaryLabel}>
                      <Check size={15} aria-hidden />
                      Obrigatório
                    </span>
                    <strong>{yesNoLabel(activityServiceForm.obrigatorio)}</strong>
                  </div>
                  <div className={ui.serviceEditSummaryItem}>
                    <span className={ui.serviceEditSummaryLabel}>
                      <Camera size={15} aria-hidden />
                      Exige foto
                    </span>
                    <strong>{yesNoLabel(activityServiceForm.exige_foto)}</strong>
                  </div>
                  <div className={ui.serviceEditSummaryItem}>
                    <span className={ui.serviceEditSummaryLabel}>
                      <span className={ui.serviceEditSummaryDot} aria-hidden />
                      Status
                    </span>
                    <strong>{activityServiceForm.ativo ? "Ativo" : "Inativo"}</strong>
                  </div>
                  <div className={ui.serviceEditSummaryItem}>
                    <span className={ui.serviceEditSummaryLabel}>
                      <Clock3 size={15} aria-hidden />
                      Tempo
                    </span>
                    <strong>{activityServiceForm.tempo_estimado.trim() || "—"}</strong>
                  </div>
                </div>
              </div>
            </div>

            <footer className={ui.serviceEditFooter}>
              <button
                type="button"
                className={ui.serviceEditBtnCancel}
                onClick={() => setActivityServiceModalOpen(false)}
              >
                Cancelar
              </button>
              <button type="button" className={ui.serviceEditBtnSave} onClick={saveEditedActivityService}>
                <Save size={18} aria-hidden />
                Salvar alterações
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {activityServiceCreateModalOpen ? (
        <div className={ui.modalOverlay} role="dialog" aria-modal="true">
          <div className={ui.modalDialog}>
            <div className={ui.modalHeader}>
              <h3>Novo serviço</h3>
              <button type="button" className={ui.modalClose} onClick={() => setActivityServiceCreateModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={ui.modalGrid}>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Descrição do serviço *</span>
                <textarea
                  className={`${ui.input} ${ui.textarea}`}
                  value={activityServiceForm.descricao}
                  onChange={(e) => setActivityServiceForm((prev) => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Ex: Lavagem com água corrente"
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Periodicidade *</span>
                <select
                  className={ui.input}
                  value={activityServiceForm.periodicidade}
                  onChange={(e) => setActivityServiceForm((prev) => ({ ...prev, periodicidade: e.target.value }))}
                >
                  {SERVICE_PERIODICITY_OPTIONS.map((periodicity) => (
                    <option key={periodicity} value={periodicity}>
                      {periodicity}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Obrigatório *</span>
                <select
                  className={ui.input}
                  value={activityServiceForm.obrigatorio ? "sim" : "nao"}
                  onChange={(e) =>
                    setActivityServiceForm((prev) => ({ ...prev, obrigatorio: e.target.value === "sim" }))
                  }
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Exige foto *</span>
                <select
                  className={ui.input}
                  value={activityServiceForm.exige_foto ? "sim" : "nao"}
                  onChange={(e) =>
                    setActivityServiceForm((prev) => ({ ...prev, exige_foto: e.target.value === "sim" }))
                  }
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Status *</span>
                <select
                  className={ui.input}
                  value={activityServiceForm.ativo ? "ativo" : "inativo"}
                  onChange={(e) => setActivityServiceForm((prev) => ({ ...prev, ativo: e.target.value === "ativo" }))}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label className={`${ui.field} ${ui.fullRow}`}>
                <span className={ui.label}>Aplicar em</span>
                <div className={ui.scheduleApplyOptions}>
                  <label className={ui.scheduleApplyOption}>
                    <input
                      type="radio"
                      name="service-scope"
                      value="equipment"
                      checked={serviceApplyScope === "equipment"}
                      onChange={() => setServiceApplyScope("equipment")}
                    />
                    Apenas este equipamento
                  </label>
                  <label className={ui.scheduleApplyOption}>
                    <input
                      type="radio"
                      name="service-scope"
                      value="type"
                      checked={serviceApplyScope === "type"}
                      onChange={() => setServiceApplyScope("type")}
                    />
                    Todos os equipamentos deste tipo
                  </label>
                  <label className={ui.scheduleApplyOption}>
                    <input
                      type="radio"
                      name="service-scope"
                      value="pmoc"
                      checked={serviceApplyScope === "pmoc"}
                      onChange={() => setServiceApplyScope("pmoc")}
                    />
                    Todos os equipamentos deste PMOC
                  </label>
                </div>
              </label>
            </div>
            <div className={ui.modalActions}>
              <button
                type="button"
                className={ui.btnSecondaryInline}
                onClick={() => setActivityServiceCreateModalOpen(false)}
              >
                Cancelar
              </button>
              <button type="button" className={ui.btnPrimaryInline} onClick={saveNewActivityService}>
                Adicionar serviço
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cronogramaConfigModalOpen ? (
        <div
          className={ui.scheduleConfigOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-config-title"
        >
          <div className={ui.scheduleConfigDialog}>
            <header className={ui.scheduleConfigHeader}>
              <div>
                <h3 id="schedule-config-title" className={ui.scheduleConfigTitle}>
                  Configurações gerais do cronograma
                </h3>
                <p className={ui.scheduleConfigSubtitle}>
                  Defina regras padrão para geração automática das atividades e serviços.
                </p>
              </div>
              <button
                type="button"
                className={ui.scheduleConfigClose}
                aria-label="Fechar"
                onClick={() => setCronogramaConfigModalOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className={ui.scheduleConfigBody}>
              <section className={ui.scheduleConfigSection}>
                <h4 className={ui.scheduleConfigSectionTitle}>📅 Datas do cronograma</h4>
                <div className={ui.scheduleConfigDatesGrid}>
                  <div className={ui.scheduleConfigField}>
                    <label className={ui.scheduleConfigLabel} htmlFor="schedule-config-data-inicial">
                      Data inicial do cronograma *
                    </label>
                    <div className={ui.scheduleConfigDateWrap}>
                      <CalendarDays size={16} className={ui.scheduleConfigDateIcon} aria-hidden />
                      <input
                        id="schedule-config-data-inicial"
                        type="date"
                        className={ui.scheduleConfigInput}
                        value={cronogramaConfigForm.dataInicial}
                        onChange={(e) =>
                          setCronogramaConfigForm((prev) => ({ ...prev, dataInicial: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className={ui.scheduleConfigField}>
                    <label className={ui.scheduleConfigLabel} htmlFor="schedule-config-data-final">
                      Gerar próximas execuções até *
                    </label>
                    <div className={ui.scheduleConfigDateWrap}>
                      <CalendarDays size={16} className={ui.scheduleConfigDateIcon} aria-hidden />
                      <input
                        id="schedule-config-data-final"
                        type="date"
                        className={ui.scheduleConfigInput}
                        value={cronogramaConfigForm.dataFinal}
                        onChange={(e) =>
                          setCronogramaConfigForm((prev) => ({ ...prev, dataFinal: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className={ui.scheduleConfigField}>
                    <label className={ui.scheduleConfigLabel} htmlFor="schedule-config-vencimento">
                      Considerar vencimento em
                    </label>
                    <select
                      id="schedule-config-vencimento"
                      className={ui.scheduleConfigSelect}
                      value={cronogramaConfigForm.vencimentoAviso}
                      onChange={(e) =>
                        setCronogramaConfigForm((prev) => ({
                          ...prev,
                          vencimentoAviso: e.target.value as CronogramaVencimentoAviso,
                        }))
                      }
                    >
                      {VENCIMENTO_AVISO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <div className={ui.scheduleConfigSplit}>
                <section className={ui.scheduleConfigSection}>
                  <h4 className={ui.scheduleConfigSectionTitle}>⚙️ Regras padrão</h4>
                  <div className={ui.scheduleConfigField}>
                    <label className={ui.scheduleConfigLabel} htmlFor="schedule-config-responsavel">
                      Responsável padrão
                    </label>
                    <select
                      id="schedule-config-responsavel"
                      className={ui.scheduleConfigSelect}
                      value={cronogramaConfigForm.responsavelPadrao}
                      onChange={(e) =>
                        setCronogramaConfigForm((prev) => ({
                          ...prev,
                          responsavelPadrao: e.target.value as CronogramaResponsavelPadrao,
                        }))
                      }
                    >
                      {RESPONSAVEL_PADRAO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={ui.scheduleConfigToggles}>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Aplicar automaticamente serviços por tipo de equipamento</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.aplicarServicosPorTipo}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              aplicarServicosPorTipo: e.target.checked,
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Gerar cronograma automaticamente ao adicionar equipamento</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.gerarAutomaticoEquipamento}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              gerarAutomaticoEquipamento: e.target.checked,
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Permitir editar serviços padrão</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.permitirEditarServicosPadrao}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              permitirEditarServicosPadrao: e.target.checked,
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Exigir foto em serviços obrigatórios</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.exigirFotoServicosObrigatorios}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              exigirFotoServicosObrigatorios: e.target.checked,
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                  </div>
                </section>

                <section className={ui.scheduleConfigSection}>
                  <h4 className={ui.scheduleConfigSectionTitle}>🔁 Periodicidades disponíveis</h4>
                  <div className={ui.scheduleConfigCheckboxList}>
                    {PERIODICIDADE_CONFIG_ITEMS.map((item) => (
                      <label key={item.key} className={ui.scheduleConfigCheckbox}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.periodicidadesAtivas[item.key]}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              periodicidadesAtivas: {
                                ...prev.periodicidadesAtivas,
                                [item.key]: e.target.checked,
                              },
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigCheckboxBox} aria-hidden />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className={ui.scheduleConfigSplit}>
                <section className={ui.scheduleConfigSection}>
                  <h4 className={ui.scheduleConfigSectionTitle}>📷 Evidências e execução</h4>
                  <div className={ui.scheduleConfigToggles}>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Exigir foto antes do serviço</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.evidencias.fotoAntes}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              evidencias: { ...prev.evidencias, fotoAntes: e.target.checked },
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Exigir foto depois do serviço</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.evidencias.fotoDepois}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              evidencias: { ...prev.evidencias, fotoDepois: e.target.checked },
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Permitir concluir serviço sem foto quando não obrigatório</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.evidencias.concluirSemFotoQuandoNaoObrigatorio}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              evidencias: {
                                ...prev.evidencias,
                                concluirSemFotoQuandoNaoObrigatorio: e.target.checked,
                              },
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                    <div className={ui.scheduleConfigToggleRow}>
                      <span>Permitir observação obrigatória em serviço não executado</span>
                      <label className={ui.scheduleConfigSwitch}>
                        <input
                          type="checkbox"
                          checked={cronogramaConfigForm.evidencias.observacaoObrigatoriaNaoExecutado}
                          onChange={(e) =>
                            setCronogramaConfigForm((prev) => ({
                              ...prev,
                              evidencias: {
                                ...prev.evidencias,
                                observacaoObrigatoriaNaoExecutado: e.target.checked,
                              },
                            }))
                          }
                        />
                        <span className={ui.scheduleConfigSwitchTrack}>
                          <span className={ui.scheduleConfigSwitchThumb} />
                        </span>
                      </label>
                    </div>
                  </div>
                </section>

                <section className={ui.scheduleConfigSection}>
                  <h4 className={ui.scheduleConfigSectionTitle}>Aplicar configurações em:</h4>
                  <div className={ui.scheduleConfigRadioList}>
                    {APLICAR_CONFIG_OPTIONS.map((option) => (
                      <label key={option.value} className={ui.scheduleConfigRadio}>
                        <input
                          type="radio"
                          name="cronograma-aplicar-em"
                          value={option.value}
                          checked={cronogramaConfigForm.aplicarEm === option.value}
                          onChange={() =>
                            setCronogramaConfigForm((prev) => ({ ...prev, aplicarEm: option.value }))
                          }
                        />
                        <span className={ui.scheduleConfigRadioMark} aria-hidden />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className={ui.scheduleConfigIrisNotice} role="note">
                <span className={ui.scheduleConfigIrisBadge}>
                  <Bot size={16} aria-hidden />
                  Iris
                </span>
                <p>
                  Essas configurações ajudam a montar automaticamente o cronograma por equipamento, respeitando o
                  tipo de máquina e os serviços exigidos.
                </p>
              </div>
            </div>

            <footer className={ui.scheduleConfigFooter}>
              <button
                type="button"
                className={ui.scheduleConfigBtnCancel}
                onClick={() => setCronogramaConfigModalOpen(false)}
              >
                Cancelar
              </button>
              <button type="button" className={ui.scheduleConfigBtnSave} onClick={saveCronogramaConfiguracoes}>
                Salvar configurações
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {documentUploadModalOpen ? (
        <div className={ui.docsModalOverlay} role="dialog" aria-modal="true" aria-labelledby="doc-upload-title">
          <div className={ui.docsModalDialog}>
            <header className={ui.docsModalHeader}>
              <h3 id="doc-upload-title">Novo documento</h3>
              <button type="button" className={ui.docsModalClose} aria-label="Fechar" onClick={() => setDocumentUploadModalOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className={ui.docsModalBody}>
              <div className={ui.docsModalField}>
                <label className={ui.docsModalLabel} htmlFor="doc-upload-nome">
                  Nome documento *
                </label>
                <input
                  id="doc-upload-nome"
                  className={`${ui.docsModalInput} ${documentFormErrors.nome ? ui.docsModalInputError : ""}`}
                  value={documentForm.nome}
                  onChange={(e) => {
                    setDocumentFormErrors((prev) => ({ ...prev, nome: "" }));
                    setDocumentForm((prev) => ({ ...prev, nome: e.target.value }));
                  }}
                />
                {documentFormErrors.nome ? <span className={ui.docsModalError}>{documentFormErrors.nome}</span> : null}
              </div>
              <div className={ui.docsModalRow}>
                <div className={ui.docsModalField}>
                  <label className={ui.docsModalLabel} htmlFor="doc-upload-categoria">
                    Categoria *
                  </label>
                  <select
                    id="doc-upload-categoria"
                    className={ui.docsModalSelect}
                    value={documentForm.categoria}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, categoria: e.target.value }))}
                  >
                    {DOCUMENT_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={ui.docsModalField}>
                  <label className={ui.docsModalLabel} htmlFor="doc-upload-tipo">
                    Tipo documento *
                  </label>
                  <select
                    id="doc-upload-tipo"
                    className={ui.docsModalSelect}
                    value={documentForm.tipo}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, tipo: e.target.value }))}
                  >
                    {DOCUMENT_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={ui.docsModalField}>
                <span className={ui.docsModalLabel}>Upload *</span>
                <div
                  className={`${ui.docsUploadZone} ${documentFormErrors.arquivo ? ui.docsModalInputError : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDocumentFileSelect(e.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  <CloudUpload size={28} />
                  <p>Arraste arquivo aqui</p>
                  <span>ou</span>
                  <button type="button" className={ui.docsUploadBtn} onClick={() => documentFileInputRef.current?.click()}>
                    Selecionar arquivo
                  </button>
                  <small>PDF, DOC, DOCX, XLS, XLSX, PNG, JPG</small>
                  {documentForm.arquivo_nome ? (
                    <strong className={ui.docsUploadFileName}>{documentForm.arquivo_nome}</strong>
                  ) : null}
                  <input
                    ref={documentFileInputRef}
                    type="file"
                    accept={DOCUMENT_ACCEPT_TYPES}
                    className={ui.docsUploadInput}
                    onChange={(e) => handleDocumentFileSelect(e.target.files?.[0] ?? null)}
                  />
                </div>
                {documentFormErrors.arquivo ? <span className={ui.docsModalError}>{documentFormErrors.arquivo}</span> : null}
              </div>
              <div className={ui.docsModalRow}>
                <div className={ui.docsModalField}>
                  <label className={ui.docsModalLabel} htmlFor="doc-upload-validade">
                    Data validade
                  </label>
                  <input
                    id="doc-upload-validade"
                    type="date"
                    className={ui.docsModalInput}
                    value={documentForm.validade}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, validade: e.target.value }))}
                  />
                </div>
              </div>
              <div className={ui.docsModalField}>
                <label className={ui.docsModalLabel} htmlFor="doc-upload-obs">
                  Observações
                </label>
                <textarea
                  id="doc-upload-obs"
                  className={`${ui.docsModalInput} ${ui.docsModalTextarea}`}
                  value={documentForm.observacoes}
                  onChange={(e) => setDocumentForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                />
              </div>
            </div>
            <footer className={ui.docsModalFooter}>
              <button type="button" className={ui.docsModalBtnCancel} onClick={() => setDocumentUploadModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.docsModalBtnSave} onClick={saveNewDocument}>
                Salvar documento
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {documentConfigModalOpen ? (
        <div className={ui.docsModalOverlay} role="dialog" aria-modal="true" aria-labelledby="doc-config-title">
          <div className={ui.docsModalDialog}>
            <header className={ui.docsModalHeader}>
              <h3 id="doc-config-title">Configurações documentos</h3>
              <button type="button" className={ui.docsModalClose} aria-label="Fechar" onClick={() => setDocumentConfigModalOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className={ui.docsModalBody}>
              <div className={ui.docsConfigToggles}>
                <div className={ui.docsConfigRow}>
                  <span>Exigir documentos obrigatórios antes de finalizar PMOC</span>
                  <label className={ui.scheduleConfigSwitch}>
                    <input
                      type="checkbox"
                      checked={draft.documentos_config.exigirObrigatoriosAntesFinalizar}
                      onChange={(e) => updateDocumentosConfig("exigirObrigatoriosAntesFinalizar", e.target.checked)}
                    />
                    <span className={ui.scheduleConfigSwitchTrack}>
                      <span className={ui.scheduleConfigSwitchThumb} />
                    </span>
                  </label>
                </div>
                <div className={ui.docsConfigRow}>
                  <span>Gerar PDF final automaticamente</span>
                  <label className={ui.scheduleConfigSwitch}>
                    <input
                      type="checkbox"
                      checked={draft.documentos_config.gerarPdfFinalAutomaticamente}
                      onChange={(e) => updateDocumentosConfig("gerarPdfFinalAutomaticamente", e.target.checked)}
                    />
                    <span className={ui.scheduleConfigSwitchTrack}>
                      <span className={ui.scheduleConfigSwitchThumb} />
                    </span>
                  </label>
                </div>
                <div className={ui.docsConfigRow}>
                  <span>Anexar relatórios das manutenções</span>
                  <label className={ui.scheduleConfigSwitch}>
                    <input
                      type="checkbox"
                      checked={draft.documentos_config.anexarRelatoriosManutencoes}
                      onChange={(e) => updateDocumentosConfig("anexarRelatoriosManutencoes", e.target.checked)}
                    />
                    <span className={ui.scheduleConfigSwitchTrack}>
                      <span className={ui.scheduleConfigSwitchThumb} />
                    </span>
                  </label>
                </div>
                <div className={ui.docsConfigRow}>
                  <span>Inserir fotos das execuções no relatório</span>
                  <label className={ui.scheduleConfigSwitch}>
                    <input
                      type="checkbox"
                      checked={draft.documentos_config.inserirFotosExecucoesRelatorio}
                      onChange={(e) => updateDocumentosConfig("inserirFotosExecucoesRelatorio", e.target.checked)}
                    />
                    <span className={ui.scheduleConfigSwitchTrack}>
                      <span className={ui.scheduleConfigSwitchThumb} />
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <footer className={ui.docsModalFooter}>
              <button type="button" className={ui.docsModalBtnCancel} onClick={() => setDocumentConfigModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className={ui.docsModalBtnSave} onClick={saveDocumentosConfig}>
                Salvar configurações
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {pmocGenerateModalOpen ? (
        <div className={ui.reviewGenerateOverlay} role="dialog" aria-modal="true" aria-labelledby="pmoc-generate-title">
          <div className={ui.reviewGenerateModal}>
            {!pmocGenerateSuccess ? (
              <>
                <div className={ui.reviewGenerateLoader}>
                  <Loader2 size={32} className={ui.reviewGenerateSpinner} />
                </div>
                <h3 id="pmoc-generate-title">Iris está preparando seu PMOC...</h3>
                <ul className={ui.reviewGenerateSteps}>
                  {PMOC_GENERATE_STEPS.map((label, index) => {
                    const done = pmocGenerateStepDone > index;
                    const active = pmocGenerating && pmocGenerateStepDone === index;
                    return (
                      <li key={label} className={done ? ui.reviewGenerateStepDone : active ? ui.reviewGenerateStepActive : ""}>
                        {done ? <CheckCircle2 size={16} /> : <span className={ui.reviewGenerateStepDot} />}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <div className={ui.reviewGenerateSuccessIcon}>
                  <CheckCircle2 size={40} />
                </div>
                <h3 id="pmoc-generate-title">PMOC gerado com sucesso</h3>
                <p className={ui.reviewGenerateSuccessFile}>{draft.pmoc_revisao.geracao.arquivo_pdf}</p>
                <div className={ui.reviewGenerateSuccessActions}>
                  <button type="button" className={ui.reviewFooterPreviewBtn} onClick={handlePreviewPmoc}>
                    <Eye size={16} />
                    Visualizar
                  </button>
                  <button
                    type="button"
                    className={ui.reviewFooterGenerateBtn}
                    onClick={() => toast.success("Download do PDF iniciado.")}
                  >
                    <Download size={16} />
                    Baixar PDF
                  </button>
                  <button
                    type="button"
                    className={ui.reviewSuccessSecondaryBtn}
                    onClick={() => toast.success("Envio por e-mail será configurado em breve.")}
                  >
                    <Mail size={16} />
                    Enviar por e-mail
                  </button>
                  <button
                    type="button"
                    className={ui.reviewSuccessSecondaryBtn}
                    onClick={() => toast.success("Envio por WhatsApp será configurado em breve.")}
                  >
                    <MessageCircle size={16} />
                    Enviar WhatsApp
                  </button>
                </div>
                <button
                  type="button"
                  className={ui.reviewGenerateCloseBtn}
                  onClick={() => {
                    setPmocGenerateModalOpen(false);
                    setPmocGenerateSuccess(false);
                  }}
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

