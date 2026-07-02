from app.plan_rules import get_plan_definition


def test_free_plan_includes_whatsapp_module() -> None:
    assert get_plan_definition("free_30d").whatsapp_module_included is True
    assert get_plan_definition("starter").whatsapp_module_included is True


def test_basic_plan_requires_marketplace_whatsapp() -> None:
    assert get_plan_definition("basic").whatsapp_module_included is False
