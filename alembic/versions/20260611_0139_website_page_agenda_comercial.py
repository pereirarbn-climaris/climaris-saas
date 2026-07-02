"""website page agenda comercial"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "20260611_0139"
down_revision = "20260611_0138"
branch_labels = None
depends_on = None

_SECTIONS = [
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

_OUTCOMES = [
    "Menos conflito de horários entre comercial e operação",
    "Visitas e OS sempre alinhadas ao que foi combinado",
    "Expediente e feriados respeitados automaticamente",
    "Mais produtividade com roteiro comercial organizado",
]


def upgrade() -> None:
    sections_json = json.dumps(_SECTIONS)
    outcomes_json = json.dumps(_OUTCOMES)
    op.execute(
        sa.text(
            """
            INSERT INTO platform_website_pages (
                slug, label, path, title, subtitle, hero_description,
                seo_title, seo_description, sections_json, outcomes_json, sort_order
            ) VALUES (
                'agenda-comercial',
                'Agenda Comercial',
                '/funcionalidades/agenda-comercial',
                'Agenda Comercial',
                'Visitas, instalações e manutenções no mesmo calendário do escritório',
                'Calendário integrado para agendar visitas técnicas, instalações e manutenções — comercial e operação alinhados, sem conflito de horários nem retrabalho entre equipes.',
                'Agenda Comercial — ERP para Climatização',
                'Calendário integrado para agendar visitas, instalações e manutenções. Visão diária e semanal, vínculo com OS e bloqueio de feriados no Climaris.',
                CAST(:sections AS jsonb),
                CAST(:outcomes AS jsonb),
                20
            )
            ON CONFLICT (slug) DO NOTHING
            """
        ).bindparams(sections=sections_json, outcomes=outcomes_json)
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM platform_website_pages WHERE slug = 'agenda-comercial'"))
