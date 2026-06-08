from app.feature_flags import is_feature_enabled, merge_features_enabled, normalize_features_enabled


class _TenantStub:
    def __init__(self, features):
        self.features_enabled = features


def test_normalize_features_enabled_empty():
    assert normalize_features_enabled(None) == {}
    assert normalize_features_enabled({}) == {}


def test_normalize_features_enabled_coerces_bool():
    assert normalize_features_enabled({"new_laudo": True, "dre_dashboard": 0}) == {
        "new_laudo": True,
        "dre_dashboard": False,
    }


def test_merge_features_enabled_only_known():
    merged = merge_features_enabled({"new_laudo": False}, {"new_laudo": True, "unknown": True})
    assert merged == {"new_laudo": True}


def test_is_feature_enabled():
    tenant = _TenantStub({"new_laudo": True, "dre_dashboard": False})
    assert is_feature_enabled(tenant, "new_laudo") is True
    assert is_feature_enabled(tenant, "dre_dashboard") is False
    assert is_feature_enabled(tenant, "missing") is False
