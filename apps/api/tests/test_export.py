"""Tests for the export engine. Each format is produced for real and its
file signature is asserted. STEP is skipped if the OCP backend is absent.
"""
from __future__ import annotations

import pytest

from app.domain.enums import DesignMode, ExportFormat
from app.export.factory import ExporterFactory
from app.services.export_service import ExportService
from app.services.generation_service import GenerationService
from app.specs.repository import InMemorySpecRepository


@pytest.fixture()
def export_service() -> ExportService:
    gen = GenerationService(specs=InMemorySpecRepository())
    return ExportService(generation=gen)


def _rows() -> list[dict]:
    return [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "joint_no": "JNT-001"},
        {"run_id": "R1", "seq": 2, "x": 2000, "y": 0, "z": 0,
         "nominal": "100A", "schedule": "Sch40", "fitting": "elbow",
         "joint_no": "JNT-002"},
        {"run_id": "R1", "seq": 3, "x": 2000, "y": 0, "z": 1500,
         "nominal": "100A", "schedule": "Sch40", "fitting": "valve",
         "joint_no": "JNT-003"},
    ]


def test_factory_reports_availability() -> None:
    avail = ExporterFactory().availability()
    assert set(avail) == {"dxf", "pdf", "ifc", "step"}
    assert avail["dxf"] is True  # ezdxf is a hard dependency


def test_dxf_export(export_service: ExportService) -> None:
    result = export_service.export(DesignMode.PIPE, _rows(), ExportFormat.DXF)
    assert result.filename.endswith(".dxf")
    assert b"SECTION" in result.content
    assert b"JNT-001" in result.content  # joint label present


def test_pdf_export(export_service: ExportService) -> None:
    result = export_service.export(DesignMode.PIPE, _rows(), ExportFormat.PDF)
    assert result.content.startswith(b"%PDF")
    assert result.media_type == "application/pdf"


def test_ifc_export(export_service: ExportService) -> None:
    result = export_service.export(DesignMode.PIPE, _rows(), ExportFormat.IFC)
    text = result.content
    assert b"ISO-10303-21" in text
    assert b"IFCPIPESEGMENT" in text.upper()
    assert b"Pset_FlowCAD" in text  # metadata property set
    assert b"JNT-001" in text


@pytest.mark.skipif(
    not ExporterFactory().for_format(ExportFormat.STEP).is_available(),
    reason="OCP (cadquery-ocp) not installed",
)
def test_step_export(export_service: ExportService) -> None:
    result = export_service.export(DesignMode.PIPE, _rows(), ExportFormat.STEP)
    text = result.content
    assert b"ISO-10303-21" in text
    assert b"MANIFOLD_SOLID_BREP" in text.upper() or b"CLOSED_SHELL" in text.upper()


def test_duct_dxf_export(export_service: ExportService) -> None:
    rows = [
        {"run_id": "D1", "seq": 1, "x": 0, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
        {"run_id": "D1", "seq": 2, "x": 3000, "y": 0, "z": 0,
         "shape": "rectangular", "width": 400, "height": 300},
    ]
    result = export_service.export(DesignMode.DUCT, rows, ExportFormat.DXF)
    assert b"SECTION" in result.content
