"""Preventive maintenance: historico, reminders, periodicidade, tenant campaign fields.

Revision ID: 0073
Revises: 0072
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("services", sa.Column("periodicidade_meses", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_services_periodicidade_meses",
        "services",
        sa.text("periodicidade_meses IS NULL OR periodicidade_meses IN (6, 12)"),
    )

    op.add_column("tenants", sa.Column("preventive_promo_image_url", sa.String(length=500), nullable=True))
    op.add_column("tenants", sa.Column("preventive_promo_image_mimetype", sa.String(length=80), nullable=True))
    op.add_column("tenants", sa.Column("preventive_technical_problem_hint", sa.Text(), nullable=True))
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_button_more_text",
            sa.String(length=80),
            nullable=False,
            server_default="Sim, quero saber mais",
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_button_schedule_text",
            sa.String(length=80),
            nullable=False,
            server_default="Agendar agora",
        ),
    )
    op.add_column("tenants", sa.Column("preventive_message_template", sa.Text(), nullable=True))

    op.create_table(
        "historico_servicos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("data_realizacao", sa.Date(), nullable=False),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_historico_servicos_tenant_id", "historico_servicos", ["tenant_id"])
    op.create_index("ix_historico_servicos_client_id", "historico_servicos", ["client_id"])
    op.create_index("ix_historico_servicos_service_id", "historico_servicos", ["service_id"])
    op.create_index("ix_historico_servicos_data_realizacao", "historico_servicos", ["data_realizacao"])

    op.create_table(
        "lembretes_preventivos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("historico_servico_id", sa.Integer(), nullable=False),
        sa.Column("reminder_kind", sa.String(length=40), nullable=False),
        sa.Column("recipient_whatsapp", sa.String(length=20), nullable=True),
        sa.Column("whatsapp_job_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["historico_servico_id"], ["historico_servicos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["whatsapp_job_id"], ["whatsapp_message_jobs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_lembretes_preventivos_tenant_id", "lembretes_preventivos", ["tenant_id"])
    op.create_index("ix_lembretes_preventivos_historico_servico_id", "lembretes_preventivos", ["historico_servico_id"])
    op.create_index("ix_lembretes_preventivos_whatsapp_job_id", "lembretes_preventivos", ["whatsapp_job_id"])

    op.create_table(
        "preventive_interest_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("historico_servico_id", sa.Integer(), nullable=True),
        sa.Column("whatsapp_digits", sa.String(length=20), nullable=False),
        sa.Column("interest_kind", sa.String(length=16), nullable=False),
        sa.Column("message_text", sa.Text(), nullable=True),
        sa.Column("raw_payload_json", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["historico_servico_id"], ["historico_servicos.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_preventive_interest_leads_tenant_id", "preventive_interest_leads", ["tenant_id"])
    op.create_index("ix_preventive_interest_leads_client_id", "preventive_interest_leads", ["client_id"])
    op.create_index("ix_preventive_interest_leads_whatsapp_digits", "preventive_interest_leads", ["whatsapp_digits"])


def downgrade() -> None:
    op.drop_index("ix_preventive_interest_leads_whatsapp_digits", table_name="preventive_interest_leads")
    op.drop_index("ix_preventive_interest_leads_client_id", table_name="preventive_interest_leads")
    op.drop_index("ix_preventive_interest_leads_tenant_id", table_name="preventive_interest_leads")
    op.drop_table("preventive_interest_leads")

    op.drop_index("ix_lembretes_preventivos_whatsapp_job_id", table_name="lembretes_preventivos")
    op.drop_index("ix_lembretes_preventivos_historico_servico_id", table_name="lembretes_preventivos")
    op.drop_index("ix_lembretes_preventivos_tenant_id", table_name="lembretes_preventivos")
    op.drop_table("lembretes_preventivos")

    op.drop_index("ix_historico_servicos_data_realizacao", table_name="historico_servicos")
    op.drop_index("ix_historico_servicos_service_id", table_name="historico_servicos")
    op.drop_index("ix_historico_servicos_client_id", table_name="historico_servicos")
    op.drop_index("ix_historico_servicos_tenant_id", table_name="historico_servicos")
    op.drop_table("historico_servicos")

    op.drop_column("tenants", "preventive_message_template")
    op.drop_column("tenants", "preventive_button_schedule_text")
    op.drop_column("tenants", "preventive_button_more_text")
    op.drop_column("tenants", "preventive_technical_problem_hint")
    op.drop_column("tenants", "preventive_promo_image_mimetype")
    op.drop_column("tenants", "preventive_promo_image_url")

    op.drop_constraint("ck_services_periodicidade_meses", "services", type_="check")
    op.drop_column("services", "periodicidade_meses")
