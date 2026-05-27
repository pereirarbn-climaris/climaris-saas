"""Configuração de gestão preventiva no cadastro de serviços."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status

from models import Service

PreventiveIntervalKind = Literal["days", "months", "years"]


def preventive_config_from_service(service: Service) -> dict[str, object | None]:
    """Normaliza leitura (inclui legado `periodicidade_meses`)."""
    if service.preventive_enabled and service.preventive_interval_type and service.preventive_interval_value:
        return {
            "preventive_enabled": True,
            "preventive_interval_type": str(service.preventive_interval_type),
            "preventive_interval_value": int(service.preventive_interval_value),
        }
    per = service.periodicidade_meses
    if per is not None and int(per) > 0:
        return {
            "preventive_enabled": True,
            "preventive_interval_type": "months",
            "preventive_interval_value": int(per),
        }
    return {
        "preventive_enabled": False,
        "preventive_interval_type": None,
        "preventive_interval_value": None,
    }


def _validate_interval_value(interval_type: PreventiveIntervalKind, interval_value: int) -> int:
    value = int(interval_value)
    if interval_type in ("months", "years"):
        if value < 1 or value > 12:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Para meses ou anos, escolha um valor entre 1 e 12.",
            )
        return value
    if value < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe a quantidade de dias (mínimo 1).",
        )
    if value > 3650:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantidade de dias acima do limite (3650).",
        )
    return value


def apply_preventive_config_to_service(
    service: Service,
    *,
    enabled: bool,
    interval_type: PreventiveIntervalKind | None = None,
    interval_value: int | None = None,
) -> None:
    """Persiste gestão preventiva e mantém `periodicidade_meses` para fluxos legados."""
    if not enabled:
        service.preventive_enabled = False
        service.preventive_interval_type = None
        service.preventive_interval_value = None
        service.periodicidade_meses = None
        return

    if interval_type not in ("days", "months", "years"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de intervalo inválido. Use dias, meses ou anos.",
        )
    if interval_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o intervalo da gestão preventiva.",
        )

    value = _validate_interval_value(interval_type, interval_value)
    service.preventive_enabled = True
    service.preventive_interval_type = interval_type
    service.preventive_interval_value = value

    if interval_type == "months":
        service.periodicidade_meses = value
    elif interval_type == "years":
        service.periodicidade_meses = value * 12
    else:
        service.periodicidade_meses = None
