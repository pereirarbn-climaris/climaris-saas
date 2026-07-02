"""Integration Hub — Fase 2 (schema): catálogo de peças, certificações e perfis de integração.

Revision ID: 20260627_0132
Revises: 20260627_0131
Create Date: 2026-06-27
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260627_0132"
down_revision: Union[str, None] = "20260627_0131"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parts_catalog_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "manufacturer_partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manufacturer_partners.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sku", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(length=16), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_parts_catalog_entry_tenant_sku"),
    )
    op.create_index("ix_parts_catalog_entries_tenant_id", "parts_catalog_entries", ["tenant_id"])
    op.create_index(
        "ix_parts_catalog_entries_manufacturer_partner_id",
        "parts_catalog_entries",
        ["manufacturer_partner_id"],
    )

    op.create_table(
        "parts_catalog_compatibilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "parts_catalog_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("parts_catalog_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "equipment_catalog_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_catalog.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("model_code", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint(
            "parts_catalog_entry_id",
            "equipment_catalog_id",
            "model_code",
            name="uq_parts_catalog_compat_entry_catalog_model",
        ),
    )
    op.create_index(
        "ix_parts_catalog_compatibilities_parts_catalog_entry_id",
        "parts_catalog_compatibilities",
        ["parts_catalog_entry_id"],
    )
    op.create_index(
        "ix_parts_catalog_compatibilities_equipment_catalog_id",
        "parts_catalog_compatibilities",
        ["equipment_catalog_id"],
    )

    op.create_table(
        "technician_certifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "manufacturer_partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manufacturer_partners.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("certification_code", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("issued_at", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_technician_certifications_tenant_id", "technician_certifications", ["tenant_id"])
    op.create_index("ix_technician_certifications_technician_id", "technician_certifications", ["technician_id"])
    op.create_index(
        "ix_technician_certifications_manufacturer_partner_id",
        "technician_certifications",
        ["manufacturer_partner_id"],
    )
    op.create_index("ix_technician_certifications_expires_at", "technician_certifications", ["expires_at"])

    op.create_table(
        "technician_certification_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "certification_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("technician_certifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "equipment_catalog_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_catalog.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("model_code", sa.String(length=120), nullable=False),
        sa.UniqueConstraint(
            "certification_id",
            "equipment_catalog_id",
            "model_code",
            name="uq_technician_cert_model_cert_catalog_model",
        ),
    )
    op.create_index(
        "ix_technician_certification_models_certification_id",
        "technician_certification_models",
        ["certification_id"],
    )
    op.create_index(
        "ix_technician_certification_models_equipment_catalog_id",
        "technician_certification_models",
        ["equipment_catalog_id"],
    )

    op.create_table(
        "manufacturer_integration_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "manufacturer_partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manufacturer_partners.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("profile_code", sa.String(length=64), nullable=False),
        sa.Column("protocol", sa.String(length=16), nullable=False, server_default="json_rest"),
        sa.Column("auth_mode", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("base_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("config_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("secrets_ref", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "manufacturer_partner_id",
            "profile_code",
            name="uq_manufacturer_integration_profile_partner_code",
        ),
    )
    op.create_index(
        "ix_manufacturer_integration_profiles_tenant_id",
        "manufacturer_integration_profiles",
        ["tenant_id"],
    )
    op.create_index(
        "ix_manufacturer_integration_profiles_manufacturer_partner_id",
        "manufacturer_integration_profiles",
        ["manufacturer_partner_id"],
    )


def downgrade() -> None:
    op.drop_table("manufacturer_integration_profiles")
    op.drop_table("technician_certification_models")
    op.drop_table("technician_certifications")
    op.drop_table("parts_catalog_compatibilities")
    op.drop_table("parts_catalog_entries")
