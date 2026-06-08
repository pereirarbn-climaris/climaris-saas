from app.tenant_lifecycle import _iter_tenant_scoped_models
from models import Tenant, User


def test_iter_tenant_scoped_models_skips_tenant_and_users():
    models = _iter_tenant_scoped_models()
    assert Tenant not in models
    assert User not in models
    assert len(models) > 0
