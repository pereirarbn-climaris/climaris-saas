"""Planos SaaS expostos publicamente no site institucional."""

from pydantic import BaseModel


class PublicPlanOut(BaseModel):
    plan_key: str
    display_name: str
    website_tier: str
    description: str
    finance_max_mode: str
    finance_label: str
    dashboard_tier: str = "basic"
    dashboard_label: str = "Básico"
    max_users: int | None
    monthly_price_brl: float | None
    sort_order: int
    highlighted: bool = False
    is_free_trial: bool = False
    trial_days: int | None = None
    cta: str = "lead"
