"""Tests for the Excel template download + upload-parse roundtrip."""
from __future__ import annotations

import pytest

from app.domain.enums import DesignMode, ExportFormat
from app.export.base import BackendUnavailableError
from app.export.step_exporter import StepExporter
from app.services.export_service import ExportService
from app.services.generation_service import GenerationService
from app.services.table_template import (
    build_template_xlsx,
    columns_for,
    load_table,
)
from app.specs.repository import InMemorySpecRepository


def test_template_xlsx_is_a_zip_office_file() -> None:
    data = build_template_xlsx(DesignMode.PIPE)
    assert data[:2] == b"PK"  # xlsx is a zip container


def test_template_roundtrip_pipe() -> None:
    data = build_template_xlsx(DesignMode.PIPE)
    rows = load_table("flowcad_template_pipe.xlsx", data)
    # one example row is included in the template
    assert len(rows) == 1
    assert set(columns_for(DesignMode.PIPE)).issuperset(rows[0].keys())
    assert rows[0]["system_type"] == "pipe"
    assert rows[0]["part_type"] == "straight"
    assert float(rows[0]["size_a"]) == 100


def test_template_roundtrip_duct() -> None:
    data = build_template_xlsx(DesignMode.DUCT)
    rows = load_table("t.xlsx", data)
    assert rows[0]["system_type"] == "duct"
    assert rows[0]["part_type"] == "straight"
    assert float(rows[0]["size_a"]) == 500
    assert float(rows[0]["size_b"]) == 300


def test_load_table_csv_path() -> None:
    csv = b"run_id,seq,x,y,z,nominal\nR1,1,0,0,0,100A\nR1,2,100,0,0,100A\n"
    rows = load_table("data.csv", csv)
    assert len(rows) == 2
    assert rows[1]["x"] == "100"


def test_uploaded_template_generates_scene() -> None:
    """A filled template flows back through generation end-to-end (Plan_v2 assembly)."""
    data = build_template_xlsx(DesignMode.PIPE)
    rows = load_table("t.xlsx", data)
    rows.append({"seq": 2, "system_type": "pipe", "part_type": "elbow",
                 "angle": 90, "connect_to_seq": 1, "connect_port": "end"})
    gen = GenerationService(InMemorySpecRepository())
    scene = gen.generate(DesignMode.PIPE, rows)
    assert len(scene.elements) >= 2


def test_missing_backend_raises_501_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(StepExporter, "is_available", classmethod(lambda cls: False))
    svc = ExportService(GenerationService(InMemorySpecRepository()))
    with pytest.raises(BackendUnavailableError):
        svc.export(DesignMode.PIPE,
                   [{"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0, "nominal": "100A"},
                    {"run_id": "R1", "seq": 2, "x": 100, "y": 0, "z": 0, "nominal": "100A"}],
                   ExportFormat.STEP)
