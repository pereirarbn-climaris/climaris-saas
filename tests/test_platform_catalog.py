from __future__ import annotations

from app.services import platform_catalog as mod


def test_lookup_tuple_dedupes_when_same_tenant(monkeypatch):
    monkeypatch.setattr(mod, "get_platform_catalog_tenant_id", lambda _db: 9)
    assert mod.catalog_tenant_ids_for_lookup(object(), 9) == (9,)
    assert mod.catalog_tenant_ids_for_lookup(object(), 6) == (6, 9)
