"""Initial ERP multi-tenant schema.

Revision ID: 20260417_0001
Revises:
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260417_0001"
down_revision = None
branch_labels = None
depends_on = None


tenant_status_enum = postgresql.ENUM("active", "suspended", "cancelled", name="tenant_status", create_type=False)
user_role_enum = postgresql.ENUM("admin", "technician", "receptionist", name="user_role", create_type=False)
order_status_enum = postgresql.ENUM("open", "in_progress", "done", "cancelled", name="order_status", create_type=False)
schedule_status_enum = postgresql.ENUM(
    "pending", "confirmed", "in_progress", "completed", "cancelled", name="schedule_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    tenant_status_enum.create(bind, checkfirst=True)
    user_role_enum.create(bind, checkfirst=True)
    order_status_enum.create(bind, checkfirst=True)
    schedule_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("cnpj", sa.String(length=18), nullable=False),
        sa.Column("active_plan", sa.String(length=80), nullable=False),
        sa.Column("status", tenant_status_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cnpj"),
    )
    op.create_index("ix_tenants_cnpj", "tenants", ["cnpj"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"], unique=False)

    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("document", sa.String(length=20), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "document", name="uq_clients_tenant_document"),
    )
    op.create_index("ix_clients_tenant_id", "clients", ["tenant_id"], unique=False)

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("sku", sa.String(length=50), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_products_tenant_sku"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"], unique=False)

    op.create_table(
        "service_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", order_status_enum, nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_service_orders_tenant_id", "service_orders", ["tenant_id"], unique=False)
    op.create_index("ix_service_orders_client_id", "service_orders", ["client_id"], unique=False)

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", schedule_status_enum, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_schedules_tenant_id", "schedules", ["tenant_id"], unique=False)
    op.create_index("ix_schedules_client_id", "schedules", ["client_id"], unique=False)
    op.create_index("ix_schedules_starts_at", "schedules", ["starts_at"], unique=False)
    op.create_index("ix_schedules_ends_at", "schedules", ["ends_at"], unique=False)

    op.create_table(
        "service_order_technicians",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_order_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("service_order_id", "technician_id", name="uq_order_technician"),
    )
    op.create_index(
        "ix_service_order_technicians_service_order_id",
        "service_order_technicians",
        ["service_order_id"],
        unique=False,
    )
    op.create_index(
        "ix_service_order_technicians_technician_id",
        "service_order_technicians",
        ["technician_id"],
        unique=False,
    )

    op.create_table(
        "schedule_technicians",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("schedule_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("schedule_id", "technician_id", name="uq_schedule_technician"),
    )
    op.create_index("ix_schedule_technicians_schedule_id", "schedule_technicians", ["schedule_id"], unique=False)
    op.create_index(
        "ix_schedule_technicians_technician_id", "schedule_technicians", ["technician_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_schedule_technicians_technician_id", table_name="schedule_technicians")
    op.drop_index("ix_schedule_technicians_schedule_id", table_name="schedule_technicians")
    op.drop_table("schedule_technicians")

    op.drop_index("ix_service_order_technicians_technician_id", table_name="service_order_technicians")
    op.drop_index("ix_service_order_technicians_service_order_id", table_name="service_order_technicians")
    op.drop_table("service_order_technicians")

    op.drop_index("ix_schedules_ends_at", table_name="schedules")
    op.drop_index("ix_schedules_starts_at", table_name="schedules")
    op.drop_index("ix_schedules_client_id", table_name="schedules")
    op.drop_index("ix_schedules_tenant_id", table_name="schedules")
    op.drop_table("schedules")

    op.drop_index("ix_service_orders_client_id", table_name="service_orders")
    op.drop_index("ix_service_orders_tenant_id", table_name="service_orders")
    op.drop_table("service_orders")

    op.drop_index("ix_products_tenant_id", table_name="products")
    op.drop_table("products")

    op.drop_index("ix_clients_tenant_id", table_name="clients")
    op.drop_table("clients")

    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_tenants_cnpj", table_name="tenants")
    op.drop_table("tenants")

    bind = op.get_bind()
    schedule_status_enum.drop(bind, checkfirst=True)
    order_status_enum.drop(bind, checkfirst=True)
    user_role_enum.drop(bind, checkfirst=True)
    tenant_status_enum.drop(bind, checkfirst=True)
