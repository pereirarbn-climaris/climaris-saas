from app.whatsapp_error_messages import humanize_whatsapp_send_error, whatsapp_template_label


def test_whatsapp_template_label_reminder():
    assert whatsapp_template_label("appointment_reminder") == "lembrete de agendamento"
    assert whatsapp_template_label("appointment_reminder_1440m") == "lembrete de agendamento"


def test_humanize_number_not_on_whatsapp():
    raw = (
        'Evolution API retornou HTTP 400: {"status":400,"error":"Bad Request",'
        '"response":{"message":[{"jid":"5516952575675@s.whatsapp.net","exists":false,'
        '"number":"5516952575675"}]}}'
    )
    msg = humanize_whatsapp_send_error(raw)
    assert "não está cadastrado no WhatsApp" in msg
    assert "5516952575675" not in msg or "(16)" in msg


def test_humanize_connection_error():
    raw = "Sem conexão com Evolution API: timed out"
    msg = humanize_whatsapp_send_error(raw)
    assert "Sem conexão com o servidor WhatsApp" in msg
