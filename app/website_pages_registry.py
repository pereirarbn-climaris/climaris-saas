"""Catálogo de páginas configuráveis do site institucional."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WebsitePageImageSlot:
    slot: str
    label: str
    hint: str


@dataclass(frozen=True)
class WebsitePageDefinition:
    slug: str
    label: str
    path: str
    sort_order: int
    default_title: str
    default_subtitle: str
    default_hero_description: str
    default_seo_title: str
    default_seo_description: str
    default_sections: list[dict]
    default_outcomes: list[str]
    image_slots: tuple[WebsitePageImageSlot, ...]


GESTAO_EMPRESARIAL_SECTIONS: list[dict] = [
    {
        "key": "orders",
        "title": "Ordens de serviço completas",
        "description": (
            "Crie, acompanhe e feche OS com checklist, materiais, fotos e assinatura do cliente — "
            "escritório e campo sempre alinhados."
        ),
        "bullets": [
            "Status em tempo real e histórico por cliente",
            "Checklist configurável por tipo de serviço",
            "Assinatura digital e anexos em campo",
            "Vínculo com equipamentos e contratos",
        ],
    },
    {
        "key": "contracts",
        "title": "Contratos e propostas",
        "description": (
            "Orçamentos que viram contratos recorrentes — visão clara do que foi vendido "
            "e do que ainda precisa ser executado."
        ),
        "bullets": [
            "Propostas comerciais e aprovação",
            "Contratos de manutenção recorrente",
            "Escopo, valores e periodicidade centralizados",
            "Base para preventiva e faturamento",
        ],
    },
    {
        "key": "clients",
        "title": "Clientes e equipamentos",
        "description": (
            "Cadastro unificado de clientes, unidades e equipamentos com histórico completo de intervenções."
        ),
        "bullets": [
            "Ficha por cliente e por local",
            "Catálogo de equipamentos com QR Code",
            "Histórico técnico e comercial",
            "Rastreio de garantias e revisões",
        ],
    },
    {
        "key": "dashboard",
        "title": "Painel gerencial",
        "description": (
            "KPIs da operação no dashboard — pendências, agenda do dia e produtividade da equipe em um só lugar."
        ),
        "bullets": [
            "Visão de OS abertas, atrasadas e concluídas",
            "Indicadores por técnico e região",
            "Integração com financeiro e preventiva",
            "Decisões com dados, não com feeling",
        ],
    },
    {
        "key": "team",
        "title": "Equipe e permissões",
        "description": (
            "Perfis para administradores, comercial, financeiro e técnicos — cada um vê o que precisa no Climaris."
        ),
        "bullets": [
            "Multiusuário por workspace",
            "Permissões por módulo e função",
            "Auditoria de ações críticas",
            "Escala do time enxuto à operação grande",
        ],
    },
]

GESTAO_EMPRESARIAL_OUTCOMES = [
    "Menos retrabalho entre comercial, operação e financeiro",
    "Histórico confiável por cliente e equipamento",
    "Contratos recorrentes organizados e executáveis",
    "Gestão profissional mesmo com equipe em crescimento",
]

GESTAO_EMPRESARIAL_IMAGE_SLOTS: tuple[WebsitePageImageSlot, ...] = (
    WebsitePageImageSlot(
        slot="hero",
        label="Banner principal",
        hint="Imagem de destaque no topo da página — print do painel ou operação.",
    ),
    WebsitePageImageSlot(
        slot="showcase",
        label="Destaque lateral",
        hint="Imagem complementar ao lado do título (opcional).",
    ),
    WebsitePageImageSlot(
        slot="section-orders",
        label="Seção — Ordens de serviço",
        hint="Print da tela de OS para ilustrar a seção.",
    ),
    WebsitePageImageSlot(
        slot="section-contracts",
        label="Seção — Contratos",
        hint="Print de propostas ou contratos recorrentes.",
    ),
    WebsitePageImageSlot(
        slot="section-clients",
        label="Seção — Clientes",
        hint="Print do cadastro de clientes ou equipamentos.",
    ),
    WebsitePageImageSlot(
        slot="section-dashboard",
        label="Seção — Painel",
        hint="Print do dashboard gerencial.",
    ),
    WebsitePageImageSlot(
        slot="section-team",
        label="Seção — Equipe",
        hint="Print de usuários ou permissões.",
    ),
)

AGENDA_COMERCIAL_SECTIONS: list[dict] = [
    {
        "key": "calendar",
        "title": "Calendário unificado",
        "description": (
            "Visão diária, semanal e por equipe — toda a operação comercial em um só lugar, "
            "com filtros por técnico, região ou tipo de serviço."
        ),
        "bullets": [
            "Agenda diária e semanal responsiva",
            "Filtros por técnico, cliente ou status",
            "Cores e categorias por tipo de visita",
            "Sincronização em tempo real no workspace",
        ],
    },
    {
        "key": "scheduling",
        "title": "Agendamento de visitas",
        "description": (
            "Marque instalações, manutenções corretivas e visitas comerciais com data, horário "
            "e responsável definidos desde o primeiro contato."
        ),
        "bullets": [
            "Agendamento rápido a partir do cliente ou OS",
            "Duração estimada e janela de atendimento",
            "Reagendamento com histórico preservado",
            "Menos ligações para confirmar horário",
        ],
    },
    {
        "key": "os-link",
        "title": "Vínculo com OS e clientes",
        "description": (
            "Cada compromisso na agenda nasce ligado ao cliente, equipamento e ordem de serviço — "
            "escritório e campo enxergam a mesma informação."
        ),
        "bullets": [
            "OS criada ou vinculada na hora do agendamento",
            "Ficha do cliente e endereço sempre à mão",
            "Check-in e status refletidos no calendário",
            "Rastreio do que foi prometido vs. executado",
        ],
    },
    {
        "key": "rules",
        "title": "Expediente e feriados",
        "description": (
            "Respeite o horário comercial do workspace e bloqueie feriados nacionais — "
            "evite agendar fora do expediente ou em dias sem equipe."
        ),
        "bullets": [
            "Horário de trabalho por dia da semana",
            "Bloqueio automático de feriados nacionais",
            "Configuração por workspace",
            "Menos conflitos e reagendamentos forçados",
        ],
    },
    {
        "key": "team-view",
        "title": "Visão por equipe",
        "description": (
            "Distribua a carga entre técnicos e comercial com visão clara de quem está ocupado — "
            "escale sem perder o controle da agenda."
        ),
        "bullets": [
            "Agenda por técnico ou recepção",
            "Identificação de gargalos e ociosidade",
            "Integração com agenda do técnico em campo",
            "Operação coordenada mesmo com time crescendo",
        ],
    },
]

AGENDA_COMERCIAL_OUTCOMES = [
    "Menos conflito de horários entre comercial e operação",
    "Visitas e OS sempre alinhadas ao que foi combinado",
    "Expediente e feriados respeitados automaticamente",
    "Mais produtividade com roteiro comercial organizado",
]

AGENDA_COMERCIAL_IMAGE_SLOTS: tuple[WebsitePageImageSlot, ...] = (
    WebsitePageImageSlot(
        slot="hero",
        label="Banner principal",
        hint="Print do calendário comercial — visão semanal ou diária.",
    ),
    WebsitePageImageSlot(
        slot="showcase",
        label="Destaque lateral",
        hint="Imagem complementar ao lado do título (opcional).",
    ),
    WebsitePageImageSlot(
        slot="section-calendar",
        label="Seção — Calendário",
        hint="Print da agenda com filtros e visões.",
    ),
    WebsitePageImageSlot(
        slot="section-scheduling",
        label="Seção — Agendamento",
        hint="Tela de criar ou reagendar visita.",
    ),
    WebsitePageImageSlot(
        slot="section-os-link",
        label="Seção — OS e clientes",
        hint="Vínculo entre agenda, cliente e ordem de serviço.",
    ),
    WebsitePageImageSlot(
        slot="section-rules",
        label="Seção — Expediente",
        hint="Configuração de horário ou bloqueio de feriados.",
    ),
    WebsitePageImageSlot(
        slot="section-team-view",
        label="Seção — Equipe",
        hint="Agenda por técnico ou visão da equipe.",
    ),
)

WEBSITE_PAGE_DEFINITIONS: dict[str, WebsitePageDefinition] = {
    "gestao-empresarial": WebsitePageDefinition(
        slug="gestao-empresarial",
        label="Gestão Empresarial",
        path="/funcionalidades/gestao-empresarial",
        sort_order=10,
        default_title="Gestão Empresarial",
        default_subtitle="Operação, contratos e clientes no mesmo painel",
        default_hero_description=(
            "Centralize ordens de serviço, contratos recorrentes, histórico por equipamento e indicadores "
            "da operação — do primeiro contato ao laudo assinado, sem planilhas paralelas."
        ),
        default_seo_title="Gestão Empresarial — ERP para Climatização",
        default_seo_description=(
            "Centralize ordens de serviço, contratos recorrentes, histórico por equipamento e indicadores "
            "da operação — do primeiro contato ao laudo assinado, sem planilhas paralelas."
        ),
        default_sections=list(GESTAO_EMPRESARIAL_SECTIONS),
        default_outcomes=list(GESTAO_EMPRESARIAL_OUTCOMES),
        image_slots=GESTAO_EMPRESARIAL_IMAGE_SLOTS,
    ),
    "agenda-comercial": WebsitePageDefinition(
        slug="agenda-comercial",
        label="Agenda Comercial",
        path="/funcionalidades/agenda-comercial",
        sort_order=20,
        default_title="Agenda Comercial",
        default_subtitle="Visitas, instalações e manutenções no mesmo calendário do escritório",
        default_hero_description=(
            "Calendário integrado para agendar visitas técnicas, instalações e manutenções — "
            "comercial e operação alinhados, sem conflito de horários nem retrabalho entre equipes."
        ),
        default_seo_title="Agenda Comercial — ERP para Climatização",
        default_seo_description=(
            "Calendário integrado para agendar visitas, instalações e manutenções. "
            "Visão diária e semanal, vínculo com OS e bloqueio de feriados no Climaris."
        ),
        default_sections=list(AGENDA_COMERCIAL_SECTIONS),
        default_outcomes=list(AGENDA_COMERCIAL_OUTCOMES),
        image_slots=AGENDA_COMERCIAL_IMAGE_SLOTS,
    ),
}


def get_page_definition(slug: str) -> WebsitePageDefinition | None:
    return WEBSITE_PAGE_DEFINITIONS.get(slug)


def list_page_definitions() -> list[WebsitePageDefinition]:
    return sorted(WEBSITE_PAGE_DEFINITIONS.values(), key=lambda p: (p.sort_order, p.slug))
