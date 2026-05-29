from __future__ import annotations

import random

SendSpeed = str

SEND_SPEED_FAST: SendSpeed = "fast"
SEND_SPEED_MEDIUM: SendSpeed = "medium"
SEND_SPEED_SLOW: SendSpeed = "slow"

_SPEED_RANGES: dict[str, tuple[float, float]] = {
    SEND_SPEED_FAST: (1.0, 2.0),
    SEND_SPEED_MEDIUM: (5.0, 8.0),
    SEND_SPEED_SLOW: (15.0, 30.0),
}


def pick_delay_seconds(send_speed: str | None) -> float:
    key = (send_speed or SEND_SPEED_FAST).strip().lower()
    lo, hi = _SPEED_RANGES.get(key, _SPEED_RANGES[SEND_SPEED_FAST])
    return random.uniform(lo, hi)


def average_delay_seconds(send_speed: str | None) -> float:
    key = (send_speed or SEND_SPEED_FAST).strip().lower()
    lo, hi = _SPEED_RANGES.get(key, _SPEED_RANGES[SEND_SPEED_FAST])
    return (lo + hi) / 2.0


def estimate_duration_seconds(total_recipients: int, send_speed: str | None) -> float:
    if total_recipients <= 0:
        return 0.0
    return max(0.0, (total_recipients - 1) * average_delay_seconds(send_speed))
