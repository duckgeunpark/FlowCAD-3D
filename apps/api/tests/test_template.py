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
    normalize_table_rows,
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
    """The duct template is now the v2 schema (Duct3D_Input); the REQ/OPT spec
    row is skipped and the example DATA row survives the round-trip."""
    data = build_template_xlsx(DesignMode.DUCT)
    rows = load_table("t.xlsx", data)
    assert len(rows) == 1  # spec row dropped, one example DATA row
    assert rows[0]["element_id"] == "E0001"
    assert rows[0]["element_type"] == "STRAIGHT"
    assert rows[0]["family_code"] == "STRAIGHT_RECT"
    assert rows[0]["shape_code"] == "RECT"
    assert float(rows[0]["width"]) == 500
    assert float(rows[0]["height"]) == 300


def test_load_table_csv_path() -> None:
    csv = b"run_id,seq,x,y,z,nominal\nR1,1,0,0,0,100A\nR1,2,100,0,0,100A\n"
    rows = load_table("data.csv", csv)
    assert len(rows) == 2
    assert rows[1]["X"] == "100"


def test_normalize_korean_catalog_headers() -> None:
    rows = normalize_table_rows([
        {
            "순번": 1,
            "계통": "duct",
            "표준피팅": "rect_radius_elbow",
            "가로": 500,
            "세로": 300,
            "각도": 90,
            "엘보방향": "up",
            "연결포트": "end",
        }
    ])
    assert rows == [{
        "seq": 1,
        "system_type": "duct",
        "part_type": "rect_radius_elbow",
        "W": 500,
        "H": 300,
        "angle": 90,
        "bend_to": "up",
        "connect_port": "end",
        "size_a": 500,
        "size_b": 300,
    }]


def test_load_table_csv_uses_shared_normalization() -> None:
    csv = "순번,계통,표준피팅,가로,세로,길이,연결포트\n1,duct,rect_straight,500,300,1220,start\n"
    rows = load_table("data.csv", csv.encode("utf-8-sig"))
    assert rows[0]["part_type"] == "rect_straight"
    assert rows[0]["W"] == "500"
    assert rows[0]["H"] == "300"
    assert rows[0]["L"] == "1220"
    assert rows[0]["size_a"] == "500"
    assert rows[0]["size_b"] == "300"
    assert rows[0]["length"] == "1220"


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
