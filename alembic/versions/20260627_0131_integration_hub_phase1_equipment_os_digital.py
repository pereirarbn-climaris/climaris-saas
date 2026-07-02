"""Integration Hub — Fase 1: equipamento industrial e OS digital.

Revision ID: 20260627_0131
Revises: 20260620_0130
Create Date: 2026-06-27
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260627_0131"
down_revision: Union[str, None] = "20260620_0130"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "manufacturer_partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("contact_email", sa.String(length=254), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_manufacturer_partner_tenant_code"),
    )
    op.create_index("ix_manufacturer_partners_tenant_id", "manufacturer_partners", ["tenant_id"])

    op.create_table(
        "equipment_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "manufacturer_partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manufacturer_partners.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "legacy_equipment_id",
            sa.Integer(),
            sa.ForeignKey("equipments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_equipment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("client_equipments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "equipment_catalog_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_catalog.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("serial_number", sa.String(length=120), nullable=False),
        sa.Column("model_code", sa.String(length=120), nullable=False),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("installation_date", sa.Date(), nullable=True),
        sa.Column("warranty_status", sa.String(length=24), nullable=False, server_default="unknown"),
        sa.Column("manufacturer_reference", sa.String(length=120), nullable=True),
        sa.Column("technical_metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "serial_number", name="uq_equipment_asset_tenant_serial"),
    )
    op.create_index("ix_equipment_assets_tenant_id", "equipment_assets", ["tenant_id"])
    op.create_index("ix_equipment_assets_client_id", "equipment_assets", ["client_id"])
    op.create_index("ix_equipment_assets_manufacturer_partner_id", "equipment_assets", ["manufacturer_partner_id"])
    op.create_index("ix_equipment_assets_legacy_equipment_id", "equipment_assets", ["legacy_equipment_id"])
    op.create_index("ix_equipment_assets_client_equipment_id", "equipment_assets", ["client_equipment_id"])
    op.create_index("ix_equipment_assets_equipment_catalog_id", "equipment_assets", ["equipment_catalog_id"])

    op.create_table(
        "equipment_warranty_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "equipment_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("warranty_type", sa.String(length=64), nullable=False, server_default="factory"),
        sa.Column("starts_at", sa.Date(), nullable=False),
        sa.Column("ends_at", sa.Date(), nullable=True),
        sa.Column("manufacturer_reference", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_equipment_warranty_records_equipment_asset_id",
        "equipment_warranty_records",
        ["equipment_asset_id"],
    )

    op.create_table(
        "digital_work_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "service_order_id",
            sa.Integer(),
            sa.ForeignKey("service_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "equipment_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("compliance_schema_version", sa.String(length=32), nullable=False, server_default="1.0"),
        sa.Column("validation_status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column(
            "required_fields_snapshot",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("validation_errors", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("offline_client_id", sa.String(length=64), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("service_order_id", name="uq_digital_work_order_service_order"),
    )
    op.create_index("ix_digital_work_orders_tenant_id", "digital_work_orders", ["tenant_id"])
    op.create_index("ix_digital_work_orders_service_order_id", "digital_work_orders", ["service_order_id"])
    op.create_index("ix_digital_work_orders_equipment_asset_id", "digital_work_orders", ["equipment_asset_id"])
    op.create_index("ix_digital_work_orders_offline_client_id", "digital_work_orders", ["offline_client_id"])

    op.create_table(
        "digital_work_order_measurements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "digital_work_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("digital_work_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("value_numeric", sa.Numeric(14, 4), nullable=True),
        sa.Column("value_text", sa.String(length=120), nullable=True),
        sa.Column("unit", sa.String(length=24), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "recorded_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recorded_offline", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sync_status", sa.String(length=16), nullable=False, server_default="synced"),
        sa.UniqueConstraint(
            "digital_work_order_id",
            "metric_key",
            name="uq_digital_work_order_measurement_key",
        ),
    )
    op.create_index(
        "ix_digital_work_order_measurements_digital_work_order_id",
        "digital_work_order_measurements",
        ["digital_work_order_id"],
    )
    op.create_index(
        "ix_digital_work_order_measurements_recorded_by_user_id",
        "digital_work_order_measurements",
        ["recorded_by_user_id"],
    )

    op.create_table(
        "digital_work_order_evidences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "digital_work_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("digital_work_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("evidence_type", sa.String(length=16), nullable=False, server_default="photo"),
        sa.Column("evidence_key", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("accuracy_meters", sa.Numeric(10, 2), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "captured_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("captured_offline", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sync_status", sa.String(length=16), nullable=False, server_default="synced"),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index(
        "ix_digital_work_order_evidences_digital_work_order_id",
        "digital_work_order_evidences",
        ["digital_work_order_id"],
    )
    op.create_index(
        "ix_digital_work_order_evidences_captured_by_user_id",
        "digital_work_order_evidences",
        ["captured_by_user_id"],
    )


def downgrade() -> None:
    op.drop_table("digital_work_order_evidences")
    op.drop_table("digital_work_order_measurements")
    op.drop_table("digital_work_orders")
    op.drop_table("equipment_warranty_records")
    op.drop_table("equipment_assets")
    op.drop_table("manufacturer_partners")
