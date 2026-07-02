"""Extrai vácuo final de arquivos .tjf (Testo JSON Format)."""

from __future__ import annotations

import json
from typing import Any


def _channel_meas_type(channel: dict[str, Any]) -> str:
    for row in channel.get("additionalData") or []:
        if isinstance(row, dict) and row.get("name") == "measType":
            val = row.get("value")
            return str(val).strip() if val is not None else ""
    return ""


def _channel_unit(channel: dict[str, Any]) -> str:
    unit = channel.get("unit")
    if isinstance(unit, dict):
        return str(unit.get("name") or "").strip().lower()
    return ""


def _micron_from_channel(channel: dict[str, Any]) -> float | None:
    values = channel.get("values")
    if not isinstance(values, list) or not values:
        return None
    nums: list[float] = []
    for row in values:
        if isinstance(row, dict):
            val = row.get("value")
            if isinstance(val, (int, float)):
                nums.append(float(val))
    if not nums:
        return None
    last = nums[-1]
    minimum = min(nums)
    return min(last, minimum)


def parse_testo_tjf_bytes(raw: bytes) -> dict[str, str | None]:
    """Retorna vacuo_final_microns e metadados do equipamento Testo."""
    empty: dict[str, str | None] = {
        "vacuo_final_microns": None,
        "device_name": None,
        "device_serial": None,
        "measurement_type": None,
    }
    try:
        text = raw.decode("utf-8")
        data = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return empty

    if not isinstance(data, dict):
        return empty

    channels = data.get("channels")
    if not isinstance(channels, list):
        return empty

    channel: dict[str, Any] | None = None
    for preferred in ("MinimumPressure", "VacuumPressure"):
        for ch in channels:
            if not isinstance(ch, dict):
                continue
            meas = _channel_meas_type(ch) or str((ch.get("type") or {}).get("name") or "")
            unit = _channel_unit(ch)
            if meas == preferred and ("micron" in unit or unit == "µ"):
                channel = ch
                break
        if channel:
            break

    if channel is None:
        for ch in channels:
            if isinstance(ch, dict) and "micron" in _channel_unit(ch) and ch.get("values"):
                channel = ch
                break

    microns = _micron_from_channel(channel) if channel else None
    device = data.get("device")
    device_row = device[0] if isinstance(device, list) and device and isinstance(device[0], dict) else {}
    meas_type = data.get("type")
    meas_name = None
    if isinstance(meas_type, dict):
        meas_name = str(meas_type.get("name") or meas_type.get("id") or "").strip() or None

    vacuo_str = None
    if microns is not None and microns > 0:
        vacuo_str = str(int(microns)) if microns == int(microns) else str(microns)

    return {
        "vacuo_final_microns": vacuo_str,
        "device_name": str(device_row.get("name") or "").strip() or None,
        "device_serial": str(device_row.get("serial") or "").strip() or None,
        "measurement_type": meas_name,
    }
