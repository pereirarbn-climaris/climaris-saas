"""equipment documents module (PMOC and reports)

Revision ID: 20260428_0043
Revises: 20260425_0042, 20260425_0031
Create Date: 2026-04-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260428_0043"
down_revision: Union[str, Sequence[str], None] = ("20260425_0042", "20260425_0031")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "equipment_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("responsible_user_id", sa.Integer(), nullable=True),
        sa.Column("technician_id", sa.Integer(), nullable=True),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("document_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("next_due_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pdf_s3_key", sa.String(length=255), nullable=True),
        sa.Column("pdf_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["responsible_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "document_type", "document_number", name="uq_equipment_doc_number_by_tenant_type"),
    )
    op.create_index(op.f("ix_equipment_documents_equipment_id"), "equipment_documents", ["equipment_id"], unique=False)
    op.create_index(op.f("ix_equipment_documents_responsible_user_id"), "equipment_documents", ["responsible_user_id"], unique=False)
    op.create_index(op.f("ix_equipment_documents_service_order_id"), "equipment_documents", ["service_order_id"], unique=False)
    op.create_index(op.f("ix_equipment_documents_technician_id"), "equipment_documents", ["technician_id"], unique=False)
    op.create_index(op.f("ix_equipment_documents_tenant_id"), "equipment_documents", ["tenant_id"], unique=False)

    op.create_table(
        "equipment_document_fields",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.String(length=20), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["equipment_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_equipment_document_fields_document_id"), "equipment_document_fields", ["document_id"], unique=False)

    op.create_table(
        "equipment_document_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("file_type", sa.String(length=40), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_s3_key", sa.String(length=255), nullable=True),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["equipment_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_equipment_document_attachments_document_id"),
        "equipment_document_attachments",
        ["document_id"],
        unique=False,
    )

    op.create_table(
        "equipment_document_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["equipment_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_equipment_document_events_document_id"), "equipment_document_events", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_equipment_document_events_document_id"), table_name="equipment_document_events")
    op.drop_table("equipment_document_events")
    op.drop_index(op.f("ix_equipment_document_attachments_document_id"), table_name="equipment_document_attachments")
    op.drop_table("equipment_document_attachments")
    op.drop_index(op.f("ix_equipment_document_fields_document_id"), table_name="equipment_document_fields")
    op.drop_table("equipment_document_fields")
    op.drop_index(op.f("ix_equipment_documents_tenant_id"), table_name="equipment_documents")
    op.drop_index(op.f("ix_equipment_documents_technician_id"), table_name="equipment_documents")
    op.drop_index(op.f("ix_equipment_documents_service_order_id"), table_name="equipment_documents")
    op.drop_index(op.f("ix_equipment_documents_responsible_user_id"), table_name="equipment_documents")
    op.drop_index(op.f("ix_equipment_documents_equipment_id"), table_name="equipment_documents")
    op.drop_table("equipment_documents")
