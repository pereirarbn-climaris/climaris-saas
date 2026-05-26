from app.service_order_meta import is_preventive_service_line, parse_checklist_items


def test_is_preventive_by_os_meta():
    desc = 'Laudo\n---CLIMARIS_OS_META---\n{"v":1,"tipoServico":"preventiva"}'
    assert is_preventive_service_line(desc, "Troca de filtro", None) is True


def test_is_preventive_by_catalog_service_name():
    assert is_preventive_service_line(None, "Higienização PMOC", None) is True


def test_is_preventive_by_periodicidade():
    assert is_preventive_service_line(None, "Serviço genérico", 6) is True


def test_is_preventive_by_service_category():
    assert is_preventive_service_line(None, "Limpeza", None, "pmoc") is True
    assert is_preventive_service_line(None, "Limpeza", None, "manutencao") is False
    assert is_preventive_service_line(None, "Limpeza", 6, "manutencao") is True


def test_not_preventive_corretiva_without_catalog_hint():
    desc = 'Laudo\n---CLIMARIS_OS_META---\n{"v":1,"tipoServico":"corretiva"}'
    assert is_preventive_service_line(desc, "Troca de capacitor", None) is False


def test_parse_checklist_items():
    desc = (
        'x\n---CLIMARIS_OS_META---\n'
        '{"v":1,"checklist":[{"id":"chk_1","descricao":"Filtro","status":"sim"}]}'
    )
    items = parse_checklist_items(desc)
    assert len(items) == 1
    assert items[0]["descricao"] == "Filtro"
    assert items[0]["status"] == "sim"
