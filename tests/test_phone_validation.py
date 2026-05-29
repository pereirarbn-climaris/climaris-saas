import pytest

from app.phone_validation import validate_phone_number


@pytest.mark.parametrize(
    "raw,expected_valid",
    [
        ("11999887766", True),
        ("+55 11 99988-7766", True),
        ("5531988776655", True),
        ("", False),
        ("12345", False),
        ("1187766", False),
        ("119887766", False),
    ],
)
def test_validate_phone_number(raw: str, expected_valid: bool) -> None:
    result = validate_phone_number(raw)
    assert result["valid"] is expected_valid
    if expected_valid:
        assert result["formatted"].startswith("+55")
        assert result["error"] is None
    else:
        assert result["error"]
