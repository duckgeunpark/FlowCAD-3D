"""3D DXF exporter (ezdxf) — AutoCAD / shop-drawing target.

Each component becomes a tessellated 3D MESH on a per-run layer (assembly
grouping), plus a TEXT label at each joint. Centerlines are added on a separate
layer for drafting reference.
"""
from __future__ import annotations

import io

from ..domain.enums import ExportFormat
from ..domain.scene import SceneDocument
from .base import Exporter, ExporterError
from .primitives import Box, Cylinder, Sphere, element_to_primitive
from .vecmath import unit


class DxfExporter(Exporter):
    format = ExportFormat.DXF
    media_type = "application/dxf"
    file_ext = "dxf"

    @classmethod
    def is_available(cls) -> bool:
        try:
            import ezdxf  # noqa: F401
            return True
        except ImportError:
            return False

    def export(self, scene: SceneDocument) -> bytes:
        try:
            import ezdxf
            from ezdxf.render import forms
        except ImportError as exc:  # pragma: no cover
            raise ExporterError("ezdxf is not installed") from exc

        doc = ezdxf.new("R2018", units=4)  # 4 = millimetres
        msp = doc.modelspace()
        doc.layers.add("CENTERLINE", color=8)
        doc.layers.add("LABELS", color=7)

        for element in scene.elements:
            layer = self.run_id_of(element.id)
            if layer not in doc.layers:
                doc.layers.add(layer)
            attribs = {"layer": layer, "true_color": _hex_to_int(element.color)}
            prim = element_to_primitive(element)
            self._render_primitive(forms, msp, prim, attribs)
            self._draw_centerline(msp, prim)
            self._maybe_label(msp, element, prim)

        return _to_bytes(doc)

    # -- geometry -------------------------------------------------------------
    def _render_primitive(self, forms, msp, prim, attribs) -> None:
        if isinstance(prim, Cylinder):
            mesh = forms.cylinder(count=20, radius=prim.radius,
                                  top_center=(0, 0, prim.length))
            matrix = _frame(prim.axis, prim.start)
        elif isinstance(prim, Box):
            mesh = forms.cube(center=True)
            mesh.scale(prim.width, prim.height, prim.length)
            axis = unit(prim.start, prim.end)
            matrix = _frame(axis, prim.center)
        elif isinstance(prim, Sphere):
            mesh = forms.sphere(count=16, stacks=12, radius=prim.radius)
            matrix = _frame((0, 0, 1), prim.center)
        else:  # pragma: no cover
            return
        mesh.render_mesh(msp, dxfattribs=attribs, matrix=matrix)

    def _draw_centerline(self, msp, prim) -> None:
        """Drafting-reference centerline for straight runs (CENTERLINE layer)."""
        if isinstance(prim, (Cylinder, Box)):
            msp.add_line(prim.start, prim.end, dxfattribs={"layer": "CENTERLINE"})

    def _maybe_label(self, msp, element, prim) -> None:
        joint = element.user_data.get("jointNo")
        if not joint:
            return
        center = prim.center if isinstance(prim, (Box, Sphere)) else tuple(
            (prim.start[i] + prim.end[i]) / 2 for i in range(3))
        msp.add_text(
            joint,
            height=max(prim_radius(prim), 30),
            dxfattribs={"layer": "LABELS"},
        ).set_placement((center[0], center[1], center[2]))


def prim_radius(prim) -> float:
    if isinstance(prim, Cylinder):
        return prim.radius
    if isinstance(prim, Sphere):
        return prim.radius
    return max(prim.width, prim.height) / 2


def _frame(zdir, origin):
    """Build a local->world matrix whose +Z is ``zdir`` and origin is ``origin``."""
    from ezdxf.math import Matrix44, Vec3

    z = Vec3(zdir).normalize()
    # pick a stable perpendicular for X
    ref = Vec3(1, 0, 0) if abs(z.x) < 0.9 else Vec3(0, 1, 0)
    x = ref.cross(z).normalize()
    y = z.cross(x).normalize()
    return Matrix44.ucs(ux=x, uy=y, uz=z, origin=Vec3(origin))


def _hex_to_int(hex_color: str) -> int:
    h = hex_color.lstrip("#")
    try:
        return int(h, 16) if len(h) == 6 else 0xCCCCCC
    except ValueError:
        return 0xCCCCCC


def _to_bytes(doc) -> bytes:
    text = io.StringIO()
    doc.write(text)
    return text.getvalue().encode("utf-8")
