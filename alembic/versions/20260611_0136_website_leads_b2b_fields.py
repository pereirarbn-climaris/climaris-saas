"""website leads B2B fields + platform website B2B copy"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "20260611_0136"
down_revision = "20260611_0135"
branch_labels = None
depends_on = None

_NEW_SERVICES = [
    "Gestão operacional e ordens de serviço",
    "Inteligência financeira integrada",
    "Laudos e conformidade PMOC",
    "Orçamentos e contratos recorrentes",
]


def upgrade() -> None:
    op.add_column("website_leads", sa.Column("job_title", sa.String(length=80), nullable=True))
    op.add_column(
        "website_leads", sa.Column("technicians_count", sa.String(length=24), nullable=True)
    )

    services_json = json.dumps(_NEW_SERVICES)
    op.execute(
        sa.text(
            """
            UPDATE platform_website_settings
            SET
              hero_title = :hero_title,
              hero_subtitle = :hero_subtitle,
              seo_title = :seo_title,
              seo_description = :seo_description,
              services_json = CAST(:services_json AS JSONB)
            WHERE id = 1
            """
        ).bindparams(
            hero_title=(
                "Aumente a produtividade da sua equipe de campo e a rentabilidade dos seus contratos"
            ),
            hero_subtitle=(
                "O Climaris é o software B2B de gestão para empresas de climatização e refrigeração: "
                "contratos, orçamentos, OS, financeiro e conformidade técnica (PMOC) em uma plataforma."
            ),
            seo_title="Climaris — Software de Gestão para Empresas de Climatização e Refrigeração",
            seo_description=(
                "Sistema completo para gestão de contratos, orçamentos e conformidade técnica (PMOC). "
                "Software para empresas de refrigeração com gestão de OS e inteligência financeira."
            ),
            services_json=services_json,
        )
    )


def downgrade() -> None:
    op.drop_column("website_leads", "technicians_count")
    op.drop_column("website_leads", "job_title")
