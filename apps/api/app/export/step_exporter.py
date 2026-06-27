"""STEP (AP242) exporter (OpenCASCADE via cadquery-ocp) — SolidWorks / CATIA.

Produces real B-rep solids (the only STEP geometry that mechanical CAD tools
import as individually editable bodies). Solids are grouped into per-run
compounds so the assembly arrives with a basic product hierarchy.

The OCP backend is heavy and optional; :meth:`is_available` guards usage so the
rest of the engine works without it.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from ..domain.enums import ExportFormat
from ..domain.scene import SceneDocument
from .base import BackendUnavailableError, Exporter, ExporterError
from .primitives import Box, Cylinder, Sphere, element_to_primitive
from .vecmath import cross, perpendicular, unit


class StepExporter(Exporter):
    format = ExportFormat.STEP
    media_type = "application/step"
    file_ext = "step"

    @classmethod
    def is_available(cls) -> bool:
        try:
            import OCP.BRepPrimAPI  # noqa: F401
            return True
        except ImportError:
            return False

    def export(self, scene: SceneDocument) -> bytes:
        if not self.is_available():
            raise BackendUnavailableError(
                "STEP export requires OpenCASCADE. Install with: "
                "pip install cadquery-ocp")
        try:
            from OCP.BRep import BRep_Builder
            from OCP.Interface import Interface_Static
            from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
            from OCP.TopoDS import TopoDS_Compound
        except ImportError as exc:  # pragma: no cover
            raise ExporterError("OCP STEP API unavailable") from exc

        builder = BRep_Builder()

        # Build each run's compound fully BEFORE nesting it: OpenCASCADE freezes
        # a compound once it is added to a parent, blocking further additions.
        runs: dict[str, TopoDS_Compound] = {}
        for element in scene.elements:
            run_id = self.run_id_of(element.id)
            if run_id not in runs:
                comp = TopoDS_Compound()
                builder.MakeCompound(comp)
                runs[run_id] = comp
            solid = self._solid(element_to_primitive(element))
            if solid is not None:
                builder.Add(runs[run_id], solid)

        top = TopoDS_Compound()
        builder.MakeCompound(top)
        for comp in runs.values():
            builder.Add(top, comp)

        Interface_Static.SetCVal_s("write.step.unit", "MM")
        writer = STEPControl_Writer()
        writer.Transfer(top, STEPControl_AsIs)

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model.step"
            writer.Write(str(path))
            return path.read_bytes()

    # -- geometry -------------------------------------------------------------
    def _solid(self, prim):
        from OCP.BRepPrimAPI import (
            BRepPrimAPI_MakeBox,
            BRepPrimAPI_MakeCylinder,
            BRepPrimAPI_MakeSphere,
        )
        from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt

        if isinstance(prim, Cylinder):
            ax2 = gp_Ax2(gp_Pnt(*prim.start), gp_Dir(*prim.axis),
                         gp_Dir(*perpendicular(prim.axis)))
            return BRepPrimAPI_MakeCylinder(ax2, prim.radius, prim.length).Shape()
        if isinstance(prim, Box):
            axis = unit(prim.start, prim.end)
            lx = perpendicular(axis)
            ly = cross(axis, lx)
            corner = tuple(prim.start[i] - lx[i] * prim.width / 2
                           - ly[i] * prim.height / 2 for i in range(3))
            ax2 = gp_Ax2(gp_Pnt(*corner), gp_Dir(*axis), gp_Dir(*lx))
            return BRepPrimAPI_MakeBox(ax2, prim.width, prim.height,
                                      prim.length).Shape()
        if isinstance(prim, Sphere):
            return BRepPrimAPI_MakeSphere(gp_Pnt(*prim.center), prim.radius).Shape()
        return None  # pragma: no cover
