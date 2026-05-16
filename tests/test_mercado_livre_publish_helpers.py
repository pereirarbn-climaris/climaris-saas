"""Testes dos helpers de payload ML (sem rede)."""

from app.mercado_livre_publish_helpers import merge_listing_payload, shipping_mercado_envios_me2


def test_merge_listing_payload_adds_attributes_and_shipping():
    base = {"title": "X", "price": 10}
    out = merge_listing_payload(
        base,
        attributes=[{"id": "BRAND", "value_name": "Generic"}],
        shipping=shipping_mercado_envios_me2(free_shipping=True),
    )
    assert out["title"] == "X"
    assert out["attributes"] == [{"id": "BRAND", "value_name": "Generic"}]
    assert out["shipping"]["mode"] == "me2"
    assert out["shipping"]["free_shipping"] is True


def test_merge_listing_payload_extends_existing_attributes():
    base = {"title": "X", "attributes": [{"id": "COLOR", "value_name": "Red"}]}
    out = merge_listing_payload(base, attributes=[{"id": "SIZE", "value_name": "M"}])
    assert len(out["attributes"]) == 2
    assert out["attributes"][0]["id"] == "COLOR"
    assert out["attributes"][1]["id"] == "SIZE"
