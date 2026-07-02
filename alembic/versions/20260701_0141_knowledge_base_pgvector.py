"""Knowledge Base RAG: pgvector + manual chunks.

Revision ID: 20260701_0141
Revises: 20260701_0140
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision = "20260701_0141"
down_revision = "20260701_0140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column(
        "equipment_manuals",
        sa.Column("ingestion_status", sa.String(length=16), nullable=False, server_default="pending"),
    )
    op.add_column("equipment_manuals", sa.Column("ingestion_error", sa.Text(), nullable=True))
    op.add_column("equipment_manuals", sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "manual_knowledge_chunks",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "manual_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("equipment_manuals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("metadata_json", sa.dialects.postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_manual_knowledge_chunks_tenant_id", "manual_knowledge_chunks", ["tenant_id"])
    op.create_index("ix_manual_knowledge_chunks_manual_id", "manual_knowledge_chunks", ["manual_id"])
    op.create_index("ix_manual_knowledge_chunks_brand", "manual_knowledge_chunks", ["brand"])
    op.create_index("ix_manual_knowledge_chunks_model", "manual_knowledge_chunks", ["model"])
    op.create_index(
        "ix_manual_knowledge_chunks_embedding_hnsw",
        "manual_knowledge_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_manual_knowledge_chunks_embedding_hnsw", table_name="manual_knowledge_chunks")
    op.drop_index("ix_manual_knowledge_chunks_model", table_name="manual_knowledge_chunks")
    op.drop_index("ix_manual_knowledge_chunks_brand", table_name="manual_knowledge_chunks")
    op.drop_index("ix_manual_knowledge_chunks_manual_id", table_name="manual_knowledge_chunks")
    op.drop_index("ix_manual_knowledge_chunks_tenant_id", table_name="manual_knowledge_chunks")
    op.drop_table("manual_knowledge_chunks")

    op.drop_column("equipment_manuals", "ingested_at")
    op.drop_column("equipment_manuals", "ingestion_error")
    op.drop_column("equipment_manuals", "ingestion_status")
