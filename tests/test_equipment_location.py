from app.equipment_location import format_equipment_location_label


def test_format_equipment_location_label_with_reference():
    label = format_equipment_location_label(
        identificacao="Máquina 5",
        local_instalacao="Sala 01",
        installation_reference="Teto falso - Ao lado da janela",
        equipment_id=5,
    )
    assert label == "Máquina 5 (Sala 01 · Teto falso - Ao lado da janela)"


def test_format_equipment_location_label_reference_only():
    label = format_equipment_location_label(
        identificacao="Split",
        installation_reference="Corredor norte, 2º andar",
    )
    assert label == "Split (Corredor norte, 2º andar)"
