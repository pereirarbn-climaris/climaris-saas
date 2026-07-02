"""platform website pages"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260611_0138"
down_revision = "20260611_0137"
branch_labels = None
depends_on = None

_DEFAULT_SECTIONS = [
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

_DEFAULT_OUTCOMES = [
    "Menos retrabalho entre comercial, operação e financeiro",
    "Histórico confiável por cliente e equipamento",
    "Contratos recorrentes organizados e executáveis",
    "Gestão profissional mesmo com equipe em crescimento",
]


def upgrade() -> None:
    op.create_table(
        "platform_website_pages",
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("path", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("subtitle", sa.String(length=200), nullable=False),
        sa.Column("hero_description", sa.String(length=500), nullable=False),
        sa.Column("seo_title", sa.String(length=200), nullable=False),
        sa.Column("seo_description", sa.String(length=500), nullable=False),
        sa.Column("sections_json", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("outcomes_json", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("images_json", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("slug"),
    )

    sections_json = json.dumps(_DEFAULT_SECTIONS)
    outcomes_json = json.dumps(_DEFAULT_OUTCOMES)
    op.execute(
        sa.text(
            """
            INSERT INTO platform_website_pages (
                slug, label, path, title, subtitle, hero_description,
                seo_title, seo_description, sections_json, outcomes_json, sort_order
            ) VALUES (
                'gestao-empresarial',
                'Gestão Empresarial',
                '/funcionalidades/gestao-empresarial',
                'Gestão Empresarial',
                'Operação, contratos e clientes no mesmo painel',
                'Centralize ordens de serviço, contratos recorrentes, histórico por equipamento e indicadores da operação — do primeiro contato ao laudo assinado, sem planilhas paralelas.',
                'Gestão Empresarial — ERP para Climatização',
                'Centralize ordens de serviço, contratos recorrentes, histórico por equipamento e indicadores da operação — do primeiro contato ao laudo assinado, sem planilhas paralelas.',
                CAST(:sections AS jsonb),
                CAST(:outcomes AS jsonb),
                10
            )
            """
        ).bindparams(sections=sections_json, outcomes=outcomes_json)
    )


def downgrade() -> None:
    op.drop_table("platform_website_pages")
