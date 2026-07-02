from app.preventive_message_ai import (
    _resolve_fidelity_config,
    validate_preventive_ai_message,
)


def test_validate_preventive_ai_message_accepts_good_text():
    base = "Olá, Maria! Faz 6 meses desde a última manutenção do Split sala."
    text = "Olá, Maria! Já se passaram 6 meses desde a manutenção do Split sala. Vamos agendar a preventiva?"
    assert validate_preventive_ai_message(text=text, rendered_body=base, client_name="Maria Silva") is True


def test_validate_preventive_ai_message_rejects_missing_client_name():
    base = "Olá, Maria! Faz 6 meses desde a última manutenção do Split sala."
    text = "Olá! Vamos agendar a preventiva do aparelho?"
    assert validate_preventive_ai_message(text=text, rendered_body=base, client_name="Maria Silva") is False


def test_validate_preventive_ai_message_rejects_urls():
    base = "Olá, João! Faz 3 meses desde a manutenção."
    text = "Olá, João! Agende em https://exemplo.com"
    assert validate_preventive_ai_message(text=text, rendered_body=base, client_name="João") is False


def test_resolve_fidelity_config_defaults_to_faithful():
    level, _prompt, temperature = _resolve_fidelity_config(None)
    assert level == "faithful"
    assert temperature == 0.05


def test_validate_preventive_ai_message_faithful_rejects_heavy_rewrite():
    base = (
        "Olá, Maria! Notamos que faz 6 meses desde a última manutenção do seu "
        "ar-condicionado Split sala (Samsung 12000 BTUs). Vamos agendar a próxima preventiva?"
    )
    text = "Oi Maria, tudo bem? Há bastante tempo sem revisar o equipamento. Que tal marcar uma visita?"
    assert (
        validate_preventive_ai_message(
            text=text,
            rendered_body=base,
            client_name="Maria Silva",
            fidelity="faithful",
        )
        is False
    )
