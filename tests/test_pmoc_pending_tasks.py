"""Testes de pendências de execução PMOC."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.pmoc_pending_tasks import compute_pmoc_pending_tasks
from models import PmocActivityFrequency, PmocExecutionCompletion


class _FakeSession:
    def execute(self, _query):
        raise NotImplementedError("Use monkeypatch on compute helpers in unit tests.")


def test_compute_pmoc_pending_tasks_filters_completed(monkeypatch):
    db = _FakeSession()

    monkeypatch.setattr(
        "app.pmoc_pending_tasks._build_equipment_labels",
        lambda _db, _pmoc_id: ([101], {101: "Máquina 5"}),
    )

    estimate = SimpleNamespace(
        breakdown=[SimpleNamespace(activity_id=1), SimpleNamespace(activity_id=2)],
    )
    monkeypatch.setattr("app.pmoc_pending_tasks.compute_pmoc_estimated_time", lambda *a, **k: estimate)

    activities = [
        SimpleNamespace(
            id=1,
            equipment_id=None,
            service_id=10,
            frequency=PmocActivityFrequency.MONTHLY,
            title="Limpeza filtros",
        ),
        SimpleNamespace(
            id=2,
            equipment_id=None,
            service_id=11,
            frequency=PmocActivityFrequency.MONTHLY,
            title="Verificação drenos",
        ),
    ]

    class _ActResult:
        def scalars(self):
            return self

        def all(self):
            return activities

    services = {
        10: SimpleNamespace(id=10, name="Limpeza de Filtros"),
        11: SimpleNamespace(id=11, name="Verificação de Drenos"),
    }

    class _SvcResult:
        def scalars(self):
            return self

        def all(self):
            return list(services.values())

    executions = [
        SimpleNamespace(
            scheduled_activity_id=1,
            equipment_id=101,
            completion_status=PmocExecutionCompletion.DONE,
            executed_at=datetime(2026, 5, 10, tzinfo=timezone.utc),
        ),
    ]

    class _ExecResult:
        def scalars(self):
            return self

        def all(self):
            return executions

    calls = {"n": 0}

    def fake_execute(_query):
        calls["n"] += 1
        if calls["n"] == 1:
            return _ActResult()
        if calls["n"] == 2:
            return _SvcResult()
        return _ExecResult()

    db.execute = fake_execute  # type: ignore[method-assign]

    result = compute_pmoc_pending_tasks(
        db,  # type: ignore[arg-type]
        pmoc_id=1,
        tenant_id=1,
        year=2026,
        month=5,
    )

    assert len(result.tasks) == 1
    assert result.tasks[0].equipment_label == "Máquina 5"
    assert result.tasks[0].service_name == "Verificação de Drenos"
    assert result.tasks[0].activity_id == 2
