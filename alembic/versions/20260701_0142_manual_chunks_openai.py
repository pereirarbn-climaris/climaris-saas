"""Substitui manual_knowledge_chunks por manual_chunks (OpenAI + metadados).

Revision ID: 20260701_0142
Revises: 20260701_0141
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision = "20260701_0142"
down_revision = "20260701_0141"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "manual_knowledge_chunks" in inspector.get_table_names():
        op.drop_index("ix_manual_knowledge_chunks_embedding_hnsw", table_name="manual_knowledge_chunks")
        op.drop_index("ix_manual_knowledge_chunks_model", table_name="manual_knowledge_chunks")
        op.drop_index("ix_manual_knowledge_chunks_brand", table_name="manual_knowledge_chunks")
        op.drop_index("ix_manual_knowledge_chunks_manual_id", table_name="manual_knowledge_chunks")
        op.drop_index("ix_manual_knowledge_chunks_tenant_id", table_name="manual_knowledge_chunks")
        op.drop_table("manual_knowledge_chunks")

    inspector = sa.inspect(bind)
    if "manual_chunks" not in inspector.get_table_names():
        op.create_table(
            "manual_chunks",
            sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "manual_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("equipment_manuals.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("fabricante", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("modelo", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("tipo_documento", sa.String(length=80), nullable=False, server_default="manual_tecnico"),
            sa.Column("versao", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("pagina_origem", sa.Integer(), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("embedding", Vector(1536), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_manual_chunks_tenant_id", "manual_chunks", ["tenant_id"])
        op.create_index("ix_manual_chunks_manual_id", "manual_chunks", ["manual_id"])
        op.create_index("ix_manual_chunks_fabricante", "manual_chunks", ["fabricante"])
        op.create_index("ix_manual_chunks_modelo", "manual_chunks", ["modelo"])
        op.create_index("ix_manual_chunks_tipo_documento", "manual_chunks", ["tipo_documento"])
        op.create_index("ix_manual_chunks_pagina_origem", "manual_chunks", ["pagina_origem"])
        op.create_index(
            "ix_manual_chunks_embedding_hnsw",
            "manual_chunks",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "manual_chunks" in inspector.get_table_names():
        op.drop_index("ix_manual_chunks_embedding_hnsw", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_pagina_origem", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_tipo_documento", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_modelo", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_fabricante", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_manual_id", table_name="manual_chunks")
        op.drop_index("ix_manual_chunks_tenant_id", table_name="manual_chunks")
        op.drop_table("manual_chunks")
