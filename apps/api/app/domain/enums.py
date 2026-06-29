"""Core enumerations shared across the domain layer."""
from __future__ import annotations

from enum import Enum


class DesignMode(str, Enum):
    """Top-level design mode selected by the user (plan §3.1)."""

    PIPE = "pipe"
    DUCT = "duct"


class ComponentKind(str, Enum):
    """Logical kind of a generated component.

    This is the *contract* vocabulary shared with the frontend GeometryFactory.
    Add new kinds here and implement them in both geometry factories.
    """

    PIPE_SEGMENT = "pipe_segment"
    ELBOW = "elbow"
    TEE = "tee"
    VALVE = "valve"
    DUCT_SEGMENT = "duct_segment"
    TRANSITION = "transition"
    DAMPER = "damper"
    ERROR_MARKER = "error_marker"
    # v2 duct schema additions (duct_3d_sheet_v2). WYE/CROSS/CAP/TAP and the
    # multi-branch SPLITTER (e.g. bullhead tee / double-elbow splitter) are first
    # class so the frontend GeometryFactory can render each distinctly.
    WYE = "wye"
    CROSS = "cross"
    CAP = "cap"
    TAP = "tap"
    SPLITTER = "splitter"


class DuctShape(str, Enum):
    RECTANGULAR = "rectangular"
    ROUND = "round"
    OVAL = "oval"
    FLAT_OVAL = "flat_oval"


class ExportFormat(str, Enum):
    """External CAD/BIM export targets (plan §2.4 Export Engine)."""

    DXF = "dxf"      # 3D DXF for AutoCAD (ezdxf)
    PDF = "pdf"      # 2D isometric drawing (matplotlib)
    IFC = "ifc"      # BIM for Revit/Navisworks (IfcOpenShell)
    STEP = "step"    # mechanical CAD for SolidWorks/CATIA (OpenCASCADE)
