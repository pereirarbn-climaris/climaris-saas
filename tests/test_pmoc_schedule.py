"""Testes do cronograma PMOC — periodicidade e tempo estimado."""

from app.pmoc_schedule import activity_due_in_month
from models import PmocActivityFrequency


def test_activity_due_in_month_monthly():
    assert activity_due_in_month(PmocActivityFrequency.MONTHLY, 3) is True
    assert activity_due_in_month(PmocActivityFrequency.MONTHLY, 12) is True


def test_activity_due_in_month_quarterly():
    assert activity_due_in_month(PmocActivityFrequency.QUARTERLY, 1) is True
    assert activity_due_in_month(PmocActivityFrequency.QUARTERLY, 4) is True
    assert activity_due_in_month(PmocActivityFrequency.QUARTERLY, 2) is False


def test_activity_due_in_month_semiannual():
    assert activity_due_in_month(PmocActivityFrequency.SEMIANNUAL, 1) is True
    assert activity_due_in_month(PmocActivityFrequency.SEMIANNUAL, 7) is True
    assert activity_due_in_month(PmocActivityFrequency.SEMIANNUAL, 3) is False


def test_activity_due_in_month_annual():
    assert activity_due_in_month(PmocActivityFrequency.ANNUAL, 1) is True
    assert activity_due_in_month(PmocActivityFrequency.ANNUAL, 6) is False
